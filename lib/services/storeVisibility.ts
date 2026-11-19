import type { SharedAttendance, SharedAttendanceRequest, SharedEmployeePay, SharedFinancialSummary, SharedPayroll, StoreVisibility, StoreVisibilityScopes } from '../../types';
import type { AttendanceCallOptions } from './attendanceTransport';
import type { StoreRequestResult } from './storeAccessErrors';
import { invalidStoreRequest, invalidateAccessMutation, isRecord, isRevision, storeRpc } from './storeAccess';

const scopeKeys = ['financial_share_scope','attendance_share_scope','payroll_share_scope'] as const;
const readKeys = ['can_manage_visibility','can_read_financials','can_read_other_attendance','can_read_other_payroll'] as const;
const isScope = (v: unknown) => v === 'none' || v === 'regular_only' || v === 'all_staff';
function validVisibility(d: unknown, storeId: string): boolean {
  return isRecord(d) && d.store_id === storeId && isRevision(d.visibility_revision)
    && scopeKeys.every(k => isScope(d[k])) && readKeys.every(k => typeof d[k] === 'boolean');
}
function projectVisibility(d: StoreVisibility): StoreVisibility {
  const { store_id, visibility_revision, financial_share_scope, attendance_share_scope, payroll_share_scope,
    can_manage_visibility, can_read_financials, can_read_other_attendance, can_read_other_payroll } = d;
  return { store_id, visibility_revision, financial_share_scope, attendance_share_scope, payroll_share_scope,
    can_manage_visibility, can_read_financials, can_read_other_attendance, can_read_other_payroll };
}
export async function getMyStoreVisibility(storeId: string, options?: AttendanceCallOptions): Promise<StoreRequestResult<StoreVisibility>> {
  if (!storeId) return invalidStoreRequest();
  const result = await storeRpc<StoreVisibility>('get_my_store_visibility', { p_store_id: storeId }, d => validVisibility(d, storeId), options);
  return result.status === 'success' ? { ...result, data: projectVisibility(result.data) } : result;
}
/** 세 설정을 같은 revision으로 원자 저장한다. 충돌 시 재조회하고 새 사용자 확인 후 저장한다. */
export async function setStoreVisibility(storeId: string, scopes: StoreVisibilityScopes, expectedRevision: string, options?: AttendanceCallOptions): Promise<StoreRequestResult<StoreVisibility>> {
  if (!storeId || !isRevision(expectedRevision) || !scopes || !scopeKeys.every(k => isScope(scopes[k]))) return invalidStoreRequest();
  const result = await storeRpc<StoreVisibility>('set_store_visibility', { p_store_id: storeId,
    p_financial_scope: scopes.financial_share_scope, p_attendance_scope: scopes.attendance_share_scope,
    p_payroll_scope: scopes.payroll_share_scope, p_expected_revision: expectedRevision }, d => validVisibility(d, storeId), options);
  return invalidateAccessMutation(storeId, result.status === 'success' ? { ...result, data: projectVisibility(result.data) } : result);
}
export interface SharedPageQuery { storeId: string; pageSize?: number; offset?: number; options?: AttendanceCallOptions }
export interface SharedPeriodQuery extends SharedPageQuery { fromDate: string; toDate: string }
export interface SharedPayrollQuery extends SharedPageQuery { yearMonth: string }
/** access는 조회 직전 설정 스냅샷이다. 각 RPC는 현재 권한으로 다시 필터링한다. */
export interface SharedPage<T> { access: 'store' | 'self_only'; rows: T[]; nextOffset: number | null }
const validMonth = (v: string) => /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(v);
function validDate(v: string): boolean {
  const n = Date.parse(`${v}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === v;
}
function validPage(q: SharedPageQuery): boolean {
  return !!q.storeId && Number.isInteger(q.pageSize ?? 200) && (q.pageSize ?? 200) >= 1 && (q.pageSize ?? 200) <= 500
    && Number.isInteger(q.offset ?? 0) && (q.offset ?? 0) >= 0 && (q.offset ?? 0) <= 10000;
}
function validPeriod(q: SharedPeriodQuery): boolean {
  return validPage(q) && validDate(q.fromDate) && validDate(q.toDate) && q.toDate >= q.fromDate
    && (Date.parse(q.toDate) - Date.parse(q.fromDate)) / 86400000 <= 366;
}
type FieldKind = 'text' | 'nullable_text' | 'amount' | 'flags';
type Shape = Record<string, FieldKind>;
const person = { employee_id: 'text', employee_name: 'text' } as const;
const attendanceShape: Shape = { ...person, kind: 'text', punched_at: 'text', work_date: 'text', flags: 'flags', status: 'text' };
const requestShape: Shape = { ...person, kind: 'text', requested_time: 'nullable_text', work_date: 'nullable_text', status: 'text' };
const payrollShape: Shape = { ...person, year_month: 'text', gross: 'amount', applied_hourly_wage: 'amount' };
const employeePayShape: Shape = { ...person, base_salary: 'amount', hourly_wage: 'amount' };
const financialShape: Shape = { store_id: 'text', year_month: 'text', revenue: 'amount', purchase_cost: 'amount', labor_cost: 'amount', fixed_expense: 'amount', variable_expense: 'amount', operating_profit: 'amount' };
function validField(v: unknown, kind: FieldKind): boolean {
  if (kind === 'text') return typeof v === 'string';
  if (kind === 'nullable_text') return v === null || typeof v === 'string';
  if (kind === 'flags') return Array.isArray(v) && v.every(x => typeof x === 'string');
  return v === null || typeof v === 'number' && Number.isFinite(v);
}
function validRows(d: unknown, shape: Shape): boolean {
  return Array.isArray(d) && d.every(row => isRecord(row) && Object.entries(shape).every(([k, kind]) => validField(row[k], kind)));
}
function projectRows<T>(d: unknown[], shape: Shape): T[] {
  return d.map(row => Object.fromEntries(Object.keys(shape).map(k => [k, (row as Record<string, unknown>)[k]])) as T);
}
async function sharedPage<T>(name: string, q: SharedPageQuery, args: Record<string, unknown>, shape: Shape, permission: 'can_read_other_attendance' | 'can_read_other_payroll'): Promise<StoreRequestResult<SharedPage<T>>> {
  if (!validPage(q)) return invalidStoreRequest();
  const visibility = await getMyStoreVisibility(q.storeId, q.options);
  if (visibility.status !== 'success') return visibility;
  const size = q.pageSize ?? 200, offset = q.offset ?? 0;
  const result = await storeRpc<unknown[]>(name, { p_store_id: q.storeId, ...args, p_limit: size, p_offset: offset }, d => validRows(d, shape), q.options);
  if (result.status !== 'success') return result;
  return { status: 'success', data: { access: visibility.data[permission] ? 'store' : 'self_only', rows: projectRows<T>(result.data, shape),
    nextOffset: result.data.length === size && offset + size <= 10000 ? offset + size : null } };
}
export function getSharedAttendance(q: SharedPeriodQuery): Promise<StoreRequestResult<SharedPage<SharedAttendance>>> {
  if (!validPeriod(q)) return Promise.resolve(invalidStoreRequest());
  return sharedPage('get_shared_attendance', q, { p_from: q.fromDate, p_to: q.toDate }, attendanceShape, 'can_read_other_attendance');
}
export function getSharedAttendanceRequests(q: SharedPeriodQuery): Promise<StoreRequestResult<SharedPage<SharedAttendanceRequest>>> {
  if (!validPeriod(q)) return Promise.resolve(invalidStoreRequest());
  return sharedPage('get_shared_attendance_requests', q, { p_from: q.fromDate, p_to: q.toDate }, requestShape, 'can_read_other_attendance');
}
export function getSharedPayroll(q: SharedPayrollQuery): Promise<StoreRequestResult<SharedPage<SharedPayroll>>> {
  if (!validMonth(q.yearMonth)) return Promise.resolve(invalidStoreRequest());
  return sharedPage('get_shared_payroll', q, { p_year_month: q.yearMonth }, payrollShape, 'can_read_other_payroll');
}
export function getSharedEmployeePay(q: SharedPageQuery): Promise<StoreRequestResult<SharedPage<SharedEmployeePay>>> {
  return sharedPage('get_shared_employee_pay', q, {}, employeePayShape, 'can_read_other_payroll');
}
export async function getSharedFinancialSummary(storeId: string, yearMonth: string, options?: AttendanceCallOptions): Promise<StoreRequestResult<SharedFinancialSummary | null>> {
  if (!storeId || !validMonth(yearMonth)) return invalidStoreRequest();
  const result = await storeRpc<unknown[]>('get_shared_financial_summary', { p_store_id: storeId, p_year_month: yearMonth },
    d => validRows(d, financialShape) && Array.isArray(d) && d.length <= 1 && d.every(row => row.store_id === storeId && row.year_month === yearMonth), options);
  return result.status === 'success' ? { ...result, data: projectRows<SharedFinancialSummary>(result.data, financialShape)[0] ?? null } : result;
}

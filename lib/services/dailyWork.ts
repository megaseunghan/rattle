import { DailyWorkHistory, DailyWorkRecord, DailyWorkSnapshot, Employee, Payroll } from '../../types';
import { supabase } from '../supabase';
import { calculatePayroll } from './payroll';
import { invalidateCachedStore } from './cacheInvalidation';
import { UserFacingError } from '../utils/error';
import { isWageDate } from '../utils/wageCondition';

export function parseDailyMinutes(value: string): number {
  if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(Number(value)) || Number(value) > 1440) {
    throw new UserFacingError('하루 근무시간을 0~1,440 사이의 정수 분으로 입력해 주세요.');
  }
  return Number(value);
}
export function dailyWorkSnapshot(rows: DailyWorkRecord[]): DailyWorkSnapshot[] {
  return [...rows].sort((a, b) => a.work_date.localeCompare(b.work_date)).map(({ id, revision, work_date, worked_minutes, applied_hourly_wage, gross, status }) =>
    ({ id, revision, work_date, worked_minutes: Number(worked_minutes), applied_hourly_wage: Number(applied_hourly_wage), gross: Number(gross), status }));
}
export function dailyWorkTotals(rows: DailyWorkSnapshot[]) {
  const approved = rows.filter(row => row.status === 'approved');
  return { minutes: approved.reduce((sum, row) => sum + Number(row.worked_minutes), 0), gross: approved.reduce((sum, row) => sum + Number(row.gross), 0),
    pending: rows.filter(row => row.status !== 'approved').length };
}
function fail(error: { message?: string }) {
  const code = error.message ?? '';
  const message = code.includes('CHANGED') ? '다른 곳에서 내역이 변경됐어요. 다시 불러온 뒤 확인해 주세요.'
    : code.includes('RATE_REQUIRED') ? '해당 날짜에 적용할 시급이 없어요. 관리자에게 시급 등록을 요청해 주세요.'
    : code.includes('REVIEW_REQUIRED') ? '모든 날짜의 근무시간을 확인한 뒤 월 급여에 반영해 주세요.'
    : code.includes('FORBIDDEN') ? '근무시간을 변경할 권한이 없어요.'
    : code.includes('LEGACY_OVERWRITE') ? '일별 기록으로 작성한 급여예요. 일별 근무시간에서 수정해 주세요.'
    : '처리하지 못했어요. 입력값과 연결 상태를 확인하고 다시 시도해 주세요.';
  throw new UserFacingError(message);
}
function monthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new UserFacingError('대상 월을 확인해 주세요.');
  const [year, value] = month.split('-').map(Number);
  const next = value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, '0')}`;
  return { from: `${month}-01`, to: `${next}-01` };
}
export async function getDailyWork(storeId: string, employeeId: string, month: string): Promise<DailyWorkRecord[]> {
  const { from, to } = monthBounds(month);
  const { data, error } = await supabase.from('payroll_daily_work').select('*').eq('store_id', storeId).eq('employee_id', employeeId).gte('work_date', from).lt('work_date', to).order('work_date');
  if (error) fail(error);
  return (data ?? []) as DailyWorkRecord[];
}
export async function getDailyWorkHistory(storeId: string, employeeId: string, date: string): Promise<DailyWorkHistory[]> {
  const { data, error } = await supabase.from('payroll_daily_work_history').select('*').eq('store_id', storeId).eq('employee_id', employeeId).eq('work_date', date).order('changed_at', { ascending: false }).limit(100);
  if (error) fail(error);
  return (data ?? []) as DailyWorkHistory[];
}
export async function saveDailyWork(employeeId: string, date: string, minutes: string, note: string, revision?: number): Promise<DailyWorkRecord> {
  if (!isWageDate(date)) throw new UserFacingError('근무일을 YYYY-MM-DD 형식으로 입력해 주세요.');
  const value = parseDailyMinutes(minutes);
  if (!note.trim() || note.trim().length > 1000) throw new UserFacingError('입력 근거 또는 수정 사유를 1~1,000자로 적어 주세요.');
  const { data, error } = await supabase.rpc('save_daily_work', { p_employee_id: employeeId, p_work_date: date, p_minutes: value, p_note: note.trim(), p_revision: revision ?? null });
  if (error) fail(error);
  return data as DailyWorkRecord;
}
export async function reviewDailyWork(row: DailyWorkRecord, status: 'approved' | 'rejected', note: string): Promise<DailyWorkRecord> {
  if (status === 'rejected' && !note.trim()) throw new UserFacingError('반려 사유를 적어 주세요.');
  const { data, error } = await supabase.rpc('review_daily_work', { p_id: row.id, p_revision: row.revision, p_status: status, p_note: note.trim() });
  if (error) fail(error);
  return data as DailyWorkRecord;
}
export async function applyDailyPayroll(employee: Employee, month: string, rows: DailyWorkRecord[], previous?: Payroll): Promise<Payroll & { cacheRefreshFailed?: boolean }> {
  if (previous && (previous.employee_id !== employee.id || previous.store_id !== employee.store_id || previous.year_month !== month)) throw new UserFacingError('직원과 대상 월을 다시 확인해 주세요.');
  const snapshot = dailyWorkSnapshot(rows);
  const totals = dailyWorkTotals(snapshot);
  if (!snapshot.length || totals.pending) throw new UserFacingError('모든 날짜의 근무시간을 확인한 뒤 월 급여에 반영해 주세요.');
  const calculated = await calculatePayroll(employee, { minutes: 0, hourlyWage: 1 }, month, totals.gross);
  const { data, error } = await supabase.rpc('apply_daily_payroll', { p_employee_id: employee.id, p_year_month: month, p_snapshot: snapshot, p_calculated: calculated, p_revision: previous?.revision ?? null });
  if (error) fail(error);
  const saved = data as Payroll;
  try { await invalidateCachedStore(employee.store_id); }
  catch { return { ...saved, cacheRefreshFailed: true }; }
  return saved;
}

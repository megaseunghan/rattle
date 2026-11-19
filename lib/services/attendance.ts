import type {
  AttendanceCorrectionStatus, AttendanceCorrectionWithHistory, AttendancePage, AttendancePeriodQuery,
  AttendancePunchWithEmployee, AttendanceRpcArgs, AttendanceRpcContracts, AttendanceRpcResult, AttendanceScanner,
} from '../../types';
import { ATTENDANCE_WORK_CACHE_DOMAINS } from './attendanceWorkRecord';
import { supabase } from '../supabase';
import { STORE_ACCESS_CACHE_DOMAINS } from './storeAccess';
import { invalidateCachedStore } from './cacheInvalidation';
import { attendancePreflight, AttendanceCallOptions, AttendanceResult, executeAttendance } from './attendanceTransport';

/** 훅은 queryKeys.store(scope, storeId, domain, ...)의 domain에 이 값을 쓴다. 비밀값은 키/캐시에 넣지 않는다. */
export const ATTENDANCE_CACHE_DOMAINS = {
  punches: 'attendance-punches', corrections: 'attendance-corrections', devices: 'attendance-devices', scanners: 'attendance-scanners',
} as const;
type AuthRpc = Exclude<keyof AttendanceRpcContracts, 'attendance_scanner_status' | 'punch_attendance'>;
const MUTATION_DOMAINS: Partial<Record<AuthRpc, string[]>> = {
  register_attendance_device: [ATTENDANCE_CACHE_DOMAINS.devices],
  approve_attendance_device: [ATTENDANCE_CACHE_DOMAINS.devices],
  revoke_attendance_device: [ATTENDANCE_CACHE_DOMAINS.devices],
  register_attendance_scanner: [ATTENDANCE_CACHE_DOMAINS.scanners],
  revoke_attendance_scanner: [ATTENDANCE_CACHE_DOMAINS.scanners],
  record_manual_attendance: [...ATTENDANCE_WORK_CACHE_DOMAINS],
  request_attendance_correction: [ATTENDANCE_CACHE_DOMAINS.corrections, STORE_ACCESS_CACHE_DOMAINS.requests],
  review_attendance_correction: [...ATTENDANCE_WORK_CACHE_DOMAINS, ATTENDANCE_CACHE_DOMAINS.corrections, STORE_ACCESS_CACHE_DOMAINS.requests],
  cancel_attendance_correction: [ATTENDANCE_CACHE_DOMAINS.corrections, STORE_ACCESS_CACHE_DOMAINS.requests],
};
function validRpcResult(name: AuthRpc, data: unknown): boolean {
  const value = data as Record<string, unknown> | null;
  switch (name) {
    case 'register_attendance_device':
      return !!value && typeof value.device_id === 'string' && typeof value.secret === 'string'
        && (value.status === 'active' || value.status === 'pending');
    case 'issue_attendance_qr':
      return !!value && typeof value.nonce === 'string' && value.nonce.length === 24 && /^[0-9a-f]{24}$/.test(value.nonce)
        && typeof value.expires_at === 'string' && Number.isFinite(Date.parse(value.expires_at));
    case 'register_attendance_scanner':
      return !!value && typeof value.scanner_id === 'string' && typeof value.token === 'string';
    case 'record_manual_attendance':
    case 'request_attendance_correction':
      return typeof data === 'string' && data.length > 0;
    case 'review_attendance_correction':
      return data === null || (typeof data === 'string' && data.length > 0);
    case 'list_store_attendance_devices': return Array.isArray(data);
    default: return data === null;
  }
}
async function authRpc<N extends AuthRpc>(name: N, args: AttendanceRpcArgs<N>, options?: AttendanceCallOptions): Promise<AttendanceResult<AttendanceRpcResult<N>>> {
  const result = await executeAttendance<AttendanceRpcResult<N>>(() => supabase.rpc(name, args), options, data => validRpcResult(name, data));
  const domains = MUTATION_DOMAINS[name];
  if (result.status !== 'success' || !domains) return result;
  const storeId = 'p_store_id' in args ? args.p_store_id : undefined;
  try {
    await invalidateCachedStore(storeId, domains);
    return result;
  } catch {
    // 커밋 성공을 조회 갱신 실패로 덮지 않는다. 훅은 쓰기를 재시도하지 말고 조회만 갱신한다.
    return { ...result, refreshRequired: true };
  }
}
export const registerAttendanceDevice = (args: AttendanceRpcArgs<'register_attendance_device'>, options?: AttendanceCallOptions) => authRpc('register_attendance_device', args, options);
export const issueAttendanceQr = (args: AttendanceRpcArgs<'issue_attendance_qr'>, options?: AttendanceCallOptions) => authRpc('issue_attendance_qr', args, options);
export const approveAttendanceDevice = (args: AttendanceRpcArgs<'approve_attendance_device'>, options?: AttendanceCallOptions) => authRpc('approve_attendance_device', args, options);
export const revokeAttendanceDevice = (args: AttendanceRpcArgs<'revoke_attendance_device'>, options?: AttendanceCallOptions) => authRpc('revoke_attendance_device', args, options);
export const listStoreAttendanceDevices = (args: AttendanceRpcArgs<'list_store_attendance_devices'>, options?: AttendanceCallOptions) => authRpc('list_store_attendance_devices', args, options);
export const registerAttendanceScanner = (args: AttendanceRpcArgs<'register_attendance_scanner'>, options?: AttendanceCallOptions) => authRpc('register_attendance_scanner', args, options);
export const revokeAttendanceScanner = (args: AttendanceRpcArgs<'revoke_attendance_scanner'>, options?: AttendanceCallOptions) => authRpc('revoke_attendance_scanner', args, options);
export const recordManualAttendance = (args: AttendanceRpcArgs<'record_manual_attendance'>, options?: AttendanceCallOptions) => authRpc('record_manual_attendance', args, options);
export const requestAttendanceCorrection = (args: AttendanceRpcArgs<'request_attendance_correction'>, options?: AttendanceCallOptions) => authRpc('request_attendance_correction', args, options);
/** 승인 시 출근·짝 퇴근 2개가 대체될 수 있다. 요청·이력·직원 기간 목록을 함께 재조회하며 한 행만 낙관 갱신하지 않는다. */
export const reviewAttendanceCorrection = (args: AttendanceRpcArgs<'review_attendance_correction'>, options?: AttendanceCallOptions) => authRpc('review_attendance_correction', args, options);
export const cancelAttendanceCorrection = (args: AttendanceRpcArgs<'cancel_attendance_correction'>, options?: AttendanceCallOptions) => authRpc('cancel_attendance_correction', args, options);

const PUNCH_COLUMNS = 'id,event_order,store_id,employee_id,kind,punched_at,work_date,source,is_void,supersedes_id,scanner_id,device_id,flags,note,created_by,created_at';
const EMPLOYEE_COLUMNS = 'employee:employees!employee_id(id,name)';
const CORRECTION_COLUMNS = 'id,store_id,employee_id,action,target_punch_id,kind,requested_time,reason,status,original_snapshot,requested_by,created_at,reviewed_by,reviewed_at,review_note,applied_punch_id,paired_applied_punch_id';
const CORRECTION_WITH_HISTORY = `${CORRECTION_COLUMNS},${EMPLOYEE_COLUMNS},applied_punch:attendance_punches!applied_punch_id(${PUNCH_COLUMNS}),paired_applied_punch:attendance_punches!paired_applied_punch_id(${PUNCH_COLUMNS})`;
const SCANNER_COLUMNS = 'id,store_id,label,created_by,created_at,last_seen_at,revoked_at,revoked_by';
function validDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`))
    && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}
function validPage(input: AttendancePeriodQuery) {
  const { offset = 0, pageSize = 50 } = input;
  return !!input.storeId && validDate(input.fromDate) && validDate(input.toDate) && input.fromDate <= input.toDate
    && Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(pageSize) && pageSize >= 1 && pageSize <= 200;
}
function page<T>(rows: T[], offset: number, pageSize: number): AttendancePage<T> {
  return { rows: rows.slice(0, pageSize), nextOffset: rows.length > pageSize ? offset + pageSize : null };
}
export async function getAttendancePunches(input: AttendancePeriodQuery & { needsReview?: boolean }): Promise<AttendanceResult<AttendancePage<AttendancePunchWithEmployee>>> {
  if (!validPage(input)) return attendancePreflight('ATTENDANCE_INPUT_INVALID');
  const { offset = 0, pageSize = 50 } = input;
  const result = await executeAttendance<AttendancePunchWithEmployee[]>(() => {
    let q = supabase.from('attendance_effective_punches').select(`${PUNCH_COLUMNS},${EMPLOYEE_COLUMNS}`)
      .eq('store_id', input.storeId).gte('work_date', input.fromDate).lte('work_date', input.toDate);
    if (input.employeeId) q = q.eq('employee_id', input.employeeId);
    if (input.needsReview) q = q.neq('flags', '{}');
    return q.order('work_date', { ascending: false }).order('punched_at', { ascending: false }).order('event_order', { ascending: false }).order('id', { ascending: false }).range(offset, offset + pageSize);
  }, { signal: input.signal }, Array.isArray);
  return result.status === 'success' ? { status: 'success', data: page(result.data, offset, pageSize) } : result;
}
export const getAttendanceNeedingReview = (input: AttendancePeriodQuery) => getAttendancePunches({ ...input, needsReview: true });
export function getMyTodayAttendance(storeId: string, employeeId: string, options: { now?: Date; offset?: number; pageSize?: number; signal?: AbortSignal } = {}) {
  const now = options.now ?? new Date();
  const day = Number.isFinite(now.getTime()) ? new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10) : '';
  if (!employeeId) return Promise.resolve(attendancePreflight('ATTENDANCE_INPUT_INVALID'));
  return getAttendancePunches({ storeId, employeeId, fromDate: day, toDate: day, ...options });
}
/** 정정 기간은 요청 생성일의 KST 날짜다. 원본/적용 punch의 work_date와 혼동하지 않는다. */
export async function getAttendanceCorrections(input: AttendancePeriodQuery & { status?: AttendanceCorrectionStatus }): Promise<AttendanceResult<AttendancePage<AttendanceCorrectionWithHistory>>> {
  if (!validPage(input)) return attendancePreflight('ATTENDANCE_INPUT_INVALID');
  const { offset = 0, pageSize = 50 } = input;
  const result = await executeAttendance<AttendanceCorrectionWithHistory[]>(() => {
    let q = supabase.from('attendance_correction_requests').select(CORRECTION_WITH_HISTORY)
      .eq('store_id', input.storeId).gte('created_at', `${input.fromDate}T00:00:00+09:00`).lte('created_at', `${input.toDate}T23:59:59.999999+09:00`);
    if (input.employeeId) q = q.eq('employee_id', input.employeeId);
    if (input.status) q = q.eq('status', input.status);
    return q.order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + pageSize);
  }, { signal: input.signal }, Array.isArray);
  return result.status === 'success' ? { status: 'success', data: page(result.data, offset, pageSize) } : result;
}
/** 승인 RPC가 NULL을 반환하거나 응답이 유실되면 이 조회로 최종 상태를 확인한다. */
export function getAttendanceCorrection(storeId: string, requestId: string, options?: AttendanceCallOptions): Promise<AttendanceResult<AttendanceCorrectionWithHistory | null>> {
  if (!storeId || !requestId) return Promise.resolve(attendancePreflight('ATTENDANCE_INPUT_INVALID'));
  return executeAttendance<AttendanceCorrectionWithHistory | null>(() => supabase.from('attendance_correction_requests')
    .select(CORRECTION_WITH_HISTORY).eq('store_id', storeId).eq('id', requestId).maybeSingle(), options);
}
export async function getAttendanceScanners(storeId: string, options: { offset?: number; pageSize?: number; signal?: AbortSignal } = {}): Promise<AttendanceResult<AttendancePage<AttendanceScanner>>> {
  const { offset = 0, pageSize = 50 } = options;
  if (!validPage({ storeId, fromDate: '2000-01-01', toDate: '2000-01-01', offset, pageSize })) return attendancePreflight('ATTENDANCE_INPUT_INVALID');
  const result = await executeAttendance<AttendanceScanner[]>(() => supabase.from('attendance_scanners').select(SCANNER_COLUMNS)
    .eq('store_id', storeId).order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + pageSize), options, Array.isArray);
  return result.status === 'success' ? { status: 'success', data: page(result.data, offset, pageSize) } : result;
}

/** Resolve an in-app reminder target under the current employee/store RLS. */
export function getAttendancePunch(storeId: string, employeeId: string, punchId: string, signal?: AbortSignal): Promise<AttendanceResult<AttendancePunchWithEmployee | null>> {
  if (!storeId || !employeeId || !punchId) return Promise.resolve(attendancePreflight('ATTENDANCE_INPUT_INVALID'));
  return executeAttendance<AttendancePunchWithEmployee | null>(() => supabase.from('attendance_effective_punches')
    .select(`${PUNCH_COLUMNS},${EMPLOYEE_COLUMNS}`).eq('store_id', storeId).eq('employee_id', employeeId).eq('id', punchId).maybeSingle(), { signal },
  data => data === null || !!data && typeof data === 'object' && typeof (data as AttendancePunchWithEmployee).id === 'string');
}

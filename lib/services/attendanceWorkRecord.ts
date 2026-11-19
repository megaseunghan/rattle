import type { AttendanceAutoRecord, AttendanceWorkRecord, AttendanceWorkFailure, AttendancePage } from '../../types';
import { supabase } from '../supabase';
import { invalidateCachedStore } from './cacheInvalidation';
import { attendancePreflight, AttendanceCallOptions, AttendanceResult, executeAttendance } from './attendanceTransport';

import { ATTENDANCE_WORK_CACHE_DOMAINS } from './attendanceWorkCache';
export { ATTENDANCE_WORK_CACHE_DOMAINS } from './attendanceWorkCache';
export interface AttendanceWorkRetryOptions extends AttendanceCallOptions { previousOutcome?: 'unknown' }
function validRecord(data: unknown, punchId: string): boolean {
  const v = data as Partial<AttendanceWorkRecord> | null;
  return !!v && v.punch_id === punchId && typeof v.effective_punch_id === 'string'
    && typeof v.employee_id === 'string' && typeof v.eligible === 'boolean'
    && ['pending', 'completed', 'failed', 'not_applicable'].includes(v.state ?? '')
    && typeof v.work_date === 'string'
    && [v.shift_minutes, v.daily_minutes, v.daily_revision, v.daily_gross, v.applied_hourly_wage].every(x => x === null || (typeof x === 'number' && Number.isFinite(x) && x >= 0))
    && (v.review_status === null || v.review_status === 'pending' || v.review_status === 'approved' || v.review_status === 'rejected');
}
/** 부작용 없는 상태 조회. 실패를 빈 결과나 0분으로 변환하지 않는다. */
export function getAttendanceWorkRecord(punchId: string, options?: AttendanceCallOptions): Promise<AttendanceResult<AttendanceWorkRecord>> {
  if (!punchId) return Promise.resolve(attendancePreflight('ATTENDANCE_INPUT_INVALID'));
  return executeAttendance<AttendanceWorkRecord>(() => supabase.rpc('get_attendance_work_record', { p_punch_id: punchId }), options, data => validRecord(data, punchId));
}
/** 항상 먼저 조회한다. 이전 결과불명 요청은 이번 호출에서 조회로만 해소한다. */
export async function retryAttendanceWorkRecord(storeId: string, punchId: string, options: AttendanceWorkRetryOptions = {}): Promise<AttendanceResult<AttendanceWorkRecord>> {
  if (!storeId) return attendancePreflight('ATTENDANCE_INPUT_INVALID');
  const before = await getAttendanceWorkRecord(punchId, options);
  if (before.status !== 'success' || options.previousOutcome === 'unknown' || before.data.state !== 'failed') return before;
  const result = await executeAttendance<AttendanceWorkRecord>(() => supabase.rpc('retry_attendance_work_record', { p_punch_id: punchId }), options, data => validRecord(data, punchId));
  if (result.status === 'success' || result.status === 'unknown') {
    try { await invalidateCachedStore(storeId, [...ATTENDANCE_WORK_CACHE_DOMAINS]); }
    catch { if (result.status === 'success') return { ...result, refreshRequired: true }; }
  }
  return result;
}
function toAutoRecord(punchId: string, result: AttendanceResult<AttendanceWorkRecord>): AttendanceAutoRecord | null {
  if (result.status !== 'success') return { punchId, minutes: null, status: result.status === 'unknown' ? 'unknown' : 'error' };
  const row = result.data;
  if (!row.eligible || row.state === 'not_applicable') return null;
  return { punchId, minutes: row.shift_minutes, status: row.state === 'completed' ? 'saved' : row.state === 'failed' ? 'error' : 'pending',
    effectivePunchId: row.effective_punch_id, dailyRevision: row.daily_revision };
}
/** storeId/계정 scope 변경 시 새 adapter를 생성한다. 확인 중은 read로만 해소하며 자동 재전송하지 않는다. */
export function createAttendanceAutoRecordAdapter(storeId: string) {
  const unknown = new Set<string>();
  return {
    async read(punchId: string, signal: AbortSignal): Promise<AttendanceAutoRecord | null> {
      const result = await getAttendanceWorkRecord(punchId, { signal });
      if (result.status === 'success') unknown.delete(punchId);
      else unknown.add(punchId);
      return toAutoRecord(punchId, result.status !== 'success' ? { ...result, status: 'unknown' } : result);
    },
    async retry(punchId: string, signal: AbortSignal): Promise<AttendanceAutoRecord> {
      const result = await retryAttendanceWorkRecord(storeId, punchId, { signal, ...(unknown.has(punchId) ? { previousOutcome: 'unknown' as const } : {}) });
      if (result.status === 'unknown') unknown.add(punchId);
      else if (result.status === 'success') unknown.delete(punchId);
      return toAutoRecord(punchId, result) ?? { punchId, minutes: null, status: 'pending' };
    },
  };
}

export interface AttendanceWorkFailureQuery { storeId: string; yearMonth: string; offset?: number; pageSize?: number }
/** success + rows:[]만 실패 0건이다. 권한/네트워크/계약 불일치는 빈 목록으로 덮지 않는다. */
export async function getAttendanceWorkFailures(input: AttendanceWorkFailureQuery, options?: AttendanceCallOptions): Promise<AttendanceResult<AttendancePage<AttendanceWorkFailure> & { limitReached?: boolean }>> {
  const {storeId, yearMonth, offset = 0, pageSize = 50} = input;
  if (!storeId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth) || yearMonth.startsWith('0000')
    || !Number.isSafeInteger(offset) || offset < 0 || offset >= 1000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 200) return attendancePreflight('ATTENDANCE_INPUT_INVALID');
  const last = new Date(`${yearMonth}-01T00:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const from = `${yearMonth}-01`, to = last.toISOString().slice(0,10);
  const result = await executeAttendance<AttendanceWorkFailure[]>(() => supabase.rpc('get_admin_attendance_work_issues', {
    p_store_id: storeId, p_from: from, p_to: to,
  }).range(offset, Math.min(offset + pageSize, 999)), options, data => Array.isArray(data) && data.every(value => {
    const v = value as Partial<AttendanceWorkFailure> | null;
    return !!v && typeof v.employee_id === 'string' && !!v.employee_id && typeof v.employee_name === 'string'
      && typeof v.work_date === 'string' && v.work_date >= from && v.work_date <= to
      && typeof v.error_code === 'string' && typeof v.updated_at === 'string' && Number.isFinite(Date.parse(v.updated_at))
      && (v.retry_punch_id === null || (typeof v.retry_punch_id === 'string' && !!v.retry_punch_id));
  }));
  return result.status === 'success' ? {status:'success',data:{rows:result.data.slice(0,pageSize),nextOffset:result.data.length > pageSize && offset + pageSize < 1000 ? offset + pageSize : null, ...(offset + result.data.length >= 1000 ? {limitReached:true} : {})}} : result;
}

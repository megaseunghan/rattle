jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('../../lib/services/cacheInvalidation', () => ({ invalidateCachedStore: jest.fn() }));
import { supabase } from '../../lib/supabase';
import { invalidateCachedStore } from '../../lib/services/cacheInvalidation';
import { getAttendanceWorkRecord, retryAttendanceWorkRecord, createAttendanceAutoRecordAdapter } from '../../lib/services/attendanceWorkRecord';
const rpc = supabase.rpc as jest.Mock;
const row = { punch_id: 'out', effective_punch_id: 'out', employee_id: 'employee', eligible: true, state: 'completed', error_code: null,
 clock_in_id: 'in', clock_out_id: 'out', work_date: '2026-11-18', shift_minutes: 60, daily_work_id: 'daily', daily_minutes: 120,
 daily_revision: 2, daily_gross: 20000, applied_hourly_wage: 10000, review_status: 'pending', updated_at: '2026-11-18T01:00:00Z' };
beforeEach(() => { jest.resetAllMocks(); (invalidateCachedStore as jest.Mock).mockResolvedValue(undefined); });
it('읽기는 퇴근 ID만 보내고 자동 기록 완료 상태만 반환한다', async () => {
 rpc.mockResolvedValue({ data: row, error: null });
 expect(await getAttendanceWorkRecord('out')).toEqual({ status: 'success', data: row });
 expect(rpc).toHaveBeenCalledWith('get_attendance_work_record', { p_punch_id: 'out' });
 const adapter = createAttendanceAutoRecordAdapter('store');
 expect(await adapter.read('out', new AbortController().signal)).toMatchObject({ punchId: 'out', minutes: 60, status: 'saved' });
 expect(invalidateCachedStore).not.toHaveBeenCalled();
});
it('확인된 실패 재조회 후에만 멱등 재시도하며 저장 뒤 캐시를 무효화한다', async () => {
 rpc.mockResolvedValueOnce({ data: { ...row, state: 'failed' }, error: null }).mockResolvedValueOnce({ data: row, error: null });
 expect(await retryAttendanceWorkRecord('store', 'out')).toMatchObject({ status: 'success' });
 expect(rpc.mock.calls.map(c => c[0])).toEqual(['get_attendance_work_record', 'retry_attendance_work_record']);
 expect(invalidateCachedStore).toHaveBeenCalledWith('store', expect.arrayContaining(['daily-work', 'payroll', 'financial', 'attendance-punches']));
});
it('이전 응답 유실은 재조회만 하고 재시도 RPC를 보내지 않는다', async () => {
 rpc.mockResolvedValue({ data: { ...row, state: 'failed' }, error: null });
 await retryAttendanceWorkRecord('store', 'out', { previousOutcome: 'unknown' });
 expect(rpc).toHaveBeenCalledTimes(1);
});
it('완료 기록은 재계산하지 않는다', async () => {
 rpc.mockResolvedValue({ data: row, error: null });
 await retryAttendanceWorkRecord('store', 'out'); expect(rpc).toHaveBeenCalledTimes(1);
});
it('응답 유실 뒤 adapter retry는 읽기만 수행하고 null 금액을 0으로 만들지 않는다', async () => {
 const adapter = createAttendanceAutoRecordAdapter('store');
 rpc.mockResolvedValueOnce({ data: { ...row, state: 'failed' }, error: null }).mockRejectedValueOnce(new Error('lost'));
 expect(await adapter.retry('out', new AbortController().signal)).toMatchObject({ status: 'unknown', minutes: null });
 rpc.mockClear(); rpc.mockResolvedValue({ data: { ...row, state: 'failed', shift_minutes: null }, error: null });
 expect(await adapter.retry('out', new AbortController().signal)).toMatchObject({ status: 'error', minutes: null });
 expect(rpc).toHaveBeenCalledTimes(1);
});
it('다른 퇴근 ID나 깨진 성공 응답은 확인 중으로 돌린다', async () => {
 rpc.mockResolvedValue({ data: { ...row, punch_id: 'other' }, error: null });
 expect(await getAttendanceWorkRecord('out')).toMatchObject({ status: 'unknown' });
});
it('저장 후 캐시 실패는 저장 실패로 바꾸지 않는다', async () => {
 rpc.mockResolvedValueOnce({ data: { ...row, state: 'failed' }, error: null }).mockResolvedValueOnce({ data: row, error: null });
 (invalidateCachedStore as jest.Mock).mockRejectedValue(new Error('cache'));
 expect(await retryAttendanceWorkRecord('store', 'out')).toMatchObject({ status: 'success', refreshRequired: true });
});

it('정규직은 자동 기록 대상 없음이며 반려·미확인 분은 0으로 바꾸지 않는다', async () => {
 rpc.mockResolvedValueOnce({ data: { ...row, eligible: false, state: 'not_applicable' }, error: null });
 const adapter = createAttendanceAutoRecordAdapter('store');
 expect(await adapter.read('out', new AbortController().signal)).toBeNull();
 rpc.mockResolvedValue({ data: { ...row, review_status: 'rejected', shift_minutes: null }, error: null });
 expect(await adapter.read('out', new AbortController().signal)).toMatchObject({ minutes: null });
});
it('조회 실패는 확인 중이고 쓰기 없이 원문도 숨긴다', async () => {
 rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'private' } });
 const adapter = createAttendanceAutoRecordAdapter('store');
 expect(await adapter.read('out', new AbortController().signal)).toMatchObject({ status: 'unknown', minutes: null });
 expect(rpc).toHaveBeenCalledTimes(1);
});

it('자동 approved는 사람 확인·명세 작성·정산 단계로 변환하지 않는다', async () => {
 rpc.mockResolvedValue({data:{...row,review_status:'approved'},error:null});
 const record = await createAttendanceAutoRecordAdapter('store').read('out',new AbortController().signal);
 expect(record).toMatchObject({status:'saved',minutes:60});
 expect(record).not.toHaveProperty('managerConfirmed');
 expect(record).not.toHaveProperty('payrollApplied');
 expect(record).not.toHaveProperty('settled');
});

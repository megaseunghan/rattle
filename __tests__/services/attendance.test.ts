jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('../../lib/services/cacheInvalidation', () => ({ invalidateCachedStore: jest.fn().mockResolvedValue(undefined) }));
import { supabase } from '../../lib/supabase';
import { invalidateCachedStore } from '../../lib/services/cacheInvalidation';
import * as attendance from '../../lib/services/attendance';

const rpc = supabase.rpc as jest.Mock;
const from = supabase.from as jest.Mock;
const invalidate = invalidateCachedStore as jest.Mock;
let network: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); network = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('NETWORK_FORBIDDEN')); });
afterEach(() => { expect(network).not.toHaveBeenCalled(); network.mockRestore(); });

function query(data: unknown) {
  const q: Record<string, jest.Mock> = {};
  for (const method of ['select','eq','gte','lte','neq','order','range','abortSignal']) q[method] = jest.fn(() => q);
  q.then = jest.fn((resolve) => Promise.resolve({ data, error: null }).then(resolve));
  from.mockReturnValue(q);
  return q;
}
it.each([
  ['registerAttendanceDevice', { p_label: '테스트폰' }, { device_id: 'd', status: 'active', secret: 'one-time' }, 'register_attendance_device'],
  ['issueAttendanceQr', { p_device_id: 'd' }, { nonce: '000102030405060708090a0b', expires_at: '2026-11-17T01:00:45Z' }, 'issue_attendance_qr'],
  ['approveAttendanceDevice', { p_device_id: 'd' }, null, 'approve_attendance_device'],
  ['revokeAttendanceDevice', { p_device_id: 'd', p_reason: '변경' }, null, 'revoke_attendance_device'],
  ['listStoreAttendanceDevices', { p_store_id: 's' }, [], 'list_store_attendance_devices'],
  ['registerAttendanceScanner', { p_store_id: 's', p_label: '매장폰' }, { scanner_id: 'scanner', token: 'one-time' }, 'register_attendance_scanner'],
  ['revokeAttendanceScanner', { p_scanner_id: 'scanner' }, null, 'revoke_attendance_scanner'],
  ['recordManualAttendance', { p_store_id: 's', p_employee_id: 'e', p_kind: 'clock_in', p_at: 'time', p_reason: '누락' }, 'punch', 'record_manual_attendance'],
  ['requestAttendanceCorrection', { p_store_id: 's', p_employee_id: 'e', p_action: 'void', p_target_punch_id: 'p', p_kind: null, p_time: null, p_reason: '중복' }, 'request', 'request_attendance_correction'],
  ['reviewAttendanceCorrection', { p_request_id: 'r', p_approve: true, p_note: null }, null, 'review_attendance_correction'],
  ['cancelAttendanceCorrection', { p_request_id: 'r' }, null, 'cancel_attendance_correction'],
])('%s는 RPC 인자와 응답을 보존한다', async (name, args, data, rpcName) => {
  rpc.mockResolvedValue({ data, error: null });
  const fn = attendance[name as keyof typeof attendance] as (args: unknown) => Promise<unknown>;
  const result = await fn(args);
  expect(rpc).toHaveBeenCalledWith(rpcName, args);
  expect(result).toMatchObject({ status: 'success', data });
});
it('승인 NULL을 성공한 punch id로 만들지 않는다', async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  expect(await attendance.reviewAttendanceCorrection({ p_request_id: 'r', p_approve: true, p_note: null })).toMatchObject({ status: 'success', data: null });
});
it('내 오늘 기록은 기기 시간대가 아닌 KST 날짜·직원·매장으로 제한한다', async () => {
  const q = query([]);
  await attendance.getMyTodayAttendance('s', 'e', { now: new Date('2026-11-16T15:01:00Z') });
  expect(from).toHaveBeenCalledWith('attendance_effective_punches');
  expect(q.eq).toHaveBeenCalledWith('employee_id', 'e');
  expect(q.eq).toHaveBeenCalledWith('store_id', 's');
  expect(q.gte).toHaveBeenCalledWith('work_date', '2026-11-17');
  expect(q.lte).toHaveBeenCalledWith('work_date', '2026-11-17');
});
it('확인 필요 조회는 flags 필터와 안정적 정렬 및 다음 페이지를 제공한다', async () => {
  const q = query([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  const result = await attendance.getAttendanceNeedingReview({ storeId: 's', fromDate: '2026-11-01', toDate: '2026-11-30', offset: 2, pageSize: 2 });
  expect(q.neq).toHaveBeenCalledWith('flags', '{}');
  expect(q.range).toHaveBeenCalledWith(2, 4);
  expect(q.order).toHaveBeenCalledWith('id', { ascending: false });
  expect(result).toMatchObject({ status: 'success', data: { rows: [{ id: 'a' }, { id: 'b' }], nextOffset: 4 } });
  expect(q.select.mock.calls[0][0]).toContain('employee:employees!employee_id(id,name)');
  expect(q.select.mock.calls[0][0]).not.toMatch(/salary|wage|qr_nonce|\*/);
});
it('정정 결과는 무효·대체되었어도 원본 테이블의 적용 기록을 연결한다', async () => {
  const q = query([{ id: 'r', applied_punch: { id: 'void', is_void: true } }]);
  await attendance.getAttendanceCorrections({ storeId: 's', fromDate: '2026-11-01', toDate: '2026-11-30' });
  expect(from).toHaveBeenCalledWith('attendance_correction_requests');
  expect(q.select.mock.calls[0][0]).toContain('applied_punch:attendance_punches!applied_punch_id(');
  expect(q.select.mock.calls[0][0]).toContain('original_snapshot');
  expect(q.select.mock.calls[0][0]).not.toContain('effective');
});
it('매장폰 목록은 token_hash 권한이 없는 8개 컬럼만 요청한다', async () => {
  const q = query([]);
  await attendance.getAttendanceScanners('s');
  expect(q.select).toHaveBeenCalledWith('id,store_id,label,created_by,created_at,last_seen_at,revoked_at,revoked_by');
});
it('서버 오류는 원문 없이 반환하고 대체 조회로 우회하지 않는다', async () => {
  rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'ATTENDANCE_ADMIN_REQUIRED', details: 'sensitive' } });
  expect(await attendance.approveAttendanceDevice({ p_device_id: 'd' })).toEqual({ status: 'server_rejected', error: { code: 'ATTENDANCE_ADMIN_REQUIRED', category: 'permission' } });
  expect(from).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
});
it('캐시 무효화 실패를 저장 실패로 되돌리지 않는다', async () => {
  rpc.mockResolvedValue({ data: 'p', error: null });
  invalidate.mockRejectedValueOnce(new Error('refresh failed'));
  expect(await attendance.recordManualAttendance({ p_store_id: 's', p_employee_id: 'e', p_kind: 'clock_in', p_at: 'time', p_reason: '누락' })).toMatchObject({ status: 'success', data: 'p', refreshRequired: true });
});
it('잘못된 페이지 범위는 요청 전에 거절한다', async () => {
  expect(await attendance.getAttendancePunches({ storeId: 's', fromDate: '2026-11-02', toDate: '2026-11-01', pageSize: 0 })).toMatchObject({ status: 'preflight_failed' });
  expect(from).not.toHaveBeenCalled();
});
it('직접 기록 후 자동 인건비·급여·홈 조회를 함께 무효화한다', async () => {
  rpc.mockResolvedValue({ data: 'p', error: null });
  await attendance.recordManualAttendance({ p_store_id: 's', p_employee_id: 'e', p_kind: 'clock_in', p_at: 'time', p_reason: '누락' });
  expect(invalidate).toHaveBeenCalledWith('s', expect.arrayContaining(['attendance-punches', 'shared-attendance', 'daily-work', 'payroll', 'financial']));
});
it('기기 변경은 여러 매장에 공유되므로 기기 조회 도메인 전체를 무효화한다', async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await attendance.approveAttendanceDevice({ p_device_id: 'd' });
  expect(invalidate).toHaveBeenCalledWith(undefined, ['attendance-devices']);
});
it('불완전한 등록 성공 응답을 저장 성공으로 만들지 않는다', async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  expect(await attendance.registerAttendanceDevice({ p_label: '폰' })).toMatchObject({ status: 'unknown' });
  expect(invalidate).not.toHaveBeenCalled();
});
it('정정 단건 상태 재조회도 원본 적용 기록과 연결하고 매장을 제한한다', async () => {
  const q = query({ id: 'r', status: 'rejected' });
  q.maybeSingle = jest.fn(() => q);
  expect(await attendance.getAttendanceCorrection('s', 'r')).toMatchObject({ status: 'success', data: { id: 'r', status: 'rejected' } });
  expect(q.eq).toHaveBeenCalledWith('store_id', 's');
  expect(q.eq).toHaveBeenCalledWith('id', 'r');
});
it('마지막 페이지는 다음 offset을 만들지 않는다', async () => {
  query([{ id: 'a' }]);
  expect(await attendance.getAttendancePunches({ storeId: 's', fromDate: '2026-11-01', toDate: '2026-11-30', pageSize: 2 }))
    .toMatchObject({ status: 'success', data: { rows: [{ id: 'a' }], nextOffset: null } });
});
it('조회 실패를 빈 기록으로 바꾸지 않는다', async () => {
  const q = query([]);
  q.then = jest.fn(resolve => Promise.resolve({ data: null, error: { code: '42501', message: 'denied' } }).then(resolve));
  expect(await attendance.getAttendancePunches({ storeId: 's', fromDate: '2026-11-01', toDate: '2026-11-30' }))
    .toMatchObject({ status: 'server_rejected' });
});
it('정정 조회는 짝 적용 ID와 짝 원본·승인 직전 이력 및 짝 적용 원본을 보존한다', async () => {
  const paired = { punch_id: 'out', kind: 'clock_out', punched_at: '2026-11-17T02:00:00Z', work_date: '2026-11-16' };
  const row = { id: 'r', paired_applied_punch_id: 'new-out', original_snapshot: { paired_original: paired, paired_before_apply: paired }, paired_applied_punch: { id: 'new-out', work_date: '2026-11-17' } };
  const q = query([row]);
  expect(await attendance.getAttendanceCorrections({ storeId: 's', fromDate: '2026-11-01', toDate: '2026-11-30' })).toMatchObject({ status: 'success', data: { rows: [row] } });
  expect(q.select.mock.calls[0][0]).toContain('paired_applied_punch_id');
  expect(q.select.mock.calls[0][0]).toContain('paired_applied_punch:attendance_punches!paired_applied_punch_id(');
});

it('동일 시각 출퇴근은 UUID가 아닌 서버 event_order 역순으로 조회한다', async () => {
  const at = '2026-11-18T01:00:00Z';
  const fixtures = [
    { id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', kind: 'clock_in', punched_at: at, work_date: '2026-11-18', event_order: 11 },
    { id: '00000000-0000-0000-0000-000000000001', kind: 'clock_out', punched_at: at, work_date: '2026-11-18', event_order: 12 },
  ];
  const q = query(fixtures);
  q.then.mockImplementation(resolve => {
    const orders = q.order.mock.calls as [string, { ascending: boolean }][];
    const rows = [...fixtures].sort((a, b) => {
      for (const [key, { ascending }] of orders) {
        const av = a[key as keyof typeof a]; const bv = b[key as keyof typeof b];
        if (av !== bv) return (av < bv ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    });
    return Promise.resolve({data: rows,error:null}).then(resolve);
  });
  const result = await attendance.getMyTodayAttendance('s', 'e', { now: new Date(at) });
  expect(q.select.mock.calls[0][0]).toContain('event_order');
  expect(q.order.mock.calls.slice(0,3)).toEqual([
    ['work_date',{ascending:false}], ['punched_at',{ascending:false}], ['event_order',{ascending:false}],
  ]);
  expect(result).toMatchObject({status:'success',data:{rows:[{kind:'clock_out',event_order:12},{kind:'clock_in',event_order:11}]}});
});

it('정정 승인 후 실패 목록·홈/손익 인건비 캐시를 함께 갱신한다', async () => {
 rpc.mockResolvedValue({data:null,error:null});
 await attendance.reviewAttendanceCorrection({p_request_id:'r',p_approve:true,p_note:null});
 expect(invalidate).toHaveBeenCalledWith(undefined,expect.arrayContaining(['attendance-work-issues','financial','payroll','daily-work']));
});

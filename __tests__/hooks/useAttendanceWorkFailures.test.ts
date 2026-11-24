import { act, renderHook } from '@testing-library/react-native';
import { useAttendanceWorkFailures } from '../../lib/hooks/useAttendanceWorkFailures';
import { notifyManager } from '@tanstack/react-query';
import { queryClient as mockSharedQueryClient } from '../../lib/query/client';
// 훅이 공용 쿼리 캐시를 쓰므로 테스트마다 비우고, 화면 알림을 동기로 받아 act 안에서 반영되게 한다.
notifyManager.setScheduler(callback => callback());
beforeEach(() => { mockSharedQueryClient.clear(); });
const mockRead = jest.fn(), mockRetry = jest.fn();
let mockAuth = { user: { id: 'manager' }, store: { id: 'store' }, canManageStore: true, devPreviewMode: 'self', permissionRevision: '1' };
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../../lib/services/attendanceWorkRecord', () => ({ getAttendanceWorkFailures: (...args: unknown[]) => mockRead(...args), retryAttendanceWorkRecord: (...args: unknown[]) => mockRetry(...args) }));
const row = { employee_id: 'employee', employee_name: '가상 직원', work_date: '2026-11-18', error_code: 'DAILY_WORK_RATE_REQUIRED' };
beforeEach(() => {
  mockAuth = { user: { id: 'manager' }, store: { id: 'store' }, canManageStore: true, devPreviewMode: 'self', permissionRevision: '1' };
  mockRetry.mockReset().mockResolvedValue({ status: 'success', data: { state: 'completed' } });
  mockRead.mockReset().mockResolvedValue({ status: 'success', data: { rows: [row], nextOffset: null } });
});
it('관리자에게만 매장·월별 목록을 조회하고 페이지를 이어 받는다', async () => {
  mockRead.mockResolvedValueOnce({ status: 'success', data: { rows: [row], nextOffset: 50 } }).mockResolvedValueOnce({ status: 'success', data: { rows: [{ ...row, employee_id: 'other' }], nextOffset: null } });
  const { result } = renderHook(() => useAttendanceWorkFailures('2026-11', true)); await act(async () => {});
  expect(mockRead).toHaveBeenCalledWith({ storeId: 'store', yearMonth: '2026-11', offset: 0, pageSize: 50 }, { signal: expect.any(AbortSignal) });
  expect(result.current.hasMore).toBe(true); await act(async () => { await result.current.loadMore(); });
  expect(result.current.rows).toHaveLength(2); expect(result.current.hasMore).toBe(false);
});
it.each(['employee', 'preview', 'hidden'])('%s에서는 자동·수동으로도 실패 목록을 조회하지 않는다', async mode => {
  if (mode === 'employee') mockAuth.canManageStore = false;
  if (mode === 'preview') mockAuth.devPreviewMode = 'part_timer';
  const { result } = renderHook(() => useAttendanceWorkFailures('2026-11', mode !== 'hidden'));
  await act(async () => { await result.current.refetch(); }); expect(mockRead).not.toHaveBeenCalled(); expect(result.current.rows).toEqual([]);
});
it('조회 응답 유실은 0건으로 숨기지 않는다', async () => {
  mockRead.mockResolvedValue({ status: 'unknown', error: { code: 'ATTENDANCE_TIMEOUT' } });
  const { result } = renderHook(() => useAttendanceWorkFailures('2026-11', true)); await act(async () => {});
  expect(result.current.rows).toEqual([]); expect(result.current.error).toContain('불러오지 못했어요');
});
it('매장·월 변경은 이전 요청을 취소하고 늦은 응답을 섞지 않는다', async () => {
  let finish!: (value: unknown) => void;
  mockRead.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = renderHook(({ month }: { month: string }) => useAttendanceWorkFailures(month, true), { initialProps: { month: '2026-11' } });
  await act(async () => {}); const signal = mockRead.mock.calls[0][1].signal as AbortSignal;
  mockAuth = { ...mockAuth, store: { id: 'other-store' } }; view.rerender({ month: '2026-12' }); await act(async () => {});
  expect(signal.aborted).toBe(true);
  await act(async () => { finish({ status: 'success', data: { rows: [{ ...row, employee_id: 'stale' }], nextOffset: null } }); });
  expect(view.result.current.rows.some(item => item.employee_id === 'stale')).toBe(false);
});
it('상한 표시를 보존하고 마지막 페이지 뒤에는 추가 조회를 하지 않는다', async () => {
  mockRead.mockResolvedValue({ status: 'success', data: { rows: [row], nextOffset: null, limitReached: true } });
  const { result } = renderHook(() => useAttendanceWorkFailures('2026-11', true)); await act(async () => {});
  expect(result.current.limitReached).toBe(true); await act(async () => { await result.current.loadMore(); }); expect(mockRead).toHaveBeenCalledTimes(1);
});
it('퇴근 원본 ID가 없으면 임의 재시도하지 않고 명시 새로고침만 한다', async () => {
  const { result } = renderHook(() => useAttendanceWorkFailures('2026-11', true)); await act(async () => {});
  await act(async () => { await result.current.retry('employee:2026-11-18'); }); expect(mockRetry).not.toHaveBeenCalled();
  await act(async () => { await result.current.refetch(); }); expect(mockRead).toHaveBeenCalledTimes(2);
});
it('관리자는 목록의 원본 ID로만 재시도하고 결과불명 뒤에는 조회 우선 인자를 전달한다', async () => {
  mockRead.mockResolvedValue({ status: 'success', data: { rows: [{ ...row, retry_punch_id: 'original-out' }], nextOffset: null } });
  mockRetry.mockResolvedValueOnce({ status: 'unknown', error: { code: 'ATTENDANCE_TIMEOUT' } });
  const { result } = renderHook(() => useAttendanceWorkFailures('2026-11', true)); await act(async () => {});
  await act(async () => { await result.current.retry('employee:2026-11-18'); });
  expect(result.current.retryMessage).toContain('확인하고 있어요'); expect(result.current.isRetryUnknown('original-out')).toBe(true);
  await act(async () => { await result.current.retry('employee:2026-11-18'); });
  expect(mockRetry).toHaveBeenLastCalledWith('store', 'original-out', { signal: expect.any(AbortSignal), previousOutcome: 'unknown' });
  expect(result.current.retryMessage).toBe('인건비에 반영했어요'); expect(mockRead).toHaveBeenCalledTimes(3);
});
it('관리 권한이 사라지면 보관된 재시도 콜백도 쓰지 못한다', async () => {
  mockRead.mockResolvedValue({ status: 'success', data: { rows: [{ ...row, retry_punch_id: 'original-out' }], nextOffset: null } });
  const view = renderHook(() => useAttendanceWorkFailures('2026-11', true)); await act(async () => {}); const stale = view.result.current.retry;
  mockAuth = { ...mockAuth, canManageStore: false }; view.rerender({});
  await act(async () => { await stale('employee:2026-11-18'); }); expect(mockRetry).not.toHaveBeenCalled();
});
it('재시도 응답 전 탭을 떠나도 결과불명을 보존해 복귀 후에는 조회부터 한다', async () => {
  mockRead.mockResolvedValue({ status: 'success', data: { rows: [{ ...row, retry_punch_id: 'original-out' }], nextOffset: null } });
  let finish!: (response: unknown) => void;
  mockRetry.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = renderHook(({ active }: { active: boolean }) => useAttendanceWorkFailures('2026-11', active), { initialProps: { active: true } });
  await act(async () => {}); let pending!: Promise<void>;
  await act(async () => { pending = view.result.current.retry('employee:2026-11-18'); });
  const signal = mockRetry.mock.calls[0][2].signal as AbortSignal; view.rerender({ active: false }); expect(signal.aborted).toBe(true);
  await act(async () => { finish({ status: 'unknown', error: { code: 'ATTENDANCE_ABORTED' } }); await pending; });
  view.rerender({ active: true }); await act(async () => {});
  await act(async () => { await view.result.current.retry('employee:2026-11-18'); });
  expect(mockRetry).toHaveBeenLastCalledWith('store', 'original-out', { signal: expect.any(AbortSignal), previousOutcome: 'unknown' });
});

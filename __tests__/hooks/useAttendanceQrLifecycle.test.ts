import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { useAttendanceQr } from '../../lib/hooks/useAttendanceQr';
let mockUser = '', counter = 0;
const mockIssue = jest.fn();
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mockUser }, store: { id: 'store' }, devPreviewMode: 'self', permissionRevision: '1' }) }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn().mockResolvedValue(JSON.stringify({ device_id: 'device', secret: 'fake', status: 'active' })) }));
jest.mock('../../lib/services/attendance', () => ({ issueAttendanceQr: (...args: unknown[]) => mockIssue(...args), registerAttendanceDevice: jest.fn() }));
jest.mock('../../lib/utils/attendanceQr', () => ({ createAttendanceQr: () => 'fake-qr' }));
jest.mock('../../lib/utils/attendanceHmac', () => ({ defaultAttendanceHmacSha256: jest.fn() }));
const listeners = new Set<(state: AppStateStatus) => void>();
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-18T00:00:00Z')); mockUser = `test-${++counter}`;
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  listeners.clear(); jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => { listeners.add(listener); return { remove: () => { listeners.delete(listener); } }; });
  mockIssue.mockReset().mockImplementation(async () => ({ status: 'success', data: { nonce: 'fake', expires_at: new Date(Date.now() + 45_000).toISOString() } }));
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
async function tick(ms: number) { await act(async () => { jest.advanceTimersByTime(ms); }); }
async function app(next: AppStateStatus) {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: next });
  await act(async () => { listeners.forEach(listener => listener(next)); });
}
it('포커스 없는 화면은 마운트·타이머·foreground·수동 콜백 모두 발급하지 않는다', async () => {
  const { result } = renderHook(() => useAttendanceQr('employee', false));
  await tick(90_000); await app('background'); await app('active');
  await act(async () => { await result.current.refresh(); await result.current.register(); });
  expect(mockIssue).not.toHaveBeenCalled();
});
it('백그라운드에서 마운트한 화면도 전경 복귀 전에는 발급하지 않는다', async () => {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' });
  renderHook(() => useAttendanceQr('employee', true)); await tick(90_000);
  expect(mockIssue).not.toHaveBeenCalled(); await app('active'); expect(mockIssue).toHaveBeenCalledTimes(1);
});
it('발급 응답이 늦어도 포커스 왕복 중 같은 요청을 중복 시작하지 않는다', async () => {
  let finish!: (response: unknown) => void;
  mockIssue.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = renderHook(({ focus }: { focus: boolean }) => useAttendanceQr('employee', focus), { initialProps: { focus: true } });
  await act(async () => {});
  for (let n = 0; n < 10; n++) { view.rerender({ focus: false }); view.rerender({ focus: true }); await act(async () => {}); }
  expect(mockIssue).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ status: 'success', data: { nonce: 'fake', expires_at: new Date(Date.now() + 45_000).toISOString() } }); });
  expect(view.result.current.state).toBe('ready'); expect(mockIssue).toHaveBeenCalledTimes(1);
});
it('포커스 해제와 백그라운드는 만료를 지나도 발급을 멈춘다', async () => {
  const { rerender } = renderHook(({ focus }: { focus: boolean }) => useAttendanceQr('employee', focus), { initialProps: { focus: true } });
  await act(async () => {}); expect(mockIssue).toHaveBeenCalledTimes(1);
  rerender({ focus: false }); await tick(90_000); expect(mockIssue).toHaveBeenCalledTimes(1);
  rerender({ focus: true }); await act(async () => {}); expect(mockIssue).toHaveBeenCalledTimes(2);
  await app('background'); await tick(90_000); expect(mockIssue).toHaveBeenCalledTimes(2);
  await app('active'); expect(mockIssue).toHaveBeenCalledTimes(3);
});
it('20회 왕복과 재마운트는 유효 QR을 재사용하고 30초마다 한 번만 갱신한다', async () => {
  const view = renderHook(({ focus }: { focus: boolean }) => useAttendanceQr('employee', focus), { initialProps: { focus: true } });
  await act(async () => {});
  for (let n = 0; n < 20; n++) { view.rerender({ focus: false }); view.rerender({ focus: true }); await act(async () => {}); }
  expect(mockIssue).toHaveBeenCalledTimes(1); view.unmount();
  renderHook(() => useAttendanceQr('employee', true)); await act(async () => {}); expect(mockIssue).toHaveBeenCalledTimes(1);
  await tick(30_000); expect(mockIssue).toHaveBeenCalledTimes(2);
  await tick(29_000); expect(mockIssue).toHaveBeenCalledTimes(2);
  await tick(1_000); expect(mockIssue).toHaveBeenCalledTimes(3);
});
it('RATE_LIMIT은 45초 대기하고 버튼·왕복으로 우회하지 않으며 기한 뒤 한 번만 재시도한다', async () => {
  mockIssue.mockResolvedValue({ status: 'server_rejected', error: { code: 'ATTENDANCE_QR_RATE_LIMIT', category: 'rate_limit' } });
  const view = renderHook(({ focus }: { focus: boolean }) => useAttendanceQr('employee', focus), { initialProps: { focus: true } });
  await act(async () => {}); expect(view.result.current.state).toBe('rate_limited'); expect(view.result.current.retrySeconds).toBe(45);
  for (let n = 0; n < 5; n++) { await act(async () => { await view.result.current.refresh(); }); view.rerender({ focus: false }); view.rerender({ focus: true }); await act(async () => {}); }
  await tick(44_000); expect(mockIssue).toHaveBeenCalledTimes(1); expect(view.result.current.retrySeconds).toBe(1);
  await tick(1_000); expect(mockIssue).toHaveBeenCalledTimes(2);
  await tick(44_000); expect(mockIssue).toHaveBeenCalledTimes(2);
});
it('제한 대기 중 화면을 떠나면 기한 뒤에도 재시도하지 않고 복귀할 때 한 번만 시도한다', async () => {
  mockIssue.mockResolvedValueOnce({ status: 'server_rejected', error: { code: 'ATTENDANCE_QR_RATE_LIMIT' } });
  const view = renderHook(({ focus }: { focus: boolean }) => useAttendanceQr('employee', focus), { initialProps: { focus: true } });
  await act(async () => {}); view.rerender({ focus: false }); await tick(90_000); expect(mockIssue).toHaveBeenCalledTimes(1);
  view.rerender({ focus: true }); await act(async () => {}); expect(mockIssue).toHaveBeenCalledTimes(2); expect(view.result.current.state).toBe('ready');
});

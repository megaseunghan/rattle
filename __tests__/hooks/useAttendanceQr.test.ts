import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useAttendanceQr } from '../../lib/hooks/useAttendanceQr';
let mockMode = 'self'; const mockGet = jest.fn(), mockSet = jest.fn(), mockIssue = jest.fn(), mockRegister = jest.fn();
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'person' }, store: { id: 'store' }, devPreviewMode: mockMode, permissionRevision: '1' }) }));
jest.mock('expo-secure-store', () => ({ getItemAsync: (...a: unknown[]) => mockGet(...a), setItemAsync: (...a: unknown[]) => mockSet(...a), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' }));
jest.mock('../../lib/services/attendance', () => ({ issueAttendanceQr: (...a: unknown[]) => mockIssue(...a), registerAttendanceDevice: (...a: unknown[]) => mockRegister(...a) }));
jest.mock('../../lib/utils/attendanceHmac', () => ({ defaultAttendanceHmacSha256: jest.fn() }));
beforeEach(() => { Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' }); mockMode = 'self'; mockGet.mockReset().mockResolvedValue(null); mockSet.mockReset().mockResolvedValue(undefined); mockIssue.mockReset(); mockRegister.mockReset(); });
it('미등록은 자동으로 기기를 만들지 않고 명시 행동을 기다린다', async () => {
  const { result } = renderHook(() => useAttendanceQr('employee')); await waitFor(() => expect(result.current.state).toBe('unregistered'));
  expect(mockRegister).not.toHaveBeenCalled(); expect(mockIssue).not.toHaveBeenCalled();
});
it('기기 등록 응답 유실을 저장 실패로 표시하거나 재등록하지 않는다', async () => {
  mockRegister.mockResolvedValue({ status: 'unknown' }); const { result } = renderHook(() => useAttendanceQr('employee'));
  await waitFor(() => expect(result.current.state).toBe('unregistered'));
  await act(async () => { await result.current.register(); }); expect(result.current.state).toBe('unknown');
  expect(mockSet).toHaveBeenCalledWith('attendance.device.person', JSON.stringify({ registration_unknown: true }), expect.any(Object));
  mockGet.mockResolvedValue(JSON.stringify({ registration_unknown: true }));
  await act(async () => { await result.current.register(); }); expect(mockRegister).toHaveBeenCalledTimes(1);
});
it('미리보기로 바꾸면 기존 등록 콜백도 서버에 쓰지 못한다', async () => {
  const { result, rerender } = renderHook(() => useAttendanceQr('employee')); await waitFor(() => expect(result.current.state).toBe('unregistered'));
  const oldRegister = result.current.register; mockMode = 'regular'; rerender({});
  await act(async () => { await oldRegister(); }); expect(mockRegister).not.toHaveBeenCalled(); expect(result.current.qr).toBe('');
});
it('등록 요청 뒤 포커스를 잃어도 응답의 자격정보를 보존하고 숨은 화면에서 QR은 발급하지 않는다', async () => {
  let finish!: (value: unknown) => void;
  mockRegister.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = renderHook(({ focused }: { focused: boolean }) => useAttendanceQr('employee', focused), { initialProps: { focused: true } });
  await waitFor(() => expect(view.result.current.state).toBe('unregistered'));
  let pending!: Promise<void>;
  await act(async () => { pending = view.result.current.register(); });
  view.rerender({ focused: false });
  await act(async () => { finish({ status: 'success', data: { device_id: 'new-device', secret: 'fake-secret', status: 'active' } }); await pending; });
  expect(mockSet).toHaveBeenCalledWith('attendance.device.person.new-device', 'fake-secret', expect.any(Object));
  expect(mockSet).toHaveBeenCalledWith('attendance.device.person', JSON.stringify({ device_id: 'new-device', status: 'active' }), expect.any(Object));
  expect(mockIssue).not.toHaveBeenCalled();
});

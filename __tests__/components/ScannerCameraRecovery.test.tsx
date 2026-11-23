import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking, AppState, type AppStateStatus } from 'react-native';
import AttendanceScannerScreen, { CameraSurface } from '../../app/attendance/scanner';
const mockGetPermission = jest.fn(), mockRequestPermission = jest.fn();
jest.mock('expo-camera', () => ({ Camera: { getCameraPermissionsAsync: (...args: unknown[]) => mockGetPermission(...args), requestCameraPermissionsAsync: (...args: unknown[]) => mockRequestPermission(...args) }, CameraView: () => require('react').createElement(require('react-native').View, { testID: 'scanner-camera' }) }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
const mockRecovery = jest.fn();
const mockScanner = { state: 'unknownSetup', title: '등록됐는지 확인하고 있어요', body: '사장님이나 점장님 앱에서 확인해주세요', time: '', canScan: false, ready: false, unresolvedCount: 2, confirmRegistrationRecovery: mockRecovery, refresh: jest.fn(), scan: jest.fn(), clearNotice: jest.fn() };
jest.mock('../../lib/hooks/useAttendanceScanner', () => ({ useAttendanceScanner: () => mockScanner }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const listeners = new Set<(state: AppStateStatus) => void>();
async function foreground(next: AppStateStatus) {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: next });
  await act(async () => { listeners.forEach(listener => listener(next)); });
}
beforeEach(() => {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  listeners.clear(); mockGetPermission.mockReset(); mockRequestPermission.mockReset();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => { listeners.add(listener); return { remove: () => { listeners.delete(listener); } }; });
});
afterEach(() => jest.restoreAllMocks());
it('설정에서 거절을 허용으로 바꿔 복귀하면 버튼을 다시 누르지 않아도 카메라를 연다', async () => {
  mockGetPermission.mockResolvedValueOnce({ granted: false }).mockResolvedValue({ granted: true });
  const view = render(<CameraSurface onScan={jest.fn()} onAvailability={jest.fn()} />);
  await waitFor(() => expect(view.getByText(/카메라로 QR을 읽어요|카메라 권한이 꺼져 있어요/)).toBeTruthy());
  await foreground('background'); await foreground('active');
  await waitFor(() => expect(view.getByTestId('scanner-camera')).toBeTruthy());
  expect(mockRequestPermission).not.toHaveBeenCalled(); expect(mockGetPermission).toHaveBeenCalledTimes(2);
});
it('설정에서 권한을 회수하고 복귀하면 이전 카메라를 다시 마운트하지 않는다', async () => {
  mockGetPermission.mockResolvedValueOnce({ granted: true }).mockResolvedValue({ granted: false });
  const view = render(<CameraSurface onScan={jest.fn()} onAvailability={jest.fn()} />);
  await waitFor(() => expect(view.getByTestId('scanner-camera')).toBeTruthy());
  await foreground('background'); expect(view.queryByTestId('scanner-camera')).toBeNull();
  await foreground('active'); await waitFor(() => expect(view.getByText(/카메라로 QR을 읽어요|카메라 권한이 꺼져 있어요/)).toBeTruthy());
  expect(view.queryByTestId('scanner-camera')).toBeNull();
});
it('복귀 뒤 늦은 이전 허용 응답은 새 거절 상태를 덮어쓰지 않는다', async () => {
  let finish!: (permission: { granted: boolean }) => void;
  mockGetPermission.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ granted: false });
  const view = render(<CameraSurface onScan={jest.fn()} onAvailability={jest.fn()} />);
  await foreground('background'); await foreground('active');
  await waitFor(() => expect(view.getByText(/카메라로 QR을 읽어요|카메라 권한이 꺼져 있어요/)).toBeTruthy());
  await act(async () => { finish({ granted: true }); }); expect(view.queryByTestId('scanner-camera')).toBeNull();
});

it('등록 복구는 관리자 확인 안내를 거친 명시적 행동이고 미확인 출퇴근 건수는 남는다', async () => {
  mockRecovery.mockClear(); mockGetPermission.mockResolvedValue({ granted: true });
  const view = render(<AttendanceScannerScreen />);
  await waitFor(() => expect(view.getByText('새 등록 준비하기')).toBeTruthy());
  await foreground('background');
  mockGetPermission.mockResolvedValue({ granted: false });
  await foreground('active');
  expect(view.getByText(/카메라로 QR을 읽어요|카메라 권한이 꺼져 있어요/)).toBeTruthy();
  expect(view.getByText('등록됐는지 확인하고 있어요')).toBeTruthy();
  expect(view.getByText('확인할 기록 2건이 있어요')).toBeTruthy();
  fireEvent.press(view.getByText('새 등록 준비하기'));
  expect(view.getByText('사장님이나 점장님 앱에서 확인했나요?')).toBeTruthy(); expect(mockRecovery).not.toHaveBeenCalled();
  fireEvent.press(view.getByText('닫기')); expect(mockRecovery).not.toHaveBeenCalled();
  fireEvent.press(view.getByText('새 등록 준비하기')); fireEvent.press(view.getByText('새 QR 찍기'));
  expect(mockRecovery).toHaveBeenCalledTimes(1);
});

it('첫 권한 요청과 재요청을 거쳐 영구 거절되면 설정 버튼을 제공한다', async () => {
  const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  mockGetPermission.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
  mockRequestPermission.mockResolvedValueOnce({ status: 'denied', canAskAgain: true })
    .mockResolvedValueOnce({ status: 'denied', canAskAgain: false });
  const view = render(<CameraSurface onScan={jest.fn()} onAvailability={jest.fn()} />);
  for (let request = 0; request < 2; request++) {
    const button = await view.findByText('계속');
    await act(async () => { fireEvent.press(button); });
  }
  expect(mockRequestPermission).toHaveBeenCalledTimes(2);
  expect(open).not.toHaveBeenCalled();
  fireEvent.press(view.getByText('설정 열기'));
  expect(open).toHaveBeenCalledTimes(1);
});

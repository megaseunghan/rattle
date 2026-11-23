import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
const mockAuthStorageRead = jest.fn(), mockAuthRefresh = jest.fn(), mockGeneralModule = jest.fn();
const mockLoad = jest.fn(); let mockPath = '/attendance/scanner';
const mockStatus = jest.fn(), mockLeave = jest.fn();
const mockReplace = jest.fn(() => { mockPath = '/login'; });
const registration = { scannerId: 'scanner', storeId: 'store', storeName: '가상 매장', label: '매장폰' };
jest.mock('../../lib/contexts/AuthContext', () => { mockAuthStorageRead(); mockAuthRefresh(); throw new Error('App auth must not load on the scanner branch'); });
jest.mock('../../lib/components/ApplicationRoot', () => { mockGeneralModule(); return { __esModule: true, default: () => require('react').createElement(require('react-native').Text, null, '일반 앱') }; });
jest.mock('../../lib/services/attendanceScannerEnrollment', () => ({ loadStoredAttendanceScannerRegistration: (...args: unknown[]) => mockLoad(...args), scannerStatus: () => mockStatus(), leaveScannerMode: () => mockLeave() }));
jest.mock('expo-router', () => ({ Navigator: ({ children }: any) => children, router: { replace: mockReplace }, usePathname: () => mockPath, SplashScreen: { preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() } }));
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-camera', () => ({ Camera: { getCameraPermissionsAsync: async () => ({ granted: false }) } }));
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: ({ children }: any) => children }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../lib/utils/applyGlobalFont', () => ({ applyGlobalFont: jest.fn() }));
beforeEach(() => mockStatus.mockResolvedValue({ status: 'success', data: registration }));
it('기존 계정 세션이 있는 매장폰 cold start는 일반 인증 모듈과 저장소·갱신을 열지 않는다', async () => {
  // The injected app-auth module models a stored session and fails if evaluated.
  let finish!: (value: typeof registration) => void;
  mockLoad.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(registration);
  const Root = require('../../app/_layout').default;
  const view = render(<Root />);
  expect(mockGeneralModule).not.toHaveBeenCalled(); expect(mockAuthStorageRead).not.toHaveBeenCalled();
  await act(async () => { finish(registration); });
  await waitFor(() => expect(view.getByText(/카메라로 QR을 읽어요|카메라 권한이 꺼져 있어요/)).toBeTruthy());
  expect(view.queryByText('일반 앱으로 돌아가기')).toBeNull();
  expect(mockGeneralModule).not.toHaveBeenCalled(); expect(mockAuthStorageRead).not.toHaveBeenCalled(); expect(mockAuthRefresh).not.toHaveBeenCalled();
});
it('미등록 일반 앱은 로컬 판별이 끝난 뒤에만 일반 가지를 평가한다', async () => {
  mockPath = '/'; mockLoad.mockResolvedValue(null);
  const Root = require('../../app/_layout').default;
  const view = render(<Root />); expect(mockGeneralModule).not.toHaveBeenCalled();
  await waitFor(() => expect(view.getByText('일반 앱')).toBeTruthy()); expect(mockGeneralModule).toHaveBeenCalledTimes(1);
});

it.each([true, false])('해제 또는 미등록 기기에서 복귀를 누르면 일반 앱이 열린다 (자격 보유 %s)', async hasCredential => {
  mockPath = '/attendance/scanner';
  mockLoad.mockResolvedValue(hasCredential ? registration : null);
  mockStatus.mockResolvedValue({ status: 'server_rejected', error: { code: 'ATTENDANCE_SCANNER_REVOKED' } });
  mockLeave.mockResolvedValueOnce('unknown').mockImplementationOnce(async () => {
    mockLoad.mockResolvedValue(null);
    return 'left';
  });
  const Root = require('../../app/_layout').default;
  const view = render(<Root />);
  const leave = await view.findByText('일반 앱으로 돌아가기');
  fireEvent.press(leave);
  await view.findByText('확인하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해주세요');
  expect(view.queryByText('일반 앱')).toBeNull();
  fireEvent.press(view.getByText('일반 앱으로 돌아가기'));
  await view.findByText('일반 앱');
  expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
});

import { Slot } from 'expo-router';
import { Text } from 'react-native';
import { fireEvent, renderRouter } from 'expo-router/testing-library';
import RootLayout from '../../app/_layout';

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('../../lib/utils/applyGlobalFont', () => ({ applyGlobalFont: jest.fn() }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-camera', () => ({ Camera: { getCameraPermissionsAsync: async () => ({ granted: false }) } }));
const mockLoad = jest.fn();
jest.mock('../../lib/services/attendanceScannerEnrollment', () => ({
  loadStoredAttendanceScannerRegistration: () => mockLoad(),
  scannerStatus: async () => ({ status: 'server_rejected', error: { code: 'ATTENDANCE_SCANNER_REVOKED' } }),
  leaveScannerMode: async () => {
    mockLoad.mockResolvedValue(null);
    return 'left';
  },
}));
jest.mock('../../lib/components/ApplicationRoot', () => ({
  __esModule: true,
  default: () => require('react').createElement(require('expo-router').Slot),
}));

it.each(['/attendance/scanner', '/settings/account', '/login'])('%s로 실행한 매장폰에서 실제 라우터가 로그인 경로를 연다', async initialUrl => {
  mockLoad.mockResolvedValue(initialUrl === '/attendance/scanner' ? null : { scannerId: 'scanner' });
  const view = renderRouter({
    _layout: RootLayout,
    'attendance/scanner': () => null,
    'settings/account': () => <Text>계정 설정</Text>,
    '(auth)/_layout': () => <Slot />,
    '(auth)/login': () => <Text>일반 로그인</Text>,
  }, { initialUrl });
  fireEvent.press(await view.findByText('일반 앱으로 돌아가기', {}, { timeout: 10000 }));
  await view.findByText('일반 로그인', {}, { timeout: 10000 });
  expect(view.getPathname()).toBe('/login');
});

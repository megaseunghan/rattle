import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';
import AttendanceScannerScreen from '../../app/attendance/scanner';
import * as Enrollment from '../../lib/services/attendanceScannerEnrollment';

jest.mock('../../lib/services/attendanceScannerEnrollment', () => ({
  loadStoredAttendanceScannerRegistration: jest.fn(), scannerStatus: jest.fn(), scan: jest.fn(),
  exchangeAndStoreAttendanceScannerPairingQr: jest.fn(),
}));
jest.mock('expo-camera', () => ({
  Camera: { getCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }) },
  CameraView: (props: object) => require('react').createElement(require('react-native').View, { ...props, testID: 'camera' }),
}));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const registration = { scannerId: 'scanner', storeId: 'store', storeName: '가상 매장', label: '매장폰' };
const statusOk = { status: 'success', data: registration };
const receipt = { status: 'saved', data: { employee_name: '가상 직원', kind: 'clock_in', punched_at: '2026-11-18T09:00:00+09:00', duplicate: false } };
const listeners = new Set<(state: AppStateStatus) => void>();
let readerChanged: (enabled: boolean) => void;
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); listeners.clear();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => { listeners.add(listener); return { remove: () => { listeners.delete(listener); } }; });
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  // React Native overloads this API; this screen subscribes only to the boolean reader event.
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_: string, listener: (enabled: boolean) => void) => {
    readerChanged = listener; return { remove: jest.fn() };
  }) as unknown as typeof AccessibilityInfo.addEventListener);
  (Enrollment.loadStoredAttendanceScannerRegistration as jest.Mock).mockResolvedValue(registration);
  (Enrollment.scannerStatus as jest.Mock).mockResolvedValue(statusOk);
  (Enrollment.scan as jest.Mock).mockResolvedValue(receipt);
  (Enrollment.exchangeAndStoreAttendanceScannerPairingQr as jest.Mock).mockResolvedValue(statusOk);
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
async function successfulPunch() {
  const view = render(<AttendanceScannerScreen />);
  await act(async () => {});
  expect(view.getByTestId('camera').props.onBarcodeScanned).toEqual(expect.any(Function));
  await act(async () => { fireEvent(view.getByTestId('camera'), 'barcodeScanned', { data: 'employee-A' }); });
  expect(Enrollment.scan).toHaveBeenCalledWith('employee-A', undefined);
  expect(view.getByText('가상 직원님, 출근했어요')).toBeTruthy();
  expect(view.getByTestId('camera').props.onBarcodeScanned).toBeUndefined();
  return view;
}
async function refreshStatus() { await act(async () => { listeners.forEach(listener => listener('active')); }); }
it('saved 중 status 해제가 오면 cooldown을 풀고 새 등록 QR을 교환한다', async () => {
  const view = await successfulPunch();
  (Enrollment.scannerStatus as jest.Mock).mockResolvedValue({ status: 'server_rejected', error: { code: 'ATTENDANCE_SCANNER_REVOKED' } });
  await refreshStatus();
  expect(view.getByText('등록이 해제됐어요')).toBeTruthy();
  expect(view.getByTestId('camera').props.onBarcodeScanned).toEqual(expect.any(Function));
  await act(async () => { fireEvent(view.getByTestId('camera'), 'barcodeScanned', { data: 'new-registration' }); });
  expect(Enrollment.exchangeAndStoreAttendanceScannerPairingQr).toHaveBeenCalledWith({ qr: 'new-registration' });
  expect(view.getByText('매장폰을 등록했어요')).toBeTruthy();
});
it('saved 중 status 오류와 회복 뒤 다음 직원 스캔을 받는다', async () => {
  const view = await successfulPunch();
  (Enrollment.scannerStatus as jest.Mock).mockResolvedValue({ status: 'unknown', error: { code: 'ATTENDANCE_TIMEOUT' } });
  await refreshStatus(); expect(view.getByText('매장폰을 확인하지 못했어요')).toBeTruthy();
  expect(view.getByTestId('camera').props.onBarcodeScanned).toEqual(expect.any(Function));
  (Enrollment.scannerStatus as jest.Mock).mockResolvedValue(statusOk); await refreshStatus();
  await act(async () => { fireEvent(view.getByTestId('camera'), 'barcodeScanned', { data: 'employee-B' }); });
  expect(Enrollment.scan).toHaveBeenLastCalledWith('employee-B', undefined);
});
it('saved 중 스크린리더가 켜지면 안내는 남기고 다음 QR 스캔을 허용한다', async () => {
  const view = await successfulPunch();
  await act(async () => { readerChanged(true); });
  expect(view.getByTestId('camera').props.onBarcodeScanned).toEqual(expect.any(Function));
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(view.getByText('가상 직원님, 출근했어요')).toBeTruthy();
  await act(async () => { fireEvent(view.getByTestId('camera'), 'barcodeScanned', { data: 'employee-B' }); });
  expect(Enrollment.scan).toHaveBeenLastCalledWith('employee-B', undefined);
});

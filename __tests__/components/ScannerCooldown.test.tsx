import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, AppState, type AppStateStatus } from 'react-native';
import AttendanceScannerScreen from '../../app/attendance/scanner';
import * as Enrollment from '../../lib/services/attendanceScannerEnrollment';

jest.mock('../../lib/services/attendanceScannerEnrollment', () => ({
  loadStoredAttendanceScannerRegistration: jest.fn(), scannerStatus: jest.fn(), scan: jest.fn(),
  exchangeAndStoreAttendanceScannerPairingQr: jest.fn(),
}));
jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn().mockResolvedValue(undefined), NotificationFeedbackType: { Success: 'success', Error: 'error' } }));
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
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((event: string, listener: (enabled: boolean) => void) => {
    if (event === 'screenReaderChanged') readerChanged = listener; return { remove: jest.fn() };
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
  expect(Enrollment.scan).toHaveBeenCalledTimes(1);
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

const pairingQr = 'rattle-scanner:v1.test-registration';
const employeeQr = 'rattle-punch:v1.test-employee';
type ScannerView = ReturnType<typeof render>;
async function detect(view: ScannerView, data: string) {
  await act(async () => { fireEvent(view.getByTestId('camera'), 'barcodeScanned', { data }); });
}
async function advance(ms: number) {
  await act(async () => { jest.advanceTimersByTime(ms); });
}
it('결과 시간과 QR 미검출이 모두 충족되어야 새 직원 QR을 처리한다', async () => {
  const view = await successfulPunch();
  await advance(2000);
  await detect(view, 'employee-B');
  await advance(900);
  await detect(view, 'employee-A');
  await advance(1199);
  expect(view.getByText('가상 직원님, 출근했어요')).toBeTruthy();
  expect(Enrollment.scan).toHaveBeenCalledTimes(1);
  await advance(1);
  expect(view.queryByText('가상 직원님, 출근했어요')).toBeNull();
  await detect(view, 'employee-A');
  expect(Enrollment.scan).toHaveBeenCalledTimes(1);
  await detect(view, 'employee-B');
  expect(Enrollment.scan).toHaveBeenCalledTimes(2);
});
it('등록 QR을 계속 대면 등록 성공을 유지하고 다시 비추면 한 번만 안내한다', async () => {
  (Enrollment.loadStoredAttendanceScannerRegistration as jest.Mock).mockResolvedValue(null);
  const view = render(<AttendanceScannerScreen />);
  await act(async () => {});
  await detect(view, pairingQr);
  for (let i = 0; i < 8; i++) { await advance(500); await detect(view, pairingQr); }
  expect(view.getByText('매장폰을 등록했어요')).toBeTruthy();
  await advance(1200);
  await detect(view, pairingQr);
  expect(view.getByText('이미 등록된 매장폰이에요')).toBeTruthy();
  await advance(3999);
  expect(view.getByText('이미 등록된 매장폰이에요')).toBeTruthy();
  await advance(1);
  await detect(view, pairingQr);
  expect(view.queryByText('이미 등록된 매장폰이에요')).toBeNull();
  expect(Enrollment.exchangeAndStoreAttendanceScannerPairingQr).toHaveBeenCalledTimes(1);
  expect(Enrollment.scan).not.toHaveBeenCalled();
});
it('미등록 매장폰에 직원 QR을 보여주면 등록 방법을 안내한다', async () => {
  (Enrollment.loadStoredAttendanceScannerRegistration as jest.Mock).mockResolvedValue(null);
  const view = render(<AttendanceScannerScreen />);
  await act(async () => {});
  await detect(view, employeeQr);
  expect(view.getByText('먼저 매장폰을 등록해주세요')).toBeTruthy();
  expect(Enrollment.exchangeAndStoreAttendanceScannerPairingQr).not.toHaveBeenCalled();
  expect(Enrollment.scan).not.toHaveBeenCalled();
});
it.each([[true, false], [false, true]])('동작 줄이기 %s 또는 투명도 줄이기 %s이면 프레임은 정적으로 유지한다', async (motion, transparency) => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(motion);
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(transparency);
  const timing = jest.spyOn(Animated, 'timing');
  await successfulPunch();
  expect(timing).not.toHaveBeenCalled();
});

it('서버 응답을 기다리는 동안 중복 검출과 다음 직원 검출을 모두 무시한다', async () => {
  let finish!: (value: typeof receipt) => void;
  (Enrollment.scan as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<AttendanceScannerScreen />);
  await act(async () => {});
  await detect(view, employeeQr);
  expect(view.getByText('확인하고 있어요')).toBeTruthy();
  await detect(view, employeeQr);
  await detect(view, 'employee-B');
  expect(Enrollment.scan).toHaveBeenCalledTimes(1);
  await act(async () => { finish(receipt); });
  expect(view.getByText('가상 직원님, 출근했어요')).toBeTruthy();
});

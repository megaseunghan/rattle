import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, AppState, type AppStateStatus } from 'react-native';
import AttendanceScannerScreen from '../../app/attendance/scanner';
import { CameraView } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as Enrollment from '../../lib/services/attendanceScannerEnrollment';

jest.mock('../../lib/services/attendanceScannerEnrollment', () => ({
  loadStoredAttendanceScannerRegistration: jest.fn(), scannerStatus: jest.fn(), scan: jest.fn(),
  exchangeAndStoreAttendanceScannerPairingQr: jest.fn(),
}));
jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn().mockResolvedValue(undefined), NotificationFeedbackType: { Success: 'success', Error: 'error', Warning: 'warning' } }));
jest.mock('expo-camera', () => ({
  Camera: { getCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }) },
  CameraView: jest.fn((props: object) => require('react').createElement(require('react-native').View, { ...props, testID: 'camera' })),
}));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const registration = { scannerId: 'scanner', storeId: 'store', storeName: '가상 매장', label: '매장폰' };
const statusOk = { status: 'success', data: registration };
const receipt = { status: 'saved', data: { employee_name: '가상 직원', kind: 'clock_in', punched_at: '2026-11-18T09:00:00+09:00', duplicate: false } };
const listeners = new Set<(state: AppStateStatus) => void>();
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); listeners.clear();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => { listeners.add(listener); return { remove: () => { listeners.delete(listener); } }; });
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
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
it('saved 중 status 해제가 오면 해제 안내를 확인한 후 새 등록 QR을 교환한다', async () => {
  const view = await successfulPunch();
  (Enrollment.scannerStatus as jest.Mock).mockResolvedValue({ status: 'server_rejected', error: { code: 'ATTENDANCE_SCANNER_REVOKED' } });
  await refreshStatus();
  expect(view.getByText('등록이 해제됐어요')).toBeTruthy();
  expect(view.getByTestId('camera').props.onBarcodeScanned).toEqual(expect.any(Function));
  await detect(view, 'new-registration');
  expect(Enrollment.exchangeAndStoreAttendanceScannerPairingQr).not.toHaveBeenCalled();
  confirm(view);
  await detect(view, 'new-registration');
  expect(Enrollment.exchangeAndStoreAttendanceScannerPairingQr).toHaveBeenCalledWith({ qr: 'new-registration' });
  expect(view.getByText('매장폰을 등록했어요')).toBeTruthy();
});
it('saved 중 status 오류와 회복 뒤 다음 직원 스캔을 받는다', async () => {
  const view = await successfulPunch();
  (Enrollment.scannerStatus as jest.Mock).mockResolvedValue({ status: 'unknown', error: { code: 'ATTENDANCE_TIMEOUT' } });
  await refreshStatus(); expect(view.getByText('가상 직원님, 출근했어요')).toBeTruthy();
  expect(view.getByTestId('camera').props.onBarcodeScanned).toEqual(expect.any(Function));
  (Enrollment.scannerStatus as jest.Mock).mockResolvedValue(statusOk); await refreshStatus();
  await detect(view, 'employee-B');
  expect(Enrollment.scan).toHaveBeenCalledTimes(1);
  confirm(view);
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
function confirm(view: ScannerView) {
  fireEvent.press(view.getByRole('button', { name: '확인' }));
}
it.each([false, true])('스크린리더 %s 상태에서도 확인을 눌러야 새 직원 QR을 처리한다', async enabled => {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(enabled);
  const view = await successfulPunch();
  await advance(30000);
  await detect(view, 'employee-B');
  expect(view.getByText('가상 직원님, 출근했어요')).toBeTruthy();
  expect(Enrollment.scan).toHaveBeenCalledTimes(1);
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  confirm(view);
  expect(view.queryByText('가상 직원님, 출근했어요')).toBeNull();
  await detect(view, 'employee-A');
  expect(view.getByText('이미 기록한 QR이에요')).toBeTruthy();
  expect(view.getByText('직원 휴대폰에서 새 QR을 보여주세요')).toBeTruthy();
  expect(Haptics.notificationAsync).toHaveBeenLastCalledWith(Haptics.NotificationFeedbackType.Warning);
  await detect(view, 'employee-A');
  expect(Enrollment.scan).toHaveBeenCalledTimes(1);
  await detect(view, 'employee-A');
  confirm(view);
  await detect(view, 'employee-A');
  expect(view.queryByText('이미 기록한 QR이에요')).toBeNull();
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(2);
  await advance(2000);
  await detect(view, 'employee-A');
  expect(view.getByText('이미 기록한 QR이에요')).toBeTruthy();
  expect(Enrollment.scan).toHaveBeenCalledTimes(1);
  confirm(view);
  await detect(view, 'employee-B');
  expect(Enrollment.scan).toHaveBeenCalledTimes(2);
});
it('실패하면 오류 햅틱을 한 번 주고 확인 후 다음 QR을 처리한다', async () => {
  (Enrollment.scan as jest.Mock).mockResolvedValueOnce({ status: 'server_rejected', error: { code: 'ATTENDANCE_QR_EXPIRED' } });
  const view = render(<AttendanceScannerScreen />);
  await act(async () => {});
  await detect(view, 'expired');
  await advance(30000);
  await detect(view, 'fresh');
  expect(view.getByText('출퇴근 QR이 만료됐어요')).toBeTruthy();
  expect(Enrollment.scan).toHaveBeenCalledTimes(1);
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  confirm(view);
  await detect(view, 'fresh');
  expect(Enrollment.scan).toHaveBeenLastCalledWith('fresh', undefined);
});
it('등록 QR을 계속 대면 등록 성공을 유지하고 다시 비추면 한 번만 안내한다', async () => {
  (Enrollment.loadStoredAttendanceScannerRegistration as jest.Mock).mockResolvedValue(null);
  const view = render(<AttendanceScannerScreen />);
  await act(async () => {});
  await detect(view, pairingQr);
  for (let i = 0; i < 8; i++) { await advance(500); await detect(view, pairingQr); }
  expect(view.getByText('매장폰을 등록했어요')).toBeTruthy();
  confirm(view);
  await detect(view, pairingQr);
  expect(view.getByText('이미 등록된 매장폰이에요')).toBeTruthy();
  for (let i = 0; i < 8; i++) { await advance(500); await detect(view, pairingQr); }
  expect(view.getByText('이미 등록된 매장폰이에요')).toBeTruthy();
  expect(Haptics.notificationAsync).toHaveBeenLastCalledWith(Haptics.NotificationFeedbackType.Warning);
  confirm(view);
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
  const view = render(<AttendanceScannerScreen />);
  await act(async () => {});
  expect(view.getByTestId('scanner-line')).toBeTruthy();
  await detect(view, employeeQr);
  expect(view.queryByTestId('scanner-line')).toBeNull();
  expect(timing).not.toHaveBeenCalled();
});

it('서버 응답을 기다리는 동안 중복 검출과 다음 직원 검출을 모두 무시한다', async () => {
  let finish!: (value: typeof receipt) => void;
  (Enrollment.scan as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const stop = jest.fn();
  const loop = jest.spyOn(Animated, 'loop').mockReturnValue({ start: jest.fn(), stop, reset: jest.fn() });
  const timing = jest.spyOn(Animated, 'timing');
  const view = render(<AttendanceScannerScreen />);
  await act(async () => {});
  const camera = view.getByTestId('camera');
  expect(view.getByTestId('scanner-line')).toBeTruthy();
  expect(loop).toHaveBeenCalledTimes(1);
  expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ useNativeDriver: true }));
  const callback = camera.props.onBarcodeScanned;
  const renderCount = (CameraView as unknown as jest.Mock).mock.calls.length;
  await detect(view, employeeQr);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(view.getByTestId('scanner-line')).toBeTruthy();
  expect(view.getByText('확인하고 있어요')).toBeTruthy();
  await detect(view, employeeQr);
  await detect(view, 'employee-B');
  expect(Enrollment.scan).toHaveBeenCalledTimes(1);
  await act(async () => { finish(receipt); });
  expect(view.getByText('가상 직원님, 출근했어요')).toBeTruthy();
  confirm(view);
  expect(view.getByTestId('camera')).toBe(camera);
  expect(camera.props.onBarcodeScanned).toBe(callback);
  expect(CameraView).toHaveBeenCalledTimes(renderCount);
});

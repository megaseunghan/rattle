import { act, fireEvent, render, within } from '@testing-library/react-native';
import { AccessibilityInfo, ActivityIndicator, Animated, AppState, Dimensions, ScrollView, StyleSheet, type AppStateStatus } from 'react-native';
import AttendanceScannerScreen from '../../app/attendance/scanner';
import { Camera, CameraView } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as Enrollment from '../../lib/services/attendanceScannerEnrollment';

jest.mock('../../lib/services/attendanceScannerEnrollment', () => ({
  loadStoredAttendanceScannerRegistration: jest.fn(), scannerStatus: jest.fn(), scan: jest.fn(),
  exchangeAndStoreAttendanceScannerPairingQr: jest.fn(),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn().mockResolvedValue(undefined), notificationAsync: jest.fn().mockResolvedValue(undefined), NotificationFeedbackType: { Success: 'success', Error: 'error', Warning: 'warning' } }));
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
  expect(view.getByText('×')).toBeTruthy();
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
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(2);
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
  expect(view.queryByTestId('scanner-line')).toBeNull();
  await detect(view, employeeQr);
  expect(view.queryByTestId('scanner-line')).toBeNull();
  expect(timing).not.toHaveBeenCalled();
});

it.each([false, true])('잠금 완료 %s 시점에 서버 응답이 오면 반복을 즉시 중단한다', async locked => {
  let finish!: (value: typeof receipt) => void;
  (Enrollment.scan as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const start = jest.fn(), stop = jest.fn();
  let finishLock!: (result: { finished: boolean }) => void;
  const loop = jest.spyOn(Animated, 'loop').mockReturnValue({ start, stop, reset: jest.fn() });
  const timing = jest.spyOn(Animated, 'timing').mockImplementation((_, config) => ({
    start: callback => { if (config.duration === 120 && callback) finishLock = callback; }, stop: jest.fn(), reset: jest.fn(),
  }));
  const view = render(<AttendanceScannerScreen />);
  await act(async () => {});
  const camera = view.getByTestId('camera');
  expect(view.queryByTestId('scanner-line')).toBeNull();
  expect(loop).not.toHaveBeenCalled();
  const callback = camera.props.onBarcodeScanned;
  const renderCount = (CameraView as unknown as jest.Mock).mock.calls.length;
  await detect(view, employeeQr);
  expect(view.getByText('QR을 읽었어요')).toBeTruthy();
  expect(view.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  expect(loop).toHaveBeenCalledTimes(1);
  expect(start).not.toHaveBeenCalled();
  if (locked) act(() => finishLock({ finished: true }));
  expect(start).toHaveBeenCalledTimes(locked ? 1 : 0);
  expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duration: 120, toValue: 0.88 }));
  expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duration: 1200 }));
  expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ useNativeDriver: true }));
  expect(view.getByText('출퇴근 기록을 확인하고 있어요')).toBeTruthy();
  await detect(view, employeeQr);
  await detect(view, 'employee-B');
  expect(Enrollment.scan).toHaveBeenCalledTimes(1);
  await act(async () => { finish(receipt); });
  expect(view.getByText('가상 직원님, 출근했어요')).toBeTruthy();
  expect(view.queryByTestId('scanner-line')).toBeNull();
  expect(stop).toHaveBeenCalledTimes(1);
  act(() => finishLock({ finished: true }));
  expect(start).toHaveBeenCalledTimes(locked ? 1 : 0);
  expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duration: 240 }));
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  confirm(view);
  expect(view.queryByTestId('scanner-line')).toBeNull();
  expect(view.getByTestId('camera')).toBe(camera);
  expect(camera.props.onBarcodeScanned).toBe(callback);
  expect(CameraView).toHaveBeenCalledTimes(renderCount);
});

it('동작 줄이기에서는 서버 응답을 기다리는 동안 정적 아이콘을 표시한다', async () => {
  let finish!: (value: typeof receipt) => void;
  (Enrollment.scan as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const motionEvents: {
    addEventListener(event: 'reduceMotionChanged', listener: (value: boolean) => void): { remove(): void };
  } = AccessibilityInfo;
  const listen = jest.spyOn(motionEvents, 'addEventListener');
  const view = render(<AttendanceScannerScreen />);
  await act(async () => {});
  await detect(view, employeeQr);
  expect(view.getByText('출퇴근 기록을 확인하고 있어요')).toBeTruthy();
  expect(view.getByText('QR을 읽었어요')).toBeTruthy();
  expect(view.getByText('…')).toBeTruthy();
  expect(view.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  const onMotion = listen.mock.calls.find(([event]) => event === 'reduceMotionChanged')![1];
  act(() => onMotion(false));
  expect(view.queryByText('…')).toBeNull();
  act(() => onMotion(true));
  expect(view.getByText('…')).toBeTruthy();
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  await act(async () => { finish(receipt); });
});
it('권한을 회수하고 복귀해도 결과를 읽고 확인할 수 있고 iOS 알림은 한 번만 읽는다', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  const view = await successfulPunch();
  const label = '가상 직원님, 출근했어요. 09:00. 다음 QR을 찍으려면 확인을 눌러주세요';
  expect(view.getByLabelText(label)).toBeTruthy();
  expect(announce).toHaveBeenCalledWith(label);
  await detect(view, 'employee-A');
  await act(async () => { listeners.forEach(listener => listener('background')); });
  (Camera.getCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });
  await refreshStatus();
  expect(view.getByText('카메라를 허용해주세요')).toBeTruthy();
  expect(view.getByLabelText(label)).toBeTruthy();
  expect(announce.mock.calls).toEqual([['QR을 읽었어요'], [label]]);
  confirm(view);
  expect(view.queryByLabelText(label)).toBeNull();
});

it('미등록 매장폰에서 거절된 등록 QR을 다시 비추면 재교환 없이 경고를 한 번 표시한다', async () => {
  (Enrollment.loadStoredAttendanceScannerRegistration as jest.Mock).mockResolvedValue(null);
  (Enrollment.exchangeAndStoreAttendanceScannerPairingQr as jest.Mock).mockResolvedValueOnce({
    status: 'server_rejected', error: { code: 'ATTENDANCE_SCANNER_REGISTRATION_EXPIRED' },
  });
  const view = render(<AttendanceScannerScreen />);
  await act(async () => {});
  await detect(view, pairingQr);
  expect(view.getByText('등록 QR을 확인하지 못했어요')).toBeTruthy();
  confirm(view);
  await detect(view, pairingQr);
  expect(view.getByText('새 등록 QR이 필요해요')).toBeTruthy();
  expect(view.getByText('사장님이나 점장님 앱에서 새 등록 QR을 열어주세요')).toBeTruthy();
  expect(Haptics.notificationAsync).toHaveBeenLastCalledWith(Haptics.NotificationFeedbackType.Warning);
  confirm(view);
  await detect(view, pairingQr);
  expect(view.queryByText('새 등록 QR이 필요해요')).toBeNull();
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(2);
  expect(Enrollment.exchangeAndStoreAttendanceScannerPairingQr).toHaveBeenCalledTimes(1);
  await detect(view, 'rattle-scanner:v1.fresh');
  expect(view.getByText('매장폰을 등록했어요')).toBeTruthy();
});

it('320×568·글꼴 2배에서 결과불명 안내와 확인이 같은 스크롤 영역에 있고 확인 후 재시도한다', async () => {
  jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 320, height: 568, scale: 2, fontScale: 2 });
  (Enrollment.scan as jest.Mock).mockResolvedValueOnce({ status: 'unknown', error: { code: 'ATTENDANCE_TIMEOUT' } });
  const view = render(<AttendanceScannerScreen />);
  await act(async () => {});
  await detect(view, employeeQr);
  const scroll = view.UNSAFE_getByType(ScrollView);
  expect(scroll.props.scrollEnabled).not.toBe(false);
  const viewport = StyleSheet.flatten(scroll.props.style);
  expect(568 - viewport.top - viewport.bottom).toBeGreaterThan(240);
  const card = within(scroll).getByTestId('scanner-notice-card');
  const instructions = within(card).getByText(/확인을 누른 뒤 같은 QR로 다시 확인해주세요/);
  expect(instructions.props.numberOfLines).toBeUndefined();
  expect(instructions.props.allowFontScaling).not.toBe(false);
  expect(within(scroll).getByText('확인할 기록 1건이 있어요')).toBeTruthy();
  const confirmButton = within(card).getByRole('button', { name: '확인' });
  expect(StyleSheet.flatten(confirmButton.props.style)?.position).not.toBe('absolute');
  fireEvent.press(confirmButton);
  expect(view.queryByTestId('scanner-notice-card')).toBeNull();
  await detect(view, employeeQr);
  expect(Enrollment.scan).toHaveBeenLastCalledWith(employeeQr, 'unknown');
});

it.each([false, true])('결과 카드 진입은 동작 줄이기 %s 설정을 따른다', async reduced => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduced);
  const timing = jest.spyOn(Animated, 'timing').mockImplementation(() => ({
    start: jest.fn(), stop: jest.fn(), reset: jest.fn(),
  }));
  const view = await successfulPunch();
  const card = view.getByTestId('scanner-notice-card');
  expect(card).toHaveStyle({
    opacity: reduced ? 1 : 0,
    transform: [{ translateY: reduced ? 0 : 8 }],
  });
  if (reduced) expect(timing).not.toHaveBeenCalled();
  else expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    toValue: 1, duration: 240, useNativeDriver: true, isInteraction: false,
  }));
});

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { ScannerUiService, useAttendanceScanner } from '../../lib/hooks/useAttendanceScanner';
jest.mock('../../lib/services/attendanceScannerEnrollment', () => ({}));
const saved = { scannerId: 'scanner', storeId: 'store', storeName: '가상 매장', label: '매장폰' };
const receipt = { status: 'saved', data: { employee_name: '김**', kind: 'clock_in', punched_at: '2026-11-18T09:00:00+09:00', duplicate: false } };
const unknown = { status: 'unknown', error: { code: 'ATTENDANCE_TIMEOUT' } };
function service(): ScannerUiService {
  return { leaveScannerMode: jest.fn(), loadStoredAttendanceScannerRegistration: jest.fn().mockResolvedValue(saved), scannerStatus: jest.fn().mockResolvedValue({ status: 'success', data: saved }),
    issueAttendanceScannerPairingQr: jest.fn(), exchangeAndStoreAttendanceScannerPairingQr: jest.fn().mockResolvedValue({ status: 'success', data: saved }), scan: jest.fn().mockResolvedValue(receipt) };
}
beforeEach(() => { Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' }); });
it('로그인 없이 저장된 등록 정보로 스캔을 준비한다', async () => {
  const api = service(); const { result } = renderHook(() => useAttendanceScanner(api));
  await waitFor(() => expect(result.current.ready).toBe(true)); expect(result.current.state).toBe('waiting');
});
it('A 결과불명을 보존하면서 B를 기록하고 A의 같은 QR에는 이전 상태를 전달한다', async () => {
  const api = service(); (api.scan as jest.Mock).mockResolvedValueOnce(unknown).mockResolvedValueOnce(receipt).mockResolvedValueOnce({ ...receipt, data: { ...receipt.data, duplicate: true } });
  const { result } = renderHook(() => useAttendanceScanner(api)); await waitFor(() => expect(result.current.ready).toBe(true));
  await act(async () => { await result.current.scan('A'); }); expect(result.current.state).toBe('unknown'); expect(result.current.unresolvedCount).toBe(1);
  await act(async () => { result.current.clearNotice(); await result.current.scan('B'); }); expect(api.scan).toHaveBeenLastCalledWith('B', undefined); expect(result.current.unresolvedCount).toBe(1);
  await act(async () => { result.current.clearNotice(); await result.current.scan('A'); }); expect(api.scan).toHaveBeenLastCalledWith('A', 'unknown'); expect(result.current.unresolvedCount).toBe(0);
});
it('A의 QR 만료 거절이 이전 결과를 실패로 확정하지 않고 B는 계속 받는다', async () => {
  const api = service(); (api.scan as jest.Mock).mockResolvedValueOnce(unknown).mockResolvedValueOnce({ status: 'server_rejected', error: { code: 'ATTENDANCE_QR_EXPIRED' } }).mockResolvedValue(receipt);
  const { result } = renderHook(() => useAttendanceScanner(api)); await waitFor(() => expect(result.current.ready).toBe(true));
  await act(async () => { await result.current.scan('A'); result.current.clearNotice(); await result.current.scan('A'); });
  expect(result.current.state).toBe('unknown'); expect(result.current.unresolvedCount).toBe(1);
  await act(async () => { result.current.clearNotice(); await result.current.scan('B'); }); expect(result.current.state).toBe('saved'); expect(result.current.unresolvedCount).toBe(1);
});
it.each(['ATTENDANCE_SCANNER_INVALID', 'ATTENDANCE_SCANNER_REVOKED'])('status의 %s 해제를 확인하면 새 등록 경로로 바꾼다', async code => {
  const api = service(); (api.scannerStatus as jest.Mock).mockResolvedValue({ status: 'server_rejected', error: { code } });
  const { result } = renderHook(() => useAttendanceScanner(api)); await waitFor(() => expect(result.current.state).toBe('revoked'));
  expect(result.current.ready).toBe(false); expect(result.current.title).toBe('등록이 해제됐어요');
  act(() => result.current.clearNotice());
  expect(result.current.canLeave).toBe(true);
  await act(async () => { result.current.clearNotice(); await result.current.scan('new-registration'); });
  expect(api.exchangeAndStoreAttendanceScannerPairingQr).toHaveBeenCalledWith({ qr: 'new-registration' }); expect(api.scan).not.toHaveBeenCalled();
});
it.each(['ATTENDANCE_SCANNER_INVALID', 'ATTENDANCE_SCANNER_REVOKED'])('punch의 %s 뒤에도 이전 미확인 기록을 남긴다', async code => {
  const api = service(); (api.scan as jest.Mock).mockResolvedValueOnce(unknown).mockResolvedValueOnce({ status: 'server_rejected', error: { code } });
  const { result } = renderHook(() => useAttendanceScanner(api)); await waitFor(() => expect(result.current.ready).toBe(true));
  await act(async () => { await result.current.scan('A'); result.current.clearNotice(); await result.current.scan('B'); });
  expect(result.current.state).toBe('revoked'); expect(result.current.ready).toBe(false); expect(result.current.unresolvedCount).toBe(1);
  await act(async () => { result.current.clearNotice(); await result.current.scan('new-registration'); }); expect(api.exchangeAndStoreAttendanceScannerPairingQr).toHaveBeenCalledTimes(1); expect(result.current.unresolvedCount).toBe(1);
});
it('등록 응답 유실 뒤 자동 재교환을 막고 관리자 확인 후 새 QR만 받는다', async () => {
  const api = service(); (api.loadStoredAttendanceScannerRegistration as jest.Mock).mockResolvedValue(null);
  (api.exchangeAndStoreAttendanceScannerPairingQr as jest.Mock).mockResolvedValueOnce(unknown).mockResolvedValue({ status: 'success', data: saved });
  const { result } = renderHook(() => useAttendanceScanner(api)); await waitFor(() => expect(result.current.state).toBe('unregistered'));
  await act(async () => { await result.current.scan('old-registration'); }); expect(result.current.state).toBe('unknownSetup');
  await act(async () => { await result.current.scan('old-registration'); await result.current.scan('new-registration'); }); expect(api.exchangeAndStoreAttendanceScannerPairingQr).toHaveBeenCalledTimes(1);
  await act(async () => { await result.current.confirmRegistrationRecovery(); });
  await act(async () => { await result.current.scan('old-registration'); }); expect(api.exchangeAndStoreAttendanceScannerPairingQr).toHaveBeenCalledTimes(1);
  await act(async () => { result.current.clearNotice(); await result.current.scan('new-registration'); }); expect(api.exchangeAndStoreAttendanceScannerPairingQr).toHaveBeenCalledTimes(2); expect(result.current.ready).toBe(true);
});

it('해제와 이전 punch 결과불명이 동시에 오면 등록 경로와 미확인 기록을 분리한다', async () => {
  const api = service(); (api.scan as jest.Mock).mockResolvedValue({ status: 'unknown', error: { code: 'ATTENDANCE_SCANNER_REVOKED' } });
  const { result } = renderHook(() => useAttendanceScanner(api)); await waitFor(() => expect(result.current.ready).toBe(true));
  await act(async () => { await result.current.scan('A'); });
  expect(result.current.state).toBe('revoked'); expect(result.current.ready).toBe(false); expect(result.current.unresolvedCount).toBe(1);
});
it('등록 복구 중 저장소 확인이 실패하면 새 교환을 열지 않는다', async () => {
  const api = service(); (api.loadStoredAttendanceScannerRegistration as jest.Mock).mockResolvedValue(null);
  (api.exchangeAndStoreAttendanceScannerPairingQr as jest.Mock).mockResolvedValue(unknown);
  const { result } = renderHook(() => useAttendanceScanner(api)); await waitFor(() => expect(result.current.state).toBe('unregistered'));
  await act(async () => { await result.current.scan('old-registration'); });
  (api.loadStoredAttendanceScannerRegistration as jest.Mock).mockRejectedValue(new Error('keychain'));
  await act(async () => { await result.current.confirmRegistrationRecovery(); await result.current.scan('new-registration'); });
  expect(result.current.state).toBe('unknownSetup'); expect(api.exchangeAndStoreAttendanceScannerPairingQr).toHaveBeenCalledTimes(1);
});

it('등록 응답 유실 뒤 이전 기기의 해제를 확인하면 옛 QR을 재교환하지 않고 새 QR을 받는다', async () => {
  const api = service();
  (api.loadStoredAttendanceScannerRegistration as jest.Mock).mockResolvedValueOnce(null);
  (api.exchangeAndStoreAttendanceScannerPairingQr as jest.Mock).mockResolvedValueOnce(unknown);
  (api.scannerStatus as jest.Mock).mockResolvedValue({ status: 'server_rejected', error: { code: 'ATTENDANCE_SCANNER_REVOKED' } });
  const { result } = renderHook(() => useAttendanceScanner(api));
  await waitFor(() => expect(result.current.state).toBe('unregistered'));
  await act(async () => { await result.current.scan('lost'); });
  expect(result.current.state).toBe('unknownSetup');
  await act(async () => { await result.current.refresh(); });
  expect(result.current.state).toBe('revoked');
  await act(async () => { await result.current.scan('fresh'); });
  expect(api.exchangeAndStoreAttendanceScannerPairingQr).toHaveBeenCalledTimes(1);
  await act(async () => { result.current.clearNotice(); await result.current.scan('lost'); });
  expect(api.exchangeAndStoreAttendanceScannerPairingQr).toHaveBeenCalledTimes(1);
  await act(async () => { result.current.clearNotice(); await result.current.scan('fresh'); });
  expect(api.exchangeAndStoreAttendanceScannerPairingQr).toHaveBeenCalledTimes(2);
  expect(result.current.state).toBe('registered');
});

it.each(['refresh', 'confirmRegistrationRecovery'] as const)('%s에서 등록이 복구되면 확인 전까지 직원 기록을 차단한다', async method => {
  const api = service();
  (api.loadStoredAttendanceScannerRegistration as jest.Mock).mockResolvedValueOnce(null);
  (api.exchangeAndStoreAttendanceScannerPairingQr as jest.Mock).mockResolvedValueOnce(unknown);
  const { result } = renderHook(() => useAttendanceScanner(api));
  await waitFor(() => expect(result.current.state).toBe('unregistered'));
  await act(async () => { await result.current.scan('lost'); });
  (api.scannerStatus as jest.Mock).mockResolvedValueOnce(unknown);
  await act(async () => { await result.current.refresh(); });
  expect(result.current.state).toBe('unknownSetup');
  await act(async () => { await result.current[method](); await result.current.scan('employee'); });
  expect(result.current.state).toBe('registered');
  expect(api.scan).not.toHaveBeenCalled();
  await act(async () => { result.current.clearNotice(); await result.current.scan('employee'); });
  expect(api.scan).toHaveBeenCalledTimes(1);
});

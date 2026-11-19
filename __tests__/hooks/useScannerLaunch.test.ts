import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useScannerLaunch } from '../../lib/hooks/useScannerLaunch';
const mockLoad = jest.fn();
jest.mock('../../lib/services/attendanceScannerEnrollment', () => ({ loadStoredAttendanceScannerRegistration: (...args: unknown[]) => mockLoad(...args) }));
beforeEach(() => mockLoad.mockReset().mockResolvedValue(null));
it('일반 앱은 로컬 등록 확인이 끝나기 전 인증 화면을 열지 않는다', async () => {
  const { result } = renderHook(() => useScannerLaunch('/'));
  expect(result.current.checking).toBe(true); await waitFor(() => expect(result.current.checking).toBe(false)); expect(result.current.scanner).toBe(false);
});
it('등록된 매장폰은 다른 경로로 열어도 스캐너 전용으로 남는다', async () => {
  mockLoad.mockResolvedValue({ scannerId: 'scanner', storeId: 'store' });
  const { result, rerender } = renderHook(({ path }: { path: string }) => useScannerLaunch(path), { initialProps: { path: '/settings/account' } });
  await waitFor(() => expect(result.current.scanner).toBe(true));
  mockLoad.mockResolvedValue(null); rerender({ path: '/(auth)/login' }); await act(async () => { await result.current.refetch(); });
  expect(result.current.scanner).toBe(true);
});
it('미등록 폰도 스캐너 진입 뒤 로그인 링크로 벗어날 수 없다', async () => {
  const { result, rerender } = renderHook(({ path }: { path: string }) => useScannerLaunch(path), { initialProps: { path: '/attendance/scanner' } });
  await waitFor(() => expect(result.current.checking).toBe(false)); rerender({ path: '/(auth)/login' }); expect(result.current.scanner).toBe(true);
});
it('로컬 등록 읽기 실패를 미등록으로 취급하지 않는다', async () => {
  mockLoad.mockRejectedValue(new Error('keychain')); const { result } = renderHook(() => useScannerLaunch('/'));
  await waitFor(() => expect(result.current.error).toBe(true));
});

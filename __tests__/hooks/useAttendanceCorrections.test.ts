import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useAttendanceCorrections } from '../../lib/hooks/useAttendanceCorrections';
let mockMode = 'self';
const mockRead = jest.fn(), mockCancel = jest.fn(), mockSubmit = jest.fn();
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'person' }, store: { id: 'store' }, devPreviewMode: mockMode, permissionRevision: '1' }) }));
jest.mock('../../lib/services/attendance', () => ({ getAttendanceCorrections: (...args: unknown[]) => mockRead(...args), cancelAttendanceCorrection: (...args: unknown[]) => mockCancel(...args), requestAttendanceCorrection: (...args: unknown[]) => mockSubmit(...args) }));
beforeEach(() => { mockMode = 'self'; mockRead.mockReset().mockResolvedValue({ status: 'success', data: { rows: [{ id: 'pending', status: 'pending' }] } }); mockCancel.mockReset(); mockSubmit.mockReset(); });
it('취소 결과가 불분명하면 같은 요청을 다시 취소하지 않는다', async () => {
  mockCancel.mockResolvedValue({ status: 'unknown' });
  const { result } = renderHook(() => useAttendanceCorrections('employee'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { await result.current.cancel('pending'); });
  expect(result.current.outcome).toBe('unknown');
  await act(async () => { await result.current.cancel('pending'); });
  expect(mockCancel).toHaveBeenCalledTimes(1);
});
it('미리보기로 바뀐 뒤 이전 확인창 콜백은 취소하지 않는다', async () => {
  const { result, rerender } = renderHook(() => useAttendanceCorrections('employee'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  const oldCancel = result.current.cancel; mockMode = 'regular'; rerender({});
  await act(async () => { await oldCancel('pending'); });
  expect(mockCancel).not.toHaveBeenCalled();
});

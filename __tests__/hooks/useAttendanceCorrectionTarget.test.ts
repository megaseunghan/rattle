import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useAttendanceCorrectionTarget } from '../../lib/hooks/useAttendanceCorrectionTarget';
import { getAttendancePunch } from '../../lib/services/attendance';
let mockStore='s1', mockPermission=1;
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user' }, store: { id: mockStore }, permissionRevision: mockPermission, devPreviewMode: 'self' }) }));
jest.mock('../../lib/services/attendance', () => ({ getAttendancePunch: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); mockStore='s1'; mockPermission=1; });
it('loads a historical reminder under explicit employee/store scope', async () => {
 (getAttendancePunch as jest.Mock).mockResolvedValue({ status: 'success', data: { id: 'old' } });
 const { result }=renderHook(() => useAttendanceCorrectionTarget('employee','old'));
 await waitFor(() => expect(result.current.row?.id).toBe('old'));
 expect(getAttendancePunch).toHaveBeenCalledWith('s1','employee','old',expect.any(AbortSignal));
});
it('rejects a late response after changing store/permission', async () => {
 let finish!: (value: unknown) => void;
 (getAttendancePunch as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish=resolve; }))
  .mockResolvedValue({ status: 'server_rejected', error: { code: '42501' } });
 const { result, rerender }=renderHook(() => useAttendanceCorrectionTarget('employee','old'));
 mockStore='s2'; mockPermission=2; rerender({});
 await waitFor(() => expect(result.current.error).toBeTruthy());
 await act(async () => { finish({ status: 'success', data: { id: 'old-s1' } }); });
 expect(result.current.row).toBeNull();
 expect(result.current.error).toBeTruthy();
});
it('does not query without a reminder target', () => {
 renderHook(() => useAttendanceCorrectionTarget('employee'));
 expect(getAttendancePunch).not.toHaveBeenCalled();
});

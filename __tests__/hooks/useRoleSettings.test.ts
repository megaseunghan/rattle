import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useRoleSettings } from '../../lib/hooks/useRoleSettings';
let mockAuth: any;
const mockAccess = jest.fn(), mockVisibility = jest.fn(), mockSave = jest.fn(), mockManager = jest.fn();
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../../lib/services/storeAccess', () => ({ getMyStoreAccess: (...a: unknown[]) => mockAccess(...a), setStoreManager: (...a: unknown[]) => mockManager(...a) }));
jest.mock('../../lib/services/storeVisibility', () => ({ getMyStoreVisibility: (...a: unknown[]) => mockVisibility(...a), setStoreVisibility: (...a: unknown[]) => mockSave(...a) }));
const scopes = { financial_share_scope: 'none', attendance_share_scope: 'regular_only', payroll_share_scope: 'all_staff' };
beforeEach(() => {
  mockAuth = { user: { id: 'owner' }, store: { id: 'store' }, devPreviewMode: 'self', permissionRevision: '1', access: { is_owner: true }, refreshStore: jest.fn().mockResolvedValue(undefined) };
  mockAccess.mockReset().mockResolvedValue({ status: 'success', data: { is_owner: true, manager_revision: '3' } });
  mockVisibility.mockReset().mockResolvedValue({ status: 'success', data: { ...scopes, visibility_revision: '4' } });
  mockSave.mockReset(); mockManager.mockReset();
});
it('점장은 사장용 설정을 조회하거나 저장하지 않는다', async () => {
  mockAuth.access = { is_owner: false }; const { result } = renderHook(() => useRoleSettings());
  await waitFor(() => expect(result.current.loading).toBe(false)); await act(async () => { await result.current.save('visibility', scopes as any); });
  expect(mockVisibility).not.toHaveBeenCalled(); expect(mockSave).not.toHaveBeenCalled();
});
it('응답 유실 뒤 선택/재저장을 잠그고 명시적 재조회로 현재 기준을 확인한다', async () => {
  mockSave.mockResolvedValue({ status: 'unknown' }); const { result } = renderHook(() => useRoleSettings());
  await waitFor(() => expect(result.current.visibility).not.toBeNull());
  await act(async () => { await result.current.save('visibility', scopes as any); });
  expect(result.current.outcome).toBe('unknown');
  await act(async () => { await result.current.save('visibility', scopes as any); }); expect(mockSave).toHaveBeenCalledTimes(1);
  expect(mockSave).toHaveBeenCalledWith('store', scopes, '4');
  await act(async () => { await result.current.refetch(true); }); expect(result.current.outcome).toBe('');
});
it('매장 변경 전 확인창에서 캡처한 쓰기 콜백을 거부한다', async () => {
  const { result, rerender } = renderHook(() => useRoleSettings()); await waitFor(() => expect(result.current.access).not.toBeNull());
  const oldSave = result.current.save; mockAuth = { ...mockAuth, store: { id: 'other' } }; rerender({});
  await act(async () => { await oldSave('manager', 'member'); }); expect(mockManager).not.toHaveBeenCalled();
});

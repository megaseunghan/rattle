import { renderHook } from '@testing-library/react-native';
import { useStorePermissions } from '../../lib/hooks/useStorePermissions';

let mockRole: 'admin' | 'member' = 'member';
let mockEmployment: 'regular' | 'part_time' | null = 'part_time';
let mockLoading = false;
let mockError: string | null = null;
let mockPreview: 'self' | 'regular' | 'part_time' = 'self';
let mockHasStore = true;
const mockRefetch = jest.fn();
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({
  user: { id: 'u' }, store: mockHasStore ? { id: 's' } : null, currentRole: mockRole,
  devPreviewMode: mockPreview, devPreviewEmployeeId: null, canReadFinancials: false,
}) }));
jest.mock('../../lib/hooks/useEmployees', () => ({ useEmployees: () => ({
  employees: mockEmployment ? [{ id: 'e', store_id: 's', user_id: 'u', employment_type: mockEmployment }] : [],
  loading: mockLoading, error: mockError, refetch: mockRefetch,
}) }));
beforeEach(() => { mockRole = 'member'; mockEmployment = 'part_time'; mockLoading = false; mockError = null; mockPreview = 'self'; mockHasStore = true; });
it('PT는 재무 공유와 무관하게 레시피를 조회하고 재고 수량만 수정한다', () => {
  const { result } = renderHook(() => useStorePermissions());
  expect(result.current).toMatchObject({ canReadRecipes: true, canManageRecipes: false, canManageStock: false, canAdjustStock: true, isPartTime: true });
});
it('확인된 정규직의 기존 레시피·재고 관리 권한을 유지한다', () => {
  mockEmployment = 'regular';
  const { result } = renderHook(() => useStorePermissions());
  expect(result.current).toMatchObject({ canManageRecipes: true, canManageStock: true, canAdjustStock: true });
});
it('관리자는 직원 레코드가 없어도 기존 관리 권한을 유지한다', () => {
  mockRole = 'admin'; mockEmployment = null;
  const { result } = renderHook(() => useStorePermissions());
  expect(result.current).toMatchObject({ isAdmin: true, canManageRecipes: true, canManageStock: true });
});
it.each(['loading', 'error', 'unlinked'] as const)('%s인 일반 구성원에게 쓰기 권한을 먼저 열지 않는다', state => {
  mockLoading = state === 'loading'; mockError = state === 'error' ? '조회 실패' : null;
  if (state === 'unlinked') mockEmployment = null;
  const { result } = renderHook(() => useStorePermissions());
  expect(result.current).toMatchObject({ permissionsReady: false, canManageRecipes: false, canManageStock: false, canAdjustStock: false });
});
it('PT 미리보기도 관리 권한을 열지 않는다', () => {
  mockPreview = 'part_time'; mockEmployment = 'regular';
  const { result } = renderHook(() => useStorePermissions());
  expect(result.current.canManageRecipes).toBe(false);
  expect(result.current.canManageStock).toBe(false);
});
it('선택 매장이 없으면 조회·쓰기 권한을 열지 않는다', () => {
  mockHasStore = false; mockRole = 'admin';
  const { result } = renderHook(() => useStorePermissions());
  expect(result.current).toMatchObject({ canReadRecipes: false, canManageRecipes: false, canManageStock: false, canAdjustStock: false });
});

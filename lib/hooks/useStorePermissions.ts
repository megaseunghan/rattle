import { useAuth } from '../contexts/AuthContext';

/** 관리 capability와 일반 직원의 재고·레시피 업무를 분리한다. */
export function useStorePermissions() {
  const { user, store, storeRole, permissionsReady, canManageStore, canReadFinancials, devPreviewMode } = useAuth();
  const ready = !!user && !!store && permissionsReady;
  const preview = devPreviewMode !== 'self';
  const isAdmin = ready && canManageStore;
  const regularWork = ready && (canManageStore || storeRole === 'employee');
  return {
    canReadFinancials, isAdmin, isPartTime: storeRole === 'part_timer', permissionsReady: ready,
    canReadRecipes: ready,
    canManageRecipes: regularWork && !preview,
    canManageStock: regularWork && !preview,
    canAdjustStock: ready && !preview,
  };
}

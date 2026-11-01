import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useEmployees } from './useEmployees';
import { resolveSelfEmployee } from '../utils/resolveSelfEmployee';

/**
 * 현재 매장에서의 권한 플래그.
 * - isAdmin: 오너 또는 admin 멤버
 * PERM-20261101: 레시피 조회와 관리 권한을 분리한다.
 * 직원 유형 미확인 상태에서는 쓰기를 허용하지 않는다. 서버 권한 검사는 별도다.
 */
export function useStorePermissions() {
  const { user, store, currentRole, devPreviewEmployeeId, devPreviewMode, canReadFinancials } = useAuth();
  const { employees, loading, error, refetch } = useEmployees();

  useEffect(() => { refetch(); }, [refetch]);

  const myEmployee = resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId);
  const isPartTime = currentRole !== 'admin' && (devPreviewMode === 'part_time' || myEmployee?.employment_type === 'part_time');
  const hasContext = !!user && !!store;
  const isAdmin = hasContext && currentRole === 'admin';
  const employeeKnown = myEmployee?.employment_type === 'regular' || myEmployee?.employment_type === 'part_time';
  const permissionsReady = hasContext && (isAdmin || (!loading && !error && employeeKnown));
  const canManage = permissionsReady && !isPartTime;

  return {
    canReadFinancials,
    isAdmin,
    isPartTime,
    permissionsReady,
    canReadRecipes: hasContext,
    canManageRecipes: canManage,
    canManageStock: canManage,
    canAdjustStock: permissionsReady,
  };
}

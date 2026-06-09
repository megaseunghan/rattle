import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useEmployees } from './useEmployees';

/**
 * 현재 매장에서의 권한 플래그.
 * - isAdmin: 오너 또는 admin 멤버
 * - isPartTime: 연결된 직원이 part_time (하단 탭 간소화·레시피 차단 대상)
 * - canManageRecipes: 레시피 조회·수정 가능 (멤버 가능, 파트타이머 차단)
 */
export function useStorePermissions() {
  const { user, currentRole } = useAuth();
  const { employees, refetch } = useEmployees();

  useEffect(() => { refetch(); }, [refetch]);

  const isPartTime = currentRole !== 'admin'
    && employees.some(e => e.user_id === user?.id && e.employment_type === 'part_time');

  return {
    isAdmin: currentRole === 'admin',
    isPartTime,
    canManageRecipes: !isPartTime,
  };
}

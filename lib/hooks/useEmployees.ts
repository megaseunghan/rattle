import { getErrorMessage, UserFacingError } from '../utils/error';
import { useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient, queryKeys, useQueryScope, isAccessDenied } from '../query';
import { STALE_TIME } from '../query/staleTimes';
import { useAuth } from '../contexts/AuthContext';
import {
  getEmployees, createEmployee, updateEmployee, deactivateEmployee, deleteEmployee,
} from '../services/employees';
import { Employee, EmploymentType } from '../../types';

/** active가 false면 자동으로 받지 않는다(숨은 탭). 탭에 들어오면 오래된 경우에만 다시 받는다. */
export function useEmployees(includeInactive = false, active = true) {
  const { store, access, canManageStore } = useAuth();
  const scope = useQueryScope();
  const activeScope = useRef(scope); activeScope.current = scope;
  const assertManage = () => {
    if (!canManageStore || activeScope.current !== scope) throw new UserFacingError('사장님이나 점장님에게 요청해주세요.');
  };
  // 인건비 탭(퇴사자 포함, 급여 필드)은 1분, 홈 본인 확인 등 재직자 목록은 30분 재사용한다. 직원 저장은 매장 전체 무효화로 바로 반영된다.
  const staleTime = includeInactive ? STALE_TIME.moneyDetail : STALE_TIME.config;
  const key = useMemo(() => queryKeys.store(scope, store?.id ?? '', 'employees', includeInactive), [scope, store?.id, includeInactive]);
  const query = useQuery({ queryKey: key, queryFn: () => getEmployees(store!.id, includeInactive),
    enabled: active && !!store, staleTime }, queryClient);
  const employees = isAccessDenied(query.error) ? [] : query.data ?? [];
  const loading = query.isPending && query.isFetching;
  const error = query.error ? getErrorMessage(query.error) : null;
  /**
   * 화면 진입 때 직접 부르는 확인(본인 연결 여부 등)은 예전처럼 1분 기준으로 다시 받는다.
   * 홈처럼 자동 조회만 쓰는 곳은 useQuery의 30분 재사용을 따른다. force는 항상 다시 받는다.
   */
  const refetch = useCallback(async (force = false) => {
    if (!store) return;
    if (force) await queryClient.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' });
    try { await queryClient.fetchQuery({ queryKey: key, queryFn: () => getEmployees(store.id, includeInactive), staleTime: Math.min(staleTime, STALE_TIME.default) }); }
    catch { /* Query observer exposes the failure without an unhandled effect promise. */ }
  }, [store?.id, includeInactive, key, staleTime]);

  const add = useCallback(async (data: {
    name: string;
    employment_type: EmploymentType;
    base_salary: number;
    hourly_wage?: number | null;
    non_taxable: number;
    is_probation?: boolean;
    probation_started_at?: string | null;
    weekly_hours?: number | null;
    dependents: number;
    user_id?: string | null;
  }) => {
    assertManage();
    if (!store) throw new UserFacingError('매장 정보를 다시 확인해주세요.');
    const created = await createEmployee({ is_probation: false, ...data, store_id: store.id });
    return created;
  }, [store, scope, canManageStore]);

  const update = useCallback(async (
    id: string,
    updates: Partial<Omit<Employee, 'id' | 'store_id' | 'created_at'>>,
  ) => {
    assertManage();
    const updated = await updateEmployee(id, updates);
    return updated;
  }, [scope, canManageStore, access]);

  const deactivate = useCallback(async (id: string) => {
    assertManage();
    if (!access.is_owner && id === access.employee_id) throw new UserFacingError('본인 직원 정보 해제는 사장님에게 요청해주세요.');
    await deactivateEmployee(id);
  }, [scope, canManageStore, access]);

  const remove = useCallback(async (id: string) => {
    assertManage();
    if (!access.is_owner && id === access.employee_id) throw new UserFacingError('본인 직원 정보 삭제는 사장님에게 요청해주세요.');
    await deleteEmployee(id);
  }, [scope, canManageStore, access]);

  /** 권한 거절은 빈 목록과 같다(오류로 보이지 않는다). */
  const denied = isAccessDenied(query.error);
  return { employees, loading, error, denied, refetch, add, update, deactivate, remove };
}

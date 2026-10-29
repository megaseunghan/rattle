import { getErrorMessage, UserFacingError } from '../utils/error';
import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient, queryKeys, useQueryScope, isAccessDenied } from '../query';
import { useAuth } from '../contexts/AuthContext';
import {
  getEmployees, createEmployee, updateEmployee, deactivateEmployee, deleteEmployee,
} from '../services/employees';
import { Employee, EmploymentType } from '../../types';

export function useEmployees(includeInactive = false) {
  const { store } = useAuth();
  const scope = useQueryScope();
  const key = useMemo(() => queryKeys.store(scope, store?.id ?? '', 'employees', includeInactive), [scope, store?.id, includeInactive]);
  const query = useQuery({ queryKey: key, queryFn: () => getEmployees(store!.id, includeInactive),
    enabled: !!store, staleTime: 60_000 }, queryClient);
  const employees = isAccessDenied(query.error) ? [] : query.data ?? [];
  const loading = query.isPending && query.isFetching;
  const error = query.error ? getErrorMessage(query.error) : null;
  const refetch = useCallback(async (force = false) => {
    if (!store) return;
    if (force) await queryClient.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' });
    try { await queryClient.fetchQuery({ queryKey: key, queryFn: () => getEmployees(store.id, includeInactive), staleTime: 60_000 }); }
    catch { /* Query observer exposes the failure without an unhandled effect promise. */ }
  }, [store?.id, includeInactive, key]);

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
    if (!store) throw new UserFacingError('매장 정보가 없습니다');
    const created = await createEmployee({ is_probation: false, ...data, store_id: store.id });
    return created;
  }, [store]);

  const update = useCallback(async (
    id: string,
    updates: Partial<Omit<Employee, 'id' | 'store_id' | 'created_at'>>,
  ) => {
    const updated = await updateEmployee(id, updates);
    return updated;
  }, []);

  const deactivate = useCallback(async (id: string) => {
    await deactivateEmployee(id);
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteEmployee(id);
  }, []);

  return { employees, loading, error, refetch, add, update, deactivate, remove };
}

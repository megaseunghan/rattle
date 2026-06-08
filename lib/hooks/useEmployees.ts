import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getEmployees, createEmployee, updateEmployee, deactivateEmployee, deleteEmployee,
} from '../services/employees';
import { seedInitialWage } from '../services/wageHistory';
import { Employee, EmploymentType } from '../../types';

export function useEmployees() {
  const { store } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getEmployees(store.id);
      setEmployees(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [store]);

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
    if (!store) throw new Error('매장 정보가 없습니다');
    const created = await createEmployee({ is_probation: false, ...data, store_id: store.id });
    // 초기 급여 이력 시드 (입사일 또는 오늘부터)
    await seedInitialWage({
      storeId: store.id,
      employeeId: created.id,
      joinedAt: created.joined_at,
      baseSalary: created.base_salary,
      hourlyWage: created.hourly_wage,
      nonTaxable: created.non_taxable,
    }).catch(() => {});
    setEmployees(prev => [...prev, created]);
    return created;
  }, [store]);

  const update = useCallback(async (
    id: string,
    updates: Partial<Omit<Employee, 'id' | 'store_id' | 'created_at'>>,
  ) => {
    const updated = await updateEmployee(id, updates);
    setEmployees(prev => prev.map(e => e.id === id ? updated : e));
    return updated;
  }, []);

  const deactivate = useCallback(async (id: string) => {
    await deactivateEmployee(id);
    setEmployees(prev => prev.filter(e => e.id !== id));
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteEmployee(id);
    setEmployees(prev => prev.filter(e => e.id !== id));
  }, []);

  return { employees, loading, error, refetch, add, update, deactivate, remove };
}

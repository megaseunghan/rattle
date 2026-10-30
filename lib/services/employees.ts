import { UserFacingError } from '../utils/error';
import { supabase } from '../supabase';
import { Employee, EmploymentType } from '../../types';
import { invalidateCachedStore } from './cacheInvalidation';

export async function getEmployees(storeId: string, includeInactive = false): Promise<Employee[]> {
  let query = supabase
    .from('employees')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: true });

  if (!includeInactive) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const employees = (data ?? []) as Employee[];
  if (!employees.length) return employees;
  const { data: wages, error: wageError } = await supabase.from('current_employee_wages')
    .select('employee_id,wage_history_id,effective_date,base_salary,hourly_wage,non_taxable')
    .eq('store_id', storeId).in('employee_id', employees.map(row => row.id));
  if (wageError) throw wageError;
  const byEmployee = new Map((wages ?? []).map(row => [row.employee_id, row]));
  return employees.map(employee => {
    const wage = byEmployee.get(employee.id);
    if (!wage || !wage.wage_history_id || !wage.effective_date || wage.base_salary == null || wage.non_taxable == null) {
      return { ...employee, wage_history_missing: true };
    }
    return { ...employee, base_salary: Number(wage.base_salary),
      hourly_wage: wage.hourly_wage == null ? null : Number(wage.hourly_wage),
      non_taxable: Number(wage.non_taxable), wage_history_missing: false };
  });
}

export async function createEmployee(data: {
  store_id: string;
  name: string;
  employment_type: EmploymentType;
  base_salary: number;
  hourly_wage?: number | null;
  non_taxable: number;
  joined_at?: string | null;
  phone?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  is_probation: boolean;
  probation_started_at?: string | null;
  weekly_hours?: number | null;
  dependents: number;
  user_id?: string | null;
}): Promise<Employee> {
  const { data: row, error } = await supabase
    .rpc('create_employee_with_initial_wage', { p_store_id: data.store_id, p_employee: data })
    .single();

  if (error) throw new Error(error.message);
  await invalidateCachedStore(data.store_id);
  return row as Employee;
}

export async function updateEmployee(
  id: string,
  updates: Partial<Omit<Employee, 'id' | 'store_id' | 'created_at'>>,
): Promise<Employee> {
  const { data: row, error } = await supabase
    .from('employees')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  await invalidateCachedStore(row?.store_id);
  return row as Employee;
}

export async function deactivateEmployee(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('employees')
    .update({ is_active: false })
    .eq('id', id)
    .select('id');

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new UserFacingError('삭제 권한이 없거나 직원을 찾을 수 없습니다.');
  }
  await invalidateCachedStore();
}

export async function deleteEmployee(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('employees')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new UserFacingError('삭제 권한이 없거나 직원을 찾을 수 없습니다.');
  }
  await invalidateCachedStore();
}

/** 로그인 계정에 연결된 본인 직원 레코드 조회 (급여 명세서·스케줄용) */
export async function getMyEmployee(storeId: string, userId: string): Promise<Employee | null> {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('store_id', storeId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Employee | null;
}

/** 수습 기간 중인지 여부 — 입사일 기준 61일 자동 적용 */
export function isInProbation(employee: Employee): boolean {
  if (!employee.joined_at) return false;
  const joined = new Date(employee.joined_at);
  const probationEnd = new Date(joined);
  probationEnd.setDate(probationEnd.getDate() + 61);
  return new Date() < probationEnd;
}

/** 4대보험 적용 여부 */
export function isInsuranceApplicable(employee: Employee): boolean {
  if (employee.employment_type === 'regular') return true;
  // 파트타임: 주 15시간 이상이면 4대보험 적용
  return (employee.weekly_hours ?? 0) >= 15;
}

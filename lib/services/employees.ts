import { supabase } from '../supabase';
import { Employee, EmploymentType } from '../../types';

export async function getEmployees(storeId: string, includeInactive = false): Promise<Employee[]> {
  let query = supabase
    .from('employees')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: true });

  if (!includeInactive) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Employee[];
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
    .from('employees')
    .insert({ ...data, is_active: true, is_resigned_during_probation: false })
    .select()
    .single();

  if (error) throw new Error(error.message);
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
  return row as Employee;
}

export async function deactivateEmployee(id: string): Promise<void> {
  const { error } = await supabase
    .from('employees')
    .update({ is_active: false })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function deleteEmployee(id: string): Promise<void> {
  const { error } = await supabase
    .from('employees')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/** 로그인 계정에 연결된 본인 직원 레코드 조회 (출퇴근용) */
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

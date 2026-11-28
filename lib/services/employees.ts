import { deductionMode, isProbationOn, type IncomeEmployee, type ProbationEmployee } from '../payroll';
import { koreanDate } from '../utils/regularWages';
import { UserFacingError } from '../utils/error';
import { supabase } from '../supabase';
import { Employee, EmploymentType } from '../../types';
import { invalidateCachedStore } from './cacheInvalidation';
import { addWageChange, getWageHistory, type WageChangeInput } from './wageHistory';

/** 서버가 고정 코드로 거절한 저장을 안내 문구로 바꾼다(원문 오류는 그대로 보이지 않게). */
function employeeWriteError(error: { message: string }): Error {
  if (error.message.includes('PROBATION_END_OUT_OF_RANGE')) {
    return new UserFacingError('수습 마지막 날은 입사일부터 3개월 안에서 골라 주세요.');
  }
  if (error.message.includes('weekly_minutes_positive_check')) {
    return new UserFacingError('주 근무시간을 10분 이상으로 골라 주세요.');
  }
  if (error.message.includes('ACCOUNT_NUMBER_INVALID')) {
    return new UserFacingError('계좌번호를 숫자 6~30자리로 입력해 주세요.');
  }
  return new Error(error.message);
}

export async function getEmployees(storeId: string, includeInactive = false): Promise<Employee[]> {
  let query = supabase
    .from('employees')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: true });

  if (!includeInactive) query = query.eq('is_active', true);

  // 직원 목록과 현재 급여를 동시에 읽는다(직원 → 급여 순차 대기 제거). 급여는 매장 범위로 읽고 아래에서 직원별로 맞춘다.
  const [{ data, error }, { data: wages, error: wageError }] = await Promise.all([
    query,
    supabase.from('current_employee_wages')
      .select('employee_id,wage_history_id,effective_date,base_salary,hourly_wage,non_taxable')
      .eq('store_id', storeId),
  ]);
  if (error) throw new Error(error.message);
  const employees = (data ?? []) as Employee[];
  if (!employees.length) return employees;
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

  if (error) throw employeeWriteError(error);
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

  if (error) throw employeeWriteError(error);
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
/** 대상 날짜(기본: 오늘, 한국 날짜) 기준 수습 여부. 사장님이 수습으로 표시한 직원만 해당한다. */
export function isInProbation(employee: ProbationEmployee, date = koreanDate()): boolean {
  return isProbationOn(employee, date);
}

/** 4대보험 적용 여부. 주 근무시간이 비어 있으면 적용 대상으로 보지 않는다(입력 안내). */
export function isInsuranceApplicable(employee: IncomeEmployee): boolean {
  return deductionMode(employee) === 'insured';
}

/** 급여 변경을 보냈지만 결과를 확인하지 못했다. 중복 저장을 막기 위해 다시 보내지 않는다. */
export class WageChangeOutcomeUnknownError extends UserFacingError {
  constructor() {
    super('저장됐는지 확인하지 못했어요. 급여 이력을 먼저 확인해 주세요.');
    this.name = 'WageChangeOutcomeUnknownError';
  }
}

/**
 * 직원 정보의 시급·월급 '바꾸기'. 같은 적용일 이력이 있으면 보내지 않는다.
 * 이력 조회 실패는 다시 시도할 수 있고, 변경 요청을 보낸 뒤의 실패는 결과불명으로 알린다.
 */
export async function changeEmployeeWage(input: WageChangeInput): Promise<void> {
  const history = await getWageHistory(input.employeeId);
  if (history.some(row => row.effective_date === input.effectiveDate)) {
    throw new UserFacingError('같은 날부터 적용하는 급여가 이미 있어요. 급여 이력을 확인해 주세요.');
  }
  try { await addWageChange(input); }
  catch (e) {
    // 서버가 응답한 거절(code 있음)은 저장되지 않은 것이 확실하다. 전송 실패만 결과불명으로 본다.
    const code = (e as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && code !== '') throw mapWageChangeRejection(code);
    throw new WageChangeOutcomeUnknownError();
  }
}

function mapWageChangeRejection(code: string): UserFacingError {
  if (code === '42501') return new UserFacingError('급여를 바꿀 권한이 없어요. 관리 권한을 확인해 주세요.');
  return new UserFacingError('급여를 바꾸지 못했어요. 적용일과 금액을 확인해 주세요.');
}

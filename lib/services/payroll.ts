import { invalidateCachedStore } from './cacheInvalidation';
import { UserFacingError } from '../utils/error';
import { supabase } from '../supabase';
import { Employee, Payroll, PayrollWorkHistory } from '../../types';
import { deductionMode, employeeInsurance, floorTo, freelancerWithholding, insuranceRatesFor, missingStandardMessage,
  monthProbationFactor, PayrollStandardMissingError, probationFactorOn, type ProbationEmployee } from '../payroll';
import { calculateHourlyGross, parseWorkedMinutes } from '../utils/workMinutes';

export interface PayrollDeductions {
  national_pension: number;
  health_insurance: number;
  long_term_care: number;
  employment_insurance: number;
  income_tax: number;
  local_income_tax: number;
  withholding_tax: number;
}

/** 정산 전 누락 점검: 급여는 전 직원, 총 근무 분은 파트타이머만 필수다. 0분은 입력 완료로 본다. */
export function getPayrollSettlementGaps(employees: Employee[], payrolls: Payroll[]) {
  const payrollByEmployee = new Map(payrolls.map(payroll => [payroll.employee_id, payroll]));
  const activeEmployees = employees.filter(employee => employee.is_active);
  return {
    missingPayroll: activeEmployees.filter(employee => !payrollByEmployee.has(employee.id)),
    missingPartTimeMinutes: activeEmployees.filter(employee => {
      const payroll = payrollByEmployee.get(employee.id);
      return employee.employment_type === 'part_time' && payroll != null && payroll.worked_minutes == null;
    }),
  };
}

export function calculateNetPayFromDeductions(
  gross: number,
  deductions: PayrollDeductions,
): number {
  const totalDeduction = Object.values(deductions).reduce((sum, value) => sum + value, 0);
  return Math.max(0, gross - totalDeduction);
}

// ─── 수습 계수 (실지급 기준) ─────────────────────────────
// 사장님이 수습으로 표시한 직원에게만, 계산 대상 날짜 기준으로 직원 수습 비율(기본 90%)을 적용한다(수습 중 퇴사 80% 규칙은 2026-v2에서 제거).
export function probationFactor(employee: ProbationEmployee, yearMonth: string): number {
  return monthProbationFactor(employee, yearMonth);
}
/** 정규직 일할 스냅샷용 날짜별 계수. */
export function probationDayFactor(employee: ProbationEmployee): (date: string) => number {
  return date => probationFactorOn(employee, date);
}

// ─── 소득세 간이세액표 조회 ───────────────────────────────
/** 간이세액표 첫 구간(월 77만 원) 미만은 세액이 없다. */
export const SIMPLIFIED_TAX_TABLE_MIN = 770_000;
async function lookupIncomeTax(taxableBase: number, dependents: number, year: number): Promise<number> {
  if (taxableBase < SIMPLIFIED_TAX_TABLE_MIN) return 0;
  const dep = Math.min(Math.max(dependents, 1), 11);
  const { data, error } = await supabase.from('income_tax_table')
    .select(`amount:dep_${dep}`).eq('year', year)
    .lte('salary_from', taxableBase).gt('salary_to', taxableBase)
    .maybeSingle().overrideTypes<{ amount: number | null }>();
  if (error || data?.amount == null || !Number.isFinite(Number(data.amount)) || Number(data.amount) < 0) {
    throw new UserFacingError('급여를 계산하지 못했어요. 잠시 후 다시 시도해주세요.');
  }
  return Number(data.amount);
}

type CalculatedPayroll = Omit<Payroll, 'id' | 'store_id' | 'employee_id' | 'year_month' | 'created_at' | 'is_settled' | 'settled_at'>;

function standardsFor(yearMonth: string) {
  try {
    return insuranceRatesFor(yearMonth);
  } catch (error) {
    if (error instanceof PayrollStandardMissingError) throw new UserFacingError(missingStandardMessage(error));
    throw error;
  }
}

function result(calculation_version: string, gross: number, parts: Partial<CalculatedPayroll> = {}): CalculatedPayroll {
  const row = { calculation_version, gross, taxable_base: 0, national_pension: 0, health_insurance: 0, long_term_care: 0,
    employment_insurance: 0, income_tax: 0, local_income_tax: 0, withholding_tax: 0, ...parts };
  const deductions = row.national_pension + row.health_insurance + row.long_term_care + row.employment_insurance
    + row.income_tax + row.local_income_tax + row.withholding_tax;
  return { ...row, net_pay: Math.max(0, gross - deductions) } as CalculatedPayroll;
}

// ─── 급여 계산 (예상값) ───────────────────────────────────
export async function calculatePayroll(employee: Employee, work?: { minutes: number; hourlyWage: number }, yearMonth = new Date().toISOString().slice(0, 7), grossOverride?: number): Promise<CalculatedPayroll> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) throw new UserFacingError('대상 월을 확인해주세요.');
  const year = Number(yearMonth.slice(0, 4));
  if (grossOverride !== undefined && (!Number.isSafeInteger(grossOverride) || grossOverride < 0)) {
    throw new UserFacingError('세전 금액을 다시 확인해주세요.');
  }
  // 확인된 기준이 없는 달은 다른 해 요율로 소급·미래 계산하지 않는다.
  const { rates, pensionBounds } = standardsFor(yearMonth);
  const version = rates.version;
  if (employee.employment_type === 'part_time' && !work && grossOverride === undefined) {
    throw new UserFacingError('파트타이머의 총 근무 분과 적용 시급을 먼저 입력해주세요.');
  }
  const gross = grossOverride ?? (employee.employment_type === 'part_time' && work
    ? calculateHourlyGross(work.minutes, work.hourlyWage)
    : Math.floor(employee.base_salary * probationFactor(employee, yearMonth)));
  if (gross === 0) return result(version, 0);

  const mode = deductionMode(employee);
  // 주 근무시간이 비어 있으면 3.3%로 추정하지 않고 공제 없이 둔다(화면에서 입력 안내).
  if (mode === 'needs_hours') return result(version, gross);
  if (mode === 'freelancer') {
    const tax = freelancerWithholding(gross);
    return result(version, gross, { withholding_tax: tax.income_tax + tax.local_income_tax });
  }

  const taxableBase = Math.max(0, gross - employee.non_taxable);
  const insurance = mode === 'insured' ? employeeInsurance(taxableBase, rates, pensionBounds) : {};
  const incomeTax = await lookupIncomeTax(taxableBase, employee.dependents, year);
  return result(version, gross, { taxable_base: taxableBase, ...insurance,
    income_tax: incomeTax, local_income_tax: floorTo(incomeTax * 0.1, 10) });
}

// ─── DB CRUD ──────────────────────────────────────────────
export async function getPayrollByMonth(
  storeId: string,
  yearMonth: string,
): Promise<Payroll[]> {
  const { data, error } = await supabase
    .from('payroll')
    .select('*')
    .eq('store_id', storeId)
    .eq('year_month', yearMonth)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Payroll[];
}

/** 마이페이지 급여 명세서(화면 25)용 — 특정 직원의 특정 월 확정 급여 1건 */
export async function getMyPayroll(
  employeeId: string,
  yearMonth: string,
): Promise<Payroll | null> {
  const { data, error } = await supabase
    .from('payroll')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('year_month', yearMonth)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as Payroll | null;
}

export async function upsertPayroll(
  storeId: string,
  employeeId: string,
  yearMonth: string,
  calculated: Omit<Payroll, 'id' | 'store_id' | 'employee_id' | 'year_month' | 'created_at' | 'is_settled' | 'settled_at'>,
): Promise<Payroll> {
  const { data, error } = await supabase
    .from('payroll')
    .insert({ store_id: storeId, employee_id: employeeId, year_month: yearMonth, ...calculated })
    .select()
    .single();

  if (error?.code === '23505') throw new UserFacingError('이미 작성된 월 급여가 있어요. 새로고침해 확인해주세요.');
  if (error) throw new Error(error.message);
  await invalidateCachedStore(storeId);
  return data as Payroll;
}

export async function deletePayroll(id: string): Promise<void> {
  const { error } = await supabase.from('payroll').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await invalidateCachedStore();
}

export interface WorkedMinutesInput {
  minutes: string;
  hourlyWage: number | null;
  note: string;
  submissionId?: string;
}

/** 근무시간과 급여를 한 번에 저장. revision으로 다른 기기의 변경을 덮어쓰지 않는다. */
export async function saveWorkedMinutes(
  storeId: string, employee: Employee, yearMonth: string,
  input: WorkedMinutesInput, previous?: Payroll,
): Promise<Payroll> {
  const minutes = parseWorkedMinutes(input.minutes, yearMonth);
  if (employee.store_id !== storeId || (previous && (previous.store_id !== storeId
    || previous.employee_id !== employee.id || previous.year_month !== yearMonth))) {
    throw new UserFacingError('매장·직원·대상 월을 다시 확인해주세요.');
  }
  const note = input.note.trim();
  if (!note) throw new UserFacingError('입력 근거 또는 수정 사유를 적어주세요.');
  if (note.length > 1000) throw new UserFacingError('메모는 1,000자 이내로 입력해주세요.');
  const isPart = employee.employment_type === 'part_time';
  const hourlyWage = isPart ? input.hourlyWage : null;
  if (isPart && (!hourlyWage || !Number.isFinite(hourlyWage) || hourlyWage < 0 || hourlyWage >= 100_000_000
    || Math.abs(hourlyWage * 10000 - Math.round(hourlyWage * 10000)) > 0.0001)) {
    throw new UserFacingError('적용 시급을 0원 초과, 소수 넷째 자리 이내로 입력해주세요.');
  }
  // 정규직의 근무시간 기록은 기존 공제·월급을 변경하지 않는다.
  const calculated = !isPart && previous
    ? { gross: previous.gross, taxable_base: previous.taxable_base,
      national_pension: previous.national_pension, health_insurance: previous.health_insurance,
      long_term_care: previous.long_term_care, employment_insurance: previous.employment_insurance,
      income_tax: previous.income_tax, local_income_tax: previous.local_income_tax,
      withholding_tax: previous.withholding_tax, net_pay: previous.net_pay }
    : await calculatePayroll(employee, isPart ? { minutes, hourlyWage: hourlyWage! } : undefined, yearMonth);
  const payload = { ...calculated, worked_minutes: minutes, applied_hourly_wage: hourlyWage,
    work_submission_id: input.submissionId ?? null,
    work_note: note, work_source: 'manual', is_settled: false, settled_at: null };
  const query = previous
    ? supabase.from('payroll').update(payload).eq('id', previous.id)
      .eq('store_id', storeId).eq('employee_id', employee.id).eq('year_month', yearMonth)
      .eq('revision', previous.revision ?? 0)
    : supabase.from('payroll').insert({ ...payload, store_id: storeId, employee_id: employee.id, year_month: yearMonth });
  const { data, error } = await query.select().maybeSingle();
  if (error) {
    if (error.code === '23505') throw new UserFacingError('다른 곳에서 급여를 작성했어요. 새로고침 후 다시 확인해주세요.');
    throw new Error(error.message);
  }
  if (!data) throw new UserFacingError('다른 곳에서 내역이 변경됐어요. 새로고침 후 다시 확인해주세요.');
  await invalidateCachedStore(storeId);
  return data as Payroll;
}

export async function getPayrollWorkHistory(storeId: string, employeeId: string, yearMonth: string): Promise<PayrollWorkHistory[]> {
  const { data, error } = await supabase.from('payroll_work_history').select('*')
    .eq('store_id', storeId).eq('employee_id', employeeId).eq('year_month', yearMonth)
    .order('changed_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PayrollWorkHistory[];
}

/** 실제 고지·지급 내역에 맞춰 공제액을 직접 수정한다. 수정 시 기존 정산 확정은 해제된다. */
export async function updatePayrollDeductions(
  payroll: Pick<Payroll, 'id' | 'gross' | 'revision'>,
  deductions: PayrollDeductions,
): Promise<Payroll> {
  const normalized = Object.fromEntries(
    Object.entries(deductions).map(([key, value]) => [key, Math.max(0, Math.round(value))]),
  ) as unknown as PayrollDeductions;
  const totalDeduction = Object.values(normalized).reduce((sum, value) => sum + value, 0);

  if (totalDeduction > payroll.gross) {
    throw new UserFacingError('공제 합계는 세전 급여보다 클 수 없습니다.');
  }

  const { data, error } = await supabase
    .from('payroll')
    .update({
      ...normalized,
      net_pay: calculateNetPayFromDeductions(payroll.gross, normalized),
      is_settled: false,
      settled_at: null,
    })
    .eq('id', payroll.id)
    .eq('revision', payroll.revision ?? 0)
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new UserFacingError('다른 곳에서 급여가 변경됐어요. 새로고침 후 공제액을 다시 확인해주세요.');
  await invalidateCachedStore();
  return data as Payroll;
}

/** 화면 42: 급여 정산 리포트 — 선택한 급여 건들을 정산 완료 처리 */
export async function settlePayrolls(ids: string[]): Promise<void> {
  const requested = [...new Set(ids)];
  if (requested.length === 0) return;
  const { data, error } = await supabase
    .from('payroll')
    .update({ is_settled: true, settled_at: new Date().toISOString() })
    .in('id', requested)
    .select('id');
  if (error) throw new Error(error.message);
  const returned = new Set((data ?? []).map((row: { id: string }) => row.id));
  const complete = returned.size === requested.length && requested.every(id => returned.has(id));
  try {
    await invalidateCachedStore();
  } catch {
    if (complete) throw new UserFacingError('정산은 저장됐어요. 화면 갱신에 실패했으니 다시 불러와 확인해주세요.');
  }
  if (!complete) throw new UserFacingError('일부 급여가 처리되지 않았어요. 처리된 정산은 유지돼요. 목록을 다시 불러와 남은 항목을 확인해주세요.');
}

import { invalidateCachedStore } from './cacheInvalidation';
import { UserFacingError } from '../utils/error';
import { supabase } from '../supabase';
import { Employee, Payroll, PayrollWorkHistory } from '../../types';
import { isInProbation, isInsuranceApplicable } from './employees';
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

// ─── 버림 헬퍼 ───────────────────────────────────────────
function floorTo(n: number, unit: number): number {
  return Math.floor(n / unit) * unit;
}

// ─── 수습 계수 (실지급 기준) ─────────────────────────────
// 수습 기간엔 실제로 90% 지급(수습 중 퇴사 80%)이므로 gross 자체에 적용
export function probationFactor(employee: Pick<Employee, 'is_resigned_during_probation' | 'joined_at'>): number {
  if (employee.is_resigned_during_probation) return 0.8;
  if (isInProbation(employee as Employee)) return 0.9;
  return 1;
}

// ─── 소득세 간이세액표 조회 ───────────────────────────────
async function lookupIncomeTax(taxableBase: number, dependents: number, year: number): Promise<number> {
  if (taxableBase === 0) return 0;
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

// ─── 급여 계산 ────────────────────────────────────────────
export async function calculatePayroll(employee: Employee, work?: { minutes: number; hourlyWage: number }, yearMonth = new Date().toISOString().slice(0, 7), grossOverride?: number): Promise<Omit<Payroll, 'id' | 'store_id' | 'employee_id' | 'year_month' | 'created_at' | 'is_settled' | 'settled_at'>> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) throw new UserFacingError('대상 월을 확인해주세요.');
  const year = Number(yearMonth.slice(0, 4));
  // 다른 연도의 보험 기준이 준비되기 전에는 기존 비율로 소급·미래 계산하지 않는다.
  if (year !== 2026) throw new UserFacingError('해당 연도의 급여 계산 기준이 준비되지 않았어요.');
  if (grossOverride !== undefined && (!Number.isSafeInteger(grossOverride) || grossOverride < 0)) {
    throw new UserFacingError('세전 금액을 다시 확인해주세요.');
  }
  const calculation_version = '2026-v1';
  const useInsurance = isInsuranceApplicable(employee);
  if (employee.employment_type === 'part_time' && !work && grossOverride === undefined) {
    throw new UserFacingError('파트타이머의 총 근무 분과 적용 시급을 먼저 입력해주세요.');
  }
  // 수습 기간 실지급 90%(중도퇴사 80%)를 gross에 직접 반영
  const gross = grossOverride ?? (employee.employment_type === 'part_time' && work
    ? calculateHourlyGross(work.minutes, work.hourlyWage)
    : Math.floor(employee.base_salary * probationFactor(employee)));

  if (gross === 0) {
    return { calculation_version, gross: 0, taxable_base: 0, national_pension: 0, health_insurance: 0,
      long_term_care: 0, employment_insurance: 0, income_tax: 0, local_income_tax: 0,
      withholding_tax: 0, net_pay: 0 };
  }

  if (!useInsurance) {
    // 3.3% 원천징수 (파트타임 주 15h 미만)
    const withholding = floorTo(Math.round(gross * 0.033), 10);
    return {
      calculation_version, gross,
      taxable_base: 0,
      national_pension: 0,
      health_insurance: 0,
      long_term_care: 0,
      employment_insurance: 0,
      income_tax: 0,
      local_income_tax: 0,
      withholding_tax: withholding,
      net_pay: gross - withholding,
    };
  }

  // 4대보험 적용 (gross에 수습 계수가 이미 반영됨)
  const taxableBase = Math.max(0, gross - employee.non_taxable);

  // 국민연금: min(max(과세기준액, 390,000), 6,170,000) × 4.75% → 10원 미만 버림
  const npBase = Math.min(Math.max(taxableBase, 390_000), 6_170_000);
  const nationalPension = floorTo(Math.round(npBase * 0.0475), 10);

  // 건강보험: × 3.595% → 10원 미만 버림
  const healthInsurance = floorTo(Math.round(taxableBase * 0.03595), 10);

  // 장기요양: 과세기준액 × 0.4724% → 10원 미만 버림
  const longTermCare = floorTo(Math.round(taxableBase * 0.004724), 10);

  // 고용보험: × 0.9% → 10원 미만 버림
  const employmentInsurance = floorTo(Math.round(taxableBase * 0.009), 10);

  // 소득세 (간이세액표)
  const incomeTax = await lookupIncomeTax(taxableBase, employee.dependents, year);

  // 지방소득세: 소득세 × 10% → 10원 미만 버림
  const localIncomeTax = floorTo(incomeTax * 0.1, 10);

  const totalDeduction = nationalPension + healthInsurance + longTermCare
    + employmentInsurance + incomeTax + localIncomeTax;

  return {
    calculation_version, gross,
    taxable_base: taxableBase,
    national_pension: nationalPension,
    health_insurance: healthInsurance,
    long_term_care: longTermCare,
    employment_insurance: employmentInsurance,
    income_tax: incomeTax,
    local_income_tax: localIncomeTax,
    withholding_tax: 0,
    net_pay: gross - totalDeduction,
  };
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
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('payroll')
    .update({ is_settled: true, settled_at: new Date().toISOString() })
    .in('id', ids);
  if (error) throw new Error(error.message);
  await invalidateCachedStore();
}

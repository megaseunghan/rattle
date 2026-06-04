import { supabase } from '../supabase';
import { Employee, Payroll } from '../../types';
import { isInProbation, isInsuranceApplicable } from './employees';

// ─── 버림 헬퍼 ───────────────────────────────────────────
function floorTo(n: number, unit: number): number {
  return Math.floor(n / unit) * unit;
}

// ─── 과세기준액 계산 ──────────────────────────────────────
function calcTaxableBase(employee: Employee): number {
  const gross = employee.base_salary - employee.non_taxable;
  if (employee.is_resigned_during_probation) return Math.floor(gross * 0.8);
  if (isInProbation(employee)) return Math.floor(gross * 0.9);
  return gross;
}

// ─── 소득세 간이세액표 조회 ───────────────────────────────
async function lookupIncomeTax(taxableBase: number, dependents: number): Promise<number> {
  const dep = Math.min(Math.max(dependents, 1), 11);
  const colName = `dep_${dep}`;

  const { data } = await supabase
    .from('income_tax_table')
    .select(`${colName}`)
    .eq('year', 2026)
    .lte('salary_from', taxableBase)
    .gt('salary_to', taxableBase)
    .maybeSingle();

  if (data && data[colName] != null) return Number(data[colName]);

  // 테이블에 해당 구간 없으면 코드로 근사값 계산
  return calcIncomeTaxApprox(taxableBase, dependents);
}

/** 간이세액표 없을 때 연산 근사값 (국세청 2025년 세율 기준) */
function calcIncomeTaxApprox(monthly: number, dependents: number): number {
  const annual = monthly * 12;

  // 근로소득공제
  let deduction: number;
  if (annual <= 5_000_000) deduction = annual * 0.7;
  else if (annual <= 15_000_000) deduction = 3_500_000 + (annual - 5_000_000) * 0.4;
  else if (annual <= 45_000_000) deduction = 7_500_000 + (annual - 15_000_000) * 0.15;
  else if (annual <= 100_000_000) deduction = 12_000_000 + (annual - 45_000_000) * 0.05;
  else deduction = 14_750_000 + (annual - 100_000_000) * 0.02;
  deduction = Math.min(deduction, 20_000_000);

  // 인적공제 (1인 150만)
  const personalDeduction = 1_500_000 * dependents;
  const taxBase = Math.max(0, annual - deduction - personalDeduction);
  if (taxBase === 0) return 0;

  // 누진세율
  let tax: number;
  if (taxBase <= 14_000_000) tax = taxBase * 0.06;
  else if (taxBase <= 50_000_000) tax = 840_000 + (taxBase - 14_000_000) * 0.15;
  else if (taxBase <= 88_000_000) tax = 6_240_000 + (taxBase - 50_000_000) * 0.24;
  else if (taxBase <= 150_000_000) tax = 15_360_000 + (taxBase - 88_000_000) * 0.35;
  else if (taxBase <= 300_000_000) tax = 37_060_000 + (taxBase - 150_000_000) * 0.38;
  else if (taxBase <= 500_000_000) tax = 94_060_000 + (taxBase - 300_000_000) * 0.40;
  else tax = 174_060_000 + (taxBase - 500_000_000) * 0.42;

  // 근로소득세액공제
  let credit: number;
  if (tax <= 730_000) credit = tax * 0.55;
  else credit = 401_500 + (tax - 730_000) * 0.30;
  const creditLimit = annual <= 33_000_000 ? 740_000 : annual <= 70_000_000 ? 660_000 : 500_000;
  credit = Math.min(credit, creditLimit);

  return Math.max(0, Math.floor((tax - credit) / 12));
}

// ─── 급여 계산 ────────────────────────────────────────────
export async function calculatePayroll(employee: Employee): Promise<Omit<Payroll, 'id' | 'store_id' | 'employee_id' | 'year_month' | 'created_at'>> {
  const useInsurance = isInsuranceApplicable(employee);
  const gross = employee.base_salary;

  if (!useInsurance) {
    // 3.3% 원천징수 (파트타임 주 15h 미만)
    const withholding = floorTo(Math.round(gross * 0.033), 10);
    return {
      gross,
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

  // 4대보험 적용
  const taxableBase = calcTaxableBase(employee);

  // 국민연금: min(max(과세기준액, 390,000), 6,170,000) × 4.75% → 천원 미만 버림
  const npBase = Math.min(Math.max(taxableBase, 390_000), 6_170_000);
  const nationalPension = floorTo(Math.round(npBase * 0.0475), 1_000);

  // 건강보험: × 3.595% → 10원 미만 버림
  const healthInsurance = floorTo(Math.round(taxableBase * 0.03595), 10);

  // 장기요양: 과세기준액 × 0.4724% → 10원 미만 버림
  const longTermCare = floorTo(Math.round(taxableBase * 0.004724), 10);

  // 고용보험: × 0.9% → 10원 미만 버림
  const employmentInsurance = floorTo(Math.round(taxableBase * 0.009), 10);

  // 소득세 (간이세액표)
  const incomeTax = await lookupIncomeTax(taxableBase, employee.dependents);

  // 지방소득세: 소득세 × 10% → 원 단위
  const localIncomeTax = Math.floor(incomeTax * 0.1);

  const totalDeduction = nationalPension + healthInsurance + longTermCare
    + employmentInsurance + incomeTax + localIncomeTax;

  return {
    gross,
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

export async function upsertPayroll(
  storeId: string,
  employeeId: string,
  yearMonth: string,
  calculated: Omit<Payroll, 'id' | 'store_id' | 'employee_id' | 'year_month' | 'created_at'>,
): Promise<Payroll> {
  const { data, error } = await supabase
    .from('payroll')
    .upsert(
      { store_id: storeId, employee_id: employeeId, year_month: yearMonth, ...calculated },
      { onConflict: 'employee_id,year_month' },
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Payroll;
}

export async function deletePayroll(id: string): Promise<void> {
  const { error } = await supabase.from('payroll').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

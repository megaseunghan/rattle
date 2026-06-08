import { supabase } from '../supabase';
import { WageHistory } from '../../types';

/** 특정 직원의 급여 이력 (최신순) */
export async function getWageHistory(employeeId: string): Promise<WageHistory[]> {
  const { data, error } = await supabase
    .from('employee_wage_history')
    .select('*')
    .eq('employee_id', employeeId)
    .order('effective_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as WageHistory[];
}

/** 매장 전체 급여 이력 (effective_date 오름차순) — 손익/인건비 일괄 계산용 */
export async function getStoreWageHistory(storeId: string): Promise<WageHistory[]> {
  const { data, error } = await supabase
    .from('employee_wage_history')
    .select('*')
    .eq('store_id', storeId)
    .order('effective_date', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as WageHistory[];
}

export interface WageChangeInput {
  storeId: string;
  employeeId: string;
  effectiveDate: string;   // 'YYYY-MM-DD'
  baseSalary: number;
  hourlyWage: number | null;
  nonTaxable: number;
  memo?: string | null;
}

/** 급여 변경 기록 추가 + 오늘 기준 유효 급여로 employees 현재값 동기화 */
export async function addWageChange(input: WageChangeInput): Promise<WageHistory> {
  const { data, error } = await supabase
    .from('employee_wage_history')
    .insert({
      store_id: input.storeId,
      employee_id: input.employeeId,
      effective_date: input.effectiveDate,
      base_salary: input.baseSalary,
      hourly_wage: input.hourlyWage,
      non_taxable: input.nonTaxable,
      memo: input.memo ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  // 소급 포함 — 오늘 시점 유효 급여로 employees 현재값을 맞춤
  const history = await getWageHistory(input.employeeId);
  const todayStr = todayISO();
  const current = rateOnDate(history, todayStr);
  if (current) {
    const { error: upErr } = await supabase
      .from('employees')
      .update({
        base_salary: current.base_salary,
        hourly_wage: current.hourly_wage,
        non_taxable: current.non_taxable,
      })
      .eq('id', input.employeeId);
    if (upErr) throw new Error(upErr.message);
  }
  return data as WageHistory;
}

/** 직원 생성 시 초기 급여 이력 시드 (입사일 또는 오늘부터) */
export async function seedInitialWage(input: {
  storeId: string; employeeId: string; joinedAt: string | null;
  baseSalary: number; hourlyWage: number | null; nonTaxable: number;
}): Promise<void> {
  const { error } = await supabase.from('employee_wage_history').insert({
    store_id: input.storeId,
    employee_id: input.employeeId,
    effective_date: input.joinedAt ?? todayISO(),
    base_salary: input.baseSalary,
    hourly_wage: input.hourlyWage,
    non_taxable: input.nonTaxable,
    memo: '최초 등록',
  });
  if (error) throw new Error(error.message);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 주어진 날짜에 유효한 급여 (해당일 이전 가장 최근 effective_date). 그 이전이면 최초 급여로 소급 */
export function rateOnDate(history: WageHistory[], dateStr: string): WageHistory | null {
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) => a.effective_date.localeCompare(b.effective_date));
  let eff: WageHistory | null = null;
  for (const r of sorted) {
    if (r.effective_date <= dateStr) eff = r;
  }
  return eff ?? sorted[0];
}

/**
 * 월간 정규직 세전 누적 (일할, 이력 반영).
 * 진행 중인 달이면 asOf 경과일까지, 과거면 전체, 미래면 0.
 * 각 날짜에 유효한 base_salary / 해당 월 일수 를 합산하여 인상/인하 시점을 정확히 분할.
 */
export function regularGrossForMonth(
  history: WageHistory[],
  year: number,
  month: number,    // 1-12
  asOf: Date,
  factor = 1,       // 수습 등 추가 계수
): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month - 1, daysInMonth);

  let lastDay: number;
  if (asOf < monthStart) lastDay = 0;
  else if (asOf > monthEnd) lastDay = daysInMonth;
  else lastDay = asOf.getDate();

  let sum = 0;
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const rate = rateOnDate(history, dateStr);
    if (rate) sum += rate.base_salary / daysInMonth;
  }
  return Math.round(sum * factor);
}

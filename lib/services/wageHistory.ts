import { readAllRows } from './readAllRows';
import { supabase } from '../supabase';
import { WageHistory } from '../../types';
import { invalidateCachedStore } from './cacheInvalidation';

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
  const data = await readAllRows((start, end) => supabase
    .from('employee_wage_history')
    .select('*')
    .eq('store_id', storeId)
    .order('effective_date', { ascending: true }).order('id').range(start, end));
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
export async function addWageChange(input: WageChangeInput): Promise<WageHistory & { cacheRefreshFailed?: boolean }> {
  const { data, error } = await supabase.rpc('add_employee_wage_change', {
    p_employee_id: input.employeeId,
    p_effective_date: input.effectiveDate,
    p_base_salary: input.baseSalary,
    p_hourly_wage: input.hourlyWage,
    p_non_taxable: input.nonTaxable,
    p_memo: input.memo ?? null,
  }).single();
  if (error) throw new Error(error.message);
  // The transaction is committed. A cache refresh failure must not turn it into a failed write.
  try { await invalidateCachedStore(input.storeId); }
  catch { return { ...(data as WageHistory), cacheRefreshFailed: true }; }
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
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 주어진 날짜에 유효한 급여 (해당일 이전 가장 최근 effective_date).
 * @param strict true면 등록일(최초 effective_date) 이전 날짜에는 null 반환 (소급 안 함).
 *   false(기본)면 그 이전 날짜는 최초 급여로 소급.
 */
export function rateOnDate(
  history: WageHistory[],
  dateStr: string,
  strict = false,
): WageHistory | null {
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) => a.effective_date.localeCompare(b.effective_date)
    || (a.created_at ?? '').localeCompare(b.created_at ?? '')
    || (a.id ?? '').localeCompare(b.id ?? ''));
  let eff: WageHistory | null = null;
  for (const r of sorted) {
    if (r.effective_date <= dateStr) eff = r;
  }
  if (eff) return eff;
  return strict ? null : sorted[0];
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
  employmentStart?: string | null,
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
    if (employmentStart && dateStr < employmentStart) continue;
    // strict: 등록일(최초 effective_date) 이전 날짜는 인건비에 반영하지 않음
    const rate = rateOnDate(history, dateStr, true);
    if (rate) sum += rate.base_salary / daysInMonth;
  }
  return Math.round(sum * factor);
}

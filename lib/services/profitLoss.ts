import { readAllRows } from './readAllRows';
import { supabase } from '../supabase';
import { ProfitLoss, PurchaseCategory, Employee, Payroll } from '../../types';
import { getPurchasesByMonth } from './purchases';
import { getExpensesByMonth, getEffectiveFixedExpenses } from './expenses';
import { getStoreWageHistory } from './wageHistory';
import { probationDayFactor } from './payroll';
import { getManualSalesTotals } from './manualSales';
import { accruedRegularPayroll, koreanDate } from '../utils/regularWages';
import { UserFacingError } from '../utils/error';
import { estimateEmployerInsurance, industrialAccidentTotalRate, type IndustrialAccidentRate } from '../payroll';

function nextMonthStart(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

/** 매장이 고른 산재 업종의 해당 월 합산 요율. 업종을 고르지 않았거나 그 달 요율이 없으면 null('산재보험 미포함'). */
async function getStoreIndustrialAccidentRate(storeId: string, yearMonth: string): Promise<number | null> {
  const { data: store, error } = await supabase.from('stores').select('industrial_accident_industry').eq('id', storeId).maybeSingle();
  if (error) throw error;
  const industry = (store as { industrial_accident_industry?: string | null } | null)?.industrial_accident_industry;
  if (!industry) return null;
  const date = `${yearMonth}-01`;
  const { data, error: rateError } = await supabase.from('industrial_accident_rates')
    .select('rate, commute_rate, wage_claim_rate, asbestos_rate').eq('industry_code', industry)
    .lte('effective_from', date).gte('effective_to', date).order('effective_from', { ascending: false }).limit(1).maybeSingle();
  if (rateError) throw rateError;
  if (!data) return null;
  const row = data as Record<keyof IndustrialAccidentRate, number | string | null>;
  return industrialAccidentTotalRate({ rate: Number(row.rate), commute_rate: Number(row.commute_rate),
    wage_claim_rate: Number(row.wage_claim_rate), asbestos_rate: row.asbestos_rate == null ? null : Number(row.asbestos_rate) });
}

// 카드 매출 대비 카드 수수료율 (1.25%)
const CARD_FEE_RATE = 0.0125;


export async function getYearlyProfitLoss(
  storeId: string,
  year: number,
  closingTime: string,
  asOf = new Date(),
): Promise<{ month: number; data: ProfitLoss }[]> {
  const today = koreanDate(asOf);
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));
  const maxMonth = year === currentYear ? currentMonth : 12;

  const results: { month: number; data: ProfitLoss }[] = [];
  // 한 달에도 여러 DB 조회가 필요하므로 연간 조회가 한꺼번에 몰리지 않게 한다.
  for (let firstMonth = 1; firstMonth <= maxMonth; firstMonth += 2) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(2, maxMonth - firstMonth + 1) }, (_, i) => firstMonth + i).map(async (month) => {
        const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
        const data = await getProfitLossByMonth(storeId, yearMonth, closingTime, asOf);
        return { month, data };
      })
    );
    results.push(...batch);
  }

  return results;
}

function getMonthRevenueRange(yearMonth: string, closingTime: string, asOf: Date): { from: Date; to: Date } {
  const [h, m] = closingTime.split(':').map(Number);
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));

  // 토스 기준: 영업일 D = [D 마감, D+1 마감) → 월 매출 범위 = [M/1 마감, (M+1)/1 마감)
  const from = new Date(Date.UTC(year, month - 1, 1, h - 9, m));
  const to = new Date(Math.min(Date.UTC(year, month, 1, h - 9, m), asOf.getTime()));
  return { from, to };
}

export async function getProfitLossByMonth(
  storeId: string,
  yearMonth: string,
  closingTime: string,
  asOf = new Date(),
): Promise<ProfitLoss> {
  const { error: accessError } = await supabase.rpc('assert_store_finance_access', { p_store_id: storeId });
  if (accessError) throw accessError;

  const { from, to } = getMonthRevenueRange(yearMonth, closingTime, asOf);
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));

  const [revenueResult, manualSalesTotals, purchases, expenses, effectiveFixed, payrollResult, wageHistory, employeesResult, dailyLaborRows, accidentRate] = await Promise.all([
    readAllRows((start, end) => supabase
      .from('toss_orders')
      .select('total_amount, card_amount, cash_amount')
      .eq('store_id', storeId)
      .eq('status', 'COMPLETED')
      .gte('order_at', from.toISOString())
      .lte('order_at', to.toISOString()).order('id').range(start, end)).then(data => ({ data })),
    getManualSalesTotals(storeId, yearMonth),
    getPurchasesByMonth(storeId, yearMonth),
    getExpensesByMonth(storeId, yearMonth),
    getEffectiveFixedExpenses(storeId, yearMonth),
    readAllRows((start, end) => supabase
      .from('payroll')
      .select('*')
      .eq('store_id', storeId)
      .eq('year_month', yearMonth).order('id').range(start, end)).then(data => ({ data })),
    // 급여 이력 (정규직 일할 누적 계산용)
    getStoreWageHistory(storeId),
    // 퇴사한 파트타이머도 이미 작성한 급여의 고용형태를 확인한다.
    readAllRows((start, end) => supabase
      .from('employees')
      .select('*')
      .eq('store_id', storeId).order('id').range(start, end)).then(data => ({ data })),
    // 계정 없는 일용근로자 하루 근무 기록(근무일이 속한 달 인건비).
    readAllRows((start, end) => supabase
      .from('daily_labor_entries')
      .select('id, gross, employment_insurance')
      .eq('store_id', storeId)
      .gte('work_date', `${yearMonth}-01`).lt('work_date', nextMonthStart(yearMonth)).order('id').range(start, end)),
    getStoreIndustrialAccidentRate(storeId, yearMonth),
  ]);

  // 1. 매출 (카드/현금 분리) — Toss POS 동기화분 + 수기 등록분 합산
  const orders = revenueResult.data ?? [];
  const cardRevenue = orders.reduce((s, r) => s + Number(r.card_amount ?? 0), 0) + manualSalesTotals.cardRevenue;
  const cashRevenue = orders.reduce((s, r) => s + Number(r.cash_amount ?? 0), 0) + manualSalesTotals.cashRevenue;
  // card+cash가 0이면 total_amount를 카드로 처리 (구 데이터 호환)
  const revenue = orders.reduce((s, r) => {
    const card = Number(r.card_amount ?? 0);
    const cash = Number(r.cash_amount ?? 0);
    return s + (card + cash > 0 ? card + cash : Number(r.total_amount ?? 0));
  }, 0) + manualSalesTotals.total;

  const purchaseByCategory: Partial<Record<PurchaseCategory, number>> = Object.create(null);
  for (const purchase of purchases) {
    const amounts = purchase.category_amounts ?? { [purchase.category]: purchase.amount };
    for (const [category, amount] of Object.entries(amounts)) {
      purchaseByCategory[category] = (purchaseByCategory[category] ?? 0) + amount;
    }
  }
  const purchaseCost = purchases.reduce((s, p) => s + p.amount, 0);
  const grossProfit = revenue - purchaseCost;

  // 3. 인건비 (직원/파트타이머 분리)
  const payrolls = payrollResult.data ?? [];
  const employees = employeesResult.data ?? [];
  if (payrolls.some(p => p.gross == null || !Number.isFinite(Number(p.gross)))) {
    throw new UserFacingError('저장된 급여 금액을 확인하지 못했어요. 인건비에서 명세를 확인해주세요.');
  }
  let regularGross = 0, regularWithholding = 0;
  const missingWageEmployeeIds: string[] = [];
  let partTimeGross = 0, partTimeWithholding = 0;

  const empTypes: Record<string, string> = {};
  for (const e of employees) empTypes[e.id] = e.employment_type;

  // 급여 이력을 직원별로 그룹화
  const historyByEmp: Record<string, typeof wageHistory> = {};
  for (const w of wageHistory) {
    (historyByEmp[w.employee_id] ??= []).push(w);
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const todayKst = koreanDate(asOf);


  // Saved slips retain their original amounts; current-month display accrues through the same KST day as the summary.
  const recordedEmployees = new Set(payrolls.map(p => p.employee_id).filter(Boolean));
  // 명세가 없는 재직 정규직만 해당 기간의 조건 이력으로 누적 계산한다.
  for (const e of employees) {
    if (e.employment_type === 'part_time' || !e.is_active || recordedEmployees.has(e.id)) continue;
    const monthStart = `${yearMonth}-01`;
    const applicableEnd = [todayKst, `${yearMonth}-${String(daysInMonth).padStart(2, '0')}`].sort()[0];
    const applicableStart = [monthStart, e.joined_at ?? monthStart].sort().at(-1)!;
    if (applicableStart > applicableEnd) continue;
    const history = historyByEmp[e.id] ?? [];
    try { regularGross += accruedRegularPayroll(e as Employee, history, undefined, yearMonth, asOf, probationDayFactor(e)); }
    catch { missingWageEmployeeIds.push(e.id); }
  }

  // 퇴사·연결 해제 후에도 저장된 정규직 명세 금액과 공제를 그대로 보존한다.
  for (const p of payrolls) {
    if (empTypes[p.employee_id] === 'part_time' || p.applied_hourly_wage != null || p.daily_work_snapshot != null || p.work_source === 'legacy_attendance') continue;
    const employee = employees.find(e => e.id === p.employee_id);
    // Detached slips follow the same current/past/future month rule as linked slips and the summary RPC.
    regularGross += accruedRegularPayroll(employee as Employee | undefined, employee ? historyByEmp[employee.id] ?? [] : [], p as Payroll, yearMonth, asOf, employee ? probationDayFactor(employee) : 1);
    const withholding = Number(p.withholding_tax ?? 0) > 0
      ? Number(p.withholding_tax)
      : Number(p.national_pension ?? 0) + Number(p.health_insurance ?? 0) +
        Number(p.long_term_care ?? 0) + Number(p.employment_insurance ?? 0) +
        Number(p.income_tax ?? 0) + Number(p.local_income_tax ?? 0);
    regularWithholding += withholding;
  }

  // 저장된 월별 급여 금액을 사용해 시급 변경·퇴사 이후에도 작성 당시 금액을 보존한다.
  for (const p of payrolls) {
    if (empTypes[p.employee_id] !== 'part_time' && p.applied_hourly_wage == null && p.daily_work_snapshot == null && p.work_source !== 'legacy_attendance') continue;
    if (yearMonth > todayKst.slice(0, 7)) continue;
    partTimeGross += Number(p.gross);
    partTimeWithholding += Number(p.gross) - Number(p.net_pay ?? p.gross);
  }

  const dailyLaborGross = dailyLaborRows.reduce((sum, row) => sum + Number(row.gross), 0);
  const laborCost = missingWageEmployeeIds.length ? null : regularGross + partTimeGross + dailyLaborGross;
  const employer = yearMonth > todayKst.slice(0, 7) ? { amount: 0, industrialAccidentIncluded: accidentRate != null }
    : estimateEmployerInsurance(payrolls.map(p => ({ gross: Number(p.gross), taxable_base: Number(p.taxable_base ?? 0),
      national_pension: Number(p.national_pension ?? 0), health_insurance: Number(p.health_insurance ?? 0),
      long_term_care: Number(p.long_term_care ?? 0), employment_insurance: Number(p.employment_insurance ?? 0), withholding_tax: Number(p.withholding_tax ?? 0) })),
    dailyLaborRows.map(row => ({ gross: Number(row.gross), employment_insurance: Number(row.employment_insurance) })), yearMonth, accidentRate);

  // 4. 비용 (카테고리별)
  // 고정비: 해당 월 등록분이 없으면 직전 등록 월에서 이어받음 (등록일 이후 자동 반영)
  const fixedExpense = effectiveFixed.reduce((s, e) => s + e.amount, 0);
  const marketingExpense = expenses.filter(e => e.category === '마케팅').reduce((s, e) => s + e.amount, 0);
  const maintenanceExpense = expenses.filter(e => e.category === '시설보수').reduce((s, e) => s + e.amount, 0);
  const utilitiesExpense = expenses.filter(e => e.category === '공과금').reduce((s, e) => s + e.amount, 0);
  // 카드 수수료: 카드 매출 × 1.25% (자동 계산, 별도 입력 불필요)
  const cardFeeExpense = Math.round(cardRevenue * CARD_FEE_RATE);
  const variableExpense = marketingExpense + maintenanceExpense + utilitiesExpense + cardFeeExpense;

  // 5. 이익
  // 2026-v2: 사업주 부담 4대보험(예상)도 영업이익에서 뺀다(서버 get_financial_summaries_v2와 같은 식). 확인 못 하면 비운다.
  const operatingProfit = laborCost == null || employer.amount == null ? null : grossProfit - laborCost - fixedExpense - variableExpense - employer.amount;
  // 이 달 명세를 아직 작성하지 않은 재직 직원 수(사업주 부담 추정에서 빠짐).
  const writtenIds = new Set(payrolls.map(p => p.employee_id));
  const employerMissingSlips = yearMonth > todayKst.slice(0, 7) ? 0 : employees.filter(e => e.is_active !== false
    && (!e.joined_at || e.joined_at < nextMonthStart(yearMonth)) && !writtenIds.has(e.id)).length;
  const netProfit = operatingProfit;

  return {
    yearMonth,
    cardRevenue,
    cashRevenue,
    revenue,
    purchaseByCategory,
    purchaseBySupplier: purchases.reduce<Record<string, number>>((groups, purchase) => {
      const supplier = purchase.supplier?.trim() || '거래처 미분류';
      groups[supplier] = (groups[supplier] ?? 0) + Number(purchase.amount);
      return groups;
    }, Object.create(null)),
    purchaseCost,
    grossProfit,
    regularGross: missingWageEmployeeIds.length ? null : regularGross,
    missingWageEmployeeIds,
    regularWithholding,
    partTimeGross,
    partTimeWithholding,
    dailyLaborGross,
    laborCost,
    employerInsurance: employer.amount,
    employerInsuranceIncludesAccident: employer.industrialAccidentIncluded,
    employerInsuranceMissingSlips: employerMissingSlips,
    fixedExpense,
    marketingExpense,
    maintenanceExpense,
    utilitiesExpense,
    cardFeeExpense,
    variableExpense,
    operatingProfit,
    taxReserve: 0,
    netProfit,
  };
}

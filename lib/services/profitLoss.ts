import { supabase } from '../supabase';
import { ProfitLoss, PurchaseCategory } from '../../types';
import { getPurchasesByMonth } from './purchases';
import { getExpensesByMonth } from './expenses';
import { getStoreWageHistory, regularGrossForMonth } from './wageHistory';
import { probationFactor } from './payroll';

export async function getYearlyProfitLoss(
  storeId: string,
  year: number,
  closingTime: string,
): Promise<{ month: number; data: ProfitLoss }[]> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const maxMonth = year === currentYear ? currentMonth : 12;

  const results = await Promise.all(
    Array.from({ length: maxMonth }, (_, i) => i + 1).map(async (month) => {
      const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
      try {
        const data = await getProfitLossByMonth(storeId, yearMonth, closingTime);
        return { month, data };
      } catch {
        return null;
      }
    })
  );

  return results.filter(Boolean) as { month: number; data: ProfitLoss }[];
}

export async function getProfitLossByMonth(
  storeId: string,
  yearMonth: string,
  closingTime: string,
): Promise<ProfitLoss> {
  const [h, m] = closingTime.split(':').map(Number);
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));

  const from = new Date(year, month - 1, 0);
  from.setHours(h, m, 0, 0);
  const to = new Date(year, month, 0);
  to.setHours(h, m, 0, 0);
  if (to > new Date()) to.setTime(Date.now());

  const [revenueResult, purchases, expenses, payrollResult, attendanceResult, wageHistory, employeesResult] = await Promise.all([
    supabase
      .from('toss_orders')
      .select('total_amount, card_amount, cash_amount')
      .eq('store_id', storeId)
      .eq('status', 'COMPLETED')
      .gte('order_at', from.toISOString())
      .lte('order_at', to.toISOString()),
    getPurchasesByMonth(storeId, yearMonth),
    getExpensesByMonth(storeId, yearMonth),
    supabase
      .from('payroll')
      .select('gross, national_pension, health_insurance, long_term_care, employment_insurance, income_tax, local_income_tax, withholding_tax, employee_id')
      .eq('store_id', storeId)
      .eq('year_month', yearMonth),
    // 파트타이머 일일급여: 퇴근 기록의 daily_wage 합산 (영업일 범위)
    supabase
      .from('attendance')
      .select('daily_wage')
      .eq('store_id', storeId)
      .eq('type', 'clock_out')
      .gte('timestamp', from.toISOString())
      .lte('timestamp', to.toISOString()),
    // 급여 이력 (정규직 일할 누적 계산용)
    getStoreWageHistory(storeId),
    // 활성 직원 (고용형태·수습 판별)
    supabase
      .from('employees')
      .select('id, employment_type, joined_at, is_resigned_during_probation')
      .eq('store_id', storeId)
      .eq('is_active', true),
  ]);

  // 1. 매출 (카드/현금 분리)
  const orders = revenueResult.data ?? [];
  const cardRevenue = orders.reduce((s, r) => s + Number(r.card_amount ?? 0), 0);
  const cashRevenue = orders.reduce((s, r) => s + Number(r.cash_amount ?? 0), 0);
  // card+cash가 0이면 total_amount를 카드로 처리 (구 데이터 호환)
  const revenue = orders.reduce((s, r) => {
    const card = Number(r.card_amount ?? 0);
    const cash = Number(r.cash_amount ?? 0);
    return s + (card + cash > 0 ? card + cash : Number(r.total_amount ?? 0));
  }, 0);

  // 2. 매입 (카테고리별)
  const purchaseByCategory: Partial<Record<PurchaseCategory, number>> = {};
  for (const p of purchases) {
    purchaseByCategory[p.category] = (purchaseByCategory[p.category] ?? 0) + p.amount;
  }
  const purchaseCost = purchases.reduce((s, p) => s + p.amount, 0);
  const grossProfit = revenue - purchaseCost;

  // 3. 인건비 (직원/파트타이머 분리)
  const payrolls = payrollResult.data ?? [];
  const employees = employeesResult.data ?? [];
  let regularGross = 0, regularWithholding = 0;
  let partTimeGross = 0, partTimeWithholding = 0;

  const empTypes: Record<string, string> = {};
  for (const e of employees) empTypes[e.id] = e.employment_type;

  // 급여 이력을 직원별로 그룹화
  const historyByEmp: Record<string, typeof wageHistory> = {};
  for (const w of wageHistory) {
    (historyByEmp[w.employee_id] ??= []).push(w);
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const monthEnd = new Date(year, month, 0); monthEnd.setHours(h, m, 0, 0);
  const asOf = Date.now() < monthEnd.getTime() ? new Date() : monthEnd;
  const monthFactor = Date.now() < monthEnd.getTime()
    ? Math.min(1, Math.min(new Date().getDate(), daysInMonth) / daysInMonth)
    : 1;

  // 정규직 세전: 급여 이력 기반 일할 누적 (인상/인하 시점 정확 분할, 과거 보존)
  for (const e of employees) {
    if (e.employment_type === 'part_time') continue;
    regularGross += regularGrossForMonth(historyByEmp[e.id] ?? [], year, month, asOf, probationFactor(e));
  }

  // 정규직 원천징수: payroll 명세 기준, 경과일 비율로 일할 (gross 정합)
  for (const p of payrolls) {
    if (empTypes[p.employee_id] === 'part_time') continue;
    const withholding = Number(p.withholding_tax ?? 0) > 0
      ? Number(p.withholding_tax)
      : Number(p.national_pension ?? 0) + Number(p.health_insurance ?? 0) +
        Number(p.long_term_care ?? 0) + Number(p.employment_insurance ?? 0) +
        Number(p.income_tax ?? 0) + Number(p.local_income_tax ?? 0);
    regularWithholding += Math.round(withholding * monthFactor);
  }

  // 파트타이머 인건비: 퇴근 기록 일일급여 합산 (이미 실근무·당시 시급 기준이라 일할 불필요)
  partTimeGross = (attendanceResult.data ?? []).reduce((s, a: any) => s + Number(a.daily_wage ?? 0), 0);

  const laborCost = regularGross + partTimeGross;

  // 4. 비용 (카테고리별)
  const fixedExpense = expenses.filter(e => e.category === '고정비').reduce((s, e) => s + e.amount, 0);
  const marketingExpense = expenses.filter(e => e.category === '마케팅').reduce((s, e) => s + e.amount, 0);
  const maintenanceExpense = expenses.filter(e => e.category === '시설보수').reduce((s, e) => s + e.amount, 0);
  const utilitiesExpense = expenses.filter(e => e.category === '공과금').reduce((s, e) => s + e.amount, 0);
  const variableExpense = marketingExpense + maintenanceExpense + utilitiesExpense;

  // 5. 이익
  const operatingProfit = grossProfit - laborCost - fixedExpense - variableExpense;
  const netProfit = operatingProfit;

  return {
    yearMonth,
    cardRevenue,
    cashRevenue,
    revenue,
    purchaseByCategory,
    purchaseCost,
    grossProfit,
    regularGross,
    regularWithholding,
    partTimeGross,
    partTimeWithholding,
    laborCost,
    fixedExpense,
    marketingExpense,
    maintenanceExpense,
    utilitiesExpense,
    variableExpense,
    operatingProfit,
    taxReserve: 0,
    netProfit,
  };
}

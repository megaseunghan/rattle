import { supabase } from '../supabase';
import { ProfitLoss, PurchaseCategory } from '../../types';
import { getPurchasesByMonth } from './purchases';
import { getExpensesByMonth } from './expenses';

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

  const [revenueResult, purchases, expenses, payrollResult, attendanceResult] = await Promise.all([
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
  let regularGross = 0, regularWithholding = 0;
  let partTimeGross = 0, partTimeWithholding = 0;

  // employee_id로 고용형태 조회
  const empIds = [...new Set(payrolls.map((p: any) => p.employee_id).filter(Boolean))];
  let empTypes: Record<string, string> = {};
  if (empIds.length > 0) {
    const { data: emps } = await supabase
      .from('employees')
      .select('id, employment_type')
      .in('id', empIds);
    for (const e of (emps ?? [])) empTypes[e.id] = e.employment_type;
  }

  // 정규직: payroll 기준 / 파트타이머: 출퇴근 일일급여 기준 (이중계상 방지)
  for (const p of payrolls) {
    if (empTypes[p.employee_id] === 'part_time') continue;
    const gross = Number(p.gross ?? 0);
    const withholding = Number(p.withholding_tax ?? 0) > 0
      ? Number(p.withholding_tax)
      : Number(p.national_pension ?? 0) + Number(p.health_insurance ?? 0) +
        Number(p.long_term_care ?? 0) + Number(p.employment_insurance ?? 0) +
        Number(p.income_tax ?? 0) + Number(p.local_income_tax ?? 0);
    regularGross += gross;
    regularWithholding += withholding;
  }

  // 정규직: 진행 중인 달이면 경과일 기준 일할 계산 (매출 누적 속도와 정합)
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthEnd = new Date(year, month, 0); monthEnd.setHours(h, m, 0, 0);
  if (Date.now() < monthEnd.getTime()) {
    const elapsedDay = Math.min(new Date().getDate(), daysInMonth);
    const laborFactor = Math.min(1, elapsedDay / daysInMonth);
    regularGross = Math.round(regularGross * laborFactor);
    regularWithholding = Math.round(regularWithholding * laborFactor);
  }

  // 파트타이머 인건비: 퇴근 기록 일일급여 합산 (이미 실근무 기준이라 일할 불필요)
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

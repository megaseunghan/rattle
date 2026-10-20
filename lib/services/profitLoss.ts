import { supabase } from '../supabase';
import { ProfitLoss, PurchaseCategory, PurchaseItem } from '../../types';
import { getPurchasesByMonth, getPurchaseItemsForPurchases } from './purchases';
import { getExpensesByMonth, getEffectiveFixedExpenses } from './expenses';
import { getStoreWageHistory, regularGrossForMonth } from './wageHistory';
import { probationFactor } from './payroll';
import { getManualSalesTotals } from './manualSales';

// 카드 매출 대비 카드 수수료율 (1.25%)
const CARD_FEE_RATE = 0.0125;


export async function getYearlyProfitLoss(
  storeId: string,
  year: number,
  closingTime: string,
): Promise<{ month: number; data: ProfitLoss }[]> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const maxMonth = year === currentYear ? currentMonth : 12;

  const results: { month: number; data: ProfitLoss }[] = [];
  // 한 달에도 여러 DB 조회가 필요하므로 연간 조회가 한꺼번에 몰리지 않게 한다.
  for (let firstMonth = 1; firstMonth <= maxMonth; firstMonth += 2) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(2, maxMonth - firstMonth + 1) }, (_, i) => firstMonth + i).map(async (month) => {
        const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
        const data = await getProfitLossByMonth(storeId, yearMonth, closingTime);
        return { month, data };
      })
    );
    results.push(...batch);
  }

  return results;
}

function getMonthRevenueRange(yearMonth: string, closingTime: string): { from: Date; to: Date } {
  const [h, m] = closingTime.split(':').map(Number);
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));

  // 토스 기준: 영업일 D = [D 마감, D+1 마감) → 월 매출 범위 = [M/1 마감, (M+1)/1 마감)
  const from = new Date(year, month - 1, 1);
  from.setHours(h, m, 0, 0);
  const to = new Date(year, month, 1);
  to.setHours(h, m, 0, 0);
  if (to > new Date()) to.setTime(Date.now());
  return { from, to };
}

export async function getProfitLossByMonth(
  storeId: string,
  yearMonth: string,
  closingTime: string,
): Promise<ProfitLoss> {
  const { from, to } = getMonthRevenueRange(yearMonth, closingTime);
  const [h, m] = closingTime.split(':').map(Number);
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));

  const [revenueResult, manualSalesTotals, purchases, expenses, effectiveFixed, payrollResult, wageHistory, employeesResult] = await Promise.all([
    supabase
      .from('toss_orders')
      .select('total_amount, card_amount, cash_amount')
      .eq('store_id', storeId)
      .eq('status', 'COMPLETED')
      .gte('order_at', from.toISOString())
      .lte('order_at', to.toISOString()),
    getManualSalesTotals(storeId, yearMonth),
    getPurchasesByMonth(storeId, yearMonth),
    getExpensesByMonth(storeId, yearMonth),
    getEffectiveFixedExpenses(storeId, yearMonth),
    supabase
      .from('payroll')
      .select('gross, national_pension, health_insurance, long_term_care, employment_insurance, income_tax, local_income_tax, withholding_tax, employee_id, worked_minutes, work_source, applied_hourly_wage, net_pay')
      .eq('store_id', storeId)
      .eq('year_month', yearMonth),
    // 급여 이력 (정규직 일할 누적 계산용)
    getStoreWageHistory(storeId),
    // 퇴사한 파트타이머도 이미 작성한 급여의 고용형태를 확인한다.
    supabase
      .from('employees')
      .select('id, employment_type, joined_at, is_resigned_during_probation, is_active')
      .eq('store_id', storeId),
  ]);

  for (const result of [revenueResult, payrollResult, employeesResult]) {
    if (result.error) throw new Error(result.error.message);
  }

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

  // 2. 매입 (카테고리별) — 품목 있는 매입은 품목별 category로, 금액만 매입은 purchases.category로 집계
  const purchaseItems = await getPurchaseItemsForPurchases(purchases.map(p => p.id));
  const itemsByPurchase = new Map<string, PurchaseItem[]>();
  for (const it of purchaseItems) {
    const list = itemsByPurchase.get(it.purchase_id) ?? [];
    list.push(it);
    itemsByPurchase.set(it.purchase_id, list);
  }

  const purchaseByCategory: Partial<Record<PurchaseCategory, number>> = {};
  for (const p of purchases) {
    const items = itemsByPurchase.get(p.id) ?? [];
    if (items.length > 0) {
      for (const it of items) {
        const cat = it.category ?? '기타';
        purchaseByCategory[cat] = (purchaseByCategory[cat] ?? 0) + it.subtotal;
      }
    } else {
      purchaseByCategory[p.category] = (purchaseByCategory[p.category] ?? 0) + p.amount;
    }
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
    if (e.employment_type === 'part_time' || !e.is_active) continue;
    regularGross += regularGrossForMonth(historyByEmp[e.id] ?? [], year, month, asOf, probationFactor(e));
  }

  // 정규직 원천징수: payroll 명세 기준, 경과일 비율로 일할 (gross 정합)
  for (const p of payrolls) {
    if (empTypes[p.employee_id] === 'part_time' || p.applied_hourly_wage != null || p.work_source === 'legacy_attendance') continue;
    const withholding = Number(p.withholding_tax ?? 0) > 0
      ? Number(p.withholding_tax)
      : Number(p.national_pension ?? 0) + Number(p.health_insurance ?? 0) +
        Number(p.long_term_care ?? 0) + Number(p.employment_insurance ?? 0) +
        Number(p.income_tax ?? 0) + Number(p.local_income_tax ?? 0);
    regularWithholding += Math.round(withholding * monthFactor);
  }

  // 저장된 월별 급여 금액을 사용해 시급 변경·퇴사 이후에도 작성 당시 금액을 보존한다.
  for (const p of payrolls) {
    if (empTypes[p.employee_id] !== 'part_time' && p.applied_hourly_wage == null && p.work_source !== 'legacy_attendance') continue;
    partTimeGross += Number(p.gross);
    partTimeWithholding += Number(p.gross) - Number(p.net_pay ?? p.gross);
  }

  const laborCost = regularGross + partTimeGross;

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
    cardFeeExpense,
    variableExpense,
    operatingProfit,
    taxReserve: 0,
    netProfit,
  };
}

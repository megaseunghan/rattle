import { supabase } from '../supabase';
import { ProfitLoss } from '../../types';
import { getPurchasesTotalByMonth } from './purchases';
import { getExpensesTotalByMonth } from './expenses';

export async function getProfitLossByMonth(
  storeId: string,
  yearMonth: string, // 'YYYY-MM'
  closingTime: string,
): Promise<ProfitLoss> {
  const [h, m] = closingTime.split(':').map(Number);
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));

  // 해당 월 영업일 범위: 전달 말일 closingTime ~ 해당 월 말일 closingTime
  const from = new Date(year, month - 1, 0);
  from.setHours(h, m, 0, 0);
  const to = new Date(year, month, 0);
  to.setHours(h, m, 0, 0);
  if (to > new Date()) to.setTime(Date.now());

  const [revenueResult, purchaseCost, expensesResult] = await Promise.all([
    supabase
      .from('toss_orders')
      .select('total_amount')
      .eq('store_id', storeId)
      .eq('status', 'COMPLETED')
      .gte('order_at', from.toISOString())
      .lte('order_at', to.toISOString()),
    getPurchasesTotalByMonth(storeId, yearMonth),
    getExpensesTotalByMonth(storeId, yearMonth),
  ]);

  if (revenueResult.error) throw new Error(revenueResult.error.message);

  const revenue = (revenueResult.data ?? []).reduce(
    (sum: number, r: { total_amount: number }) => sum + Number(r.total_amount),
    0,
  );

  const { fixedExpense, variableExpense } = expensesResult;

  // 인건비: payroll 테이블 미구현이므로 0 처리
  const laborCost = await getLaborCostByMonth(storeId, yearMonth);

  const grossProfit = revenue - purchaseCost;
  const operatingProfit = grossProfit - laborCost - fixedExpense - variableExpense;
  // 세금 예수금은 별도 입력 전까지 0
  const taxReserve = 0;
  const netProfit = operatingProfit - taxReserve;

  return {
    yearMonth,
    revenue,
    purchaseCost,
    grossProfit,
    laborCost,
    fixedExpense,
    variableExpense,
    operatingProfit,
    taxReserve,
    netProfit,
  };
}

async function getLaborCostByMonth(storeId: string, yearMonth: string): Promise<number> {
  try {
    // gross = 세전 총 지급액 (net_pay + 4대보험 + 소득세 + 지방소득세)
    const { data } = await supabase
      .from('payroll')
      .select('gross')
      .eq('store_id', storeId)
      .eq('year_month', yearMonth);

    if (!data || data.length === 0) return 0;
    return data.reduce((sum: number, row: any) => sum + Number(row.gross ?? 0), 0);
  } catch {
    // payroll 테이블 미구현 시 0 반환
    return 0;
  }
}

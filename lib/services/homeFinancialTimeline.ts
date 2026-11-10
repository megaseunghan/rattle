import { supabase } from '../supabase';
import { readAllRows } from './readAllRows';
import { getDailyLaborSeries } from './dailyLaborSeries';
import { getDailyExpenseSeries } from './dailyExpenseSeries';
import { getBusinessDayRange } from './posAnalytics';
import { buildCumulativeDays, financialPeriod, type DailyAmount } from '../utils/homeFinancialCard';
/** Admin-only detail reads. Shared members keep the existing aggregate RPC contract. */
export async function getHomeFinancialTimeline(storeId: string, closingTime: string, asOf = new Date()) {
  const { error: denied } = await supabase.rpc('assert_store_finance_access', { p_store_id: storeId });
  if (denied) throw denied;
  const period = financialPeriod(asOf);
  async function read(month: string, through: number, current: boolean) {
    const start = `${month}-01`, end = `${month}-${String(through).padStart(2, '0')}`;
    const from = getBusinessDayRange(start, closingTime).from;
    const until = getBusinessDayRange(end, closingTime).to;
    const to = current ? new Date(Math.min(Date.parse(until), asOf.getTime())).toISOString() : until;
    const [orders, manual, purchases, labor, expense] = await Promise.all([
      from < to ? readAllRows((lo, hi) => supabase.from('toss_orders').select('id,order_at,total_amount,card_amount,cash_amount').eq('store_id', storeId).eq('status', 'COMPLETED').gte('order_at', from).lt('order_at', to).order('id').range(lo, hi)) : Promise.resolve([]),
      readAllRows((lo, hi) => supabase.from('manual_sales').select('id,date,card_amount,cash_amount').eq('store_id', storeId).gte('date', start).lte('date', end).order('id').range(lo, hi)),
      readAllRows((lo, hi) => supabase.from('purchases').select('id,date,amount').eq('store_id', storeId).gte('date', start).lte('date', end).order('id').range(lo, hi)),
      getDailyLaborSeries(storeId, month, through, asOf),
      getDailyExpenseSeries(storeId, month),
    ]);
    const [hour, minute] = closingTime.slice(0, 5).split(':').map(Number);
    const rows: DailyAmount[] = [
      ...orders.map(order => ({ date: new Date(Date.parse(order.order_at) + 9 * 3600000 - (hour * 60 + minute) * 60000).toISOString().slice(0, 10), revenue: Number(order.card_amount ?? 0) + Number(order.cash_amount ?? 0) > 0 ? Number(order.card_amount ?? 0) + Number(order.cash_amount ?? 0) : Number(order.total_amount ?? 0), purchase: 0, cardRevenue: Number(order.card_amount ?? 0) })),
      ...manual.map(row => ({ date: row.date, revenue: Number(row.card_amount ?? 0) + Number(row.cash_amount ?? 0), purchase: 0, cardRevenue: Number(row.card_amount ?? 0) })),
      ...purchases.map(row => ({ date: row.date, revenue: 0, purchase: Number(row.amount) })),
    ];
    if (rows.some(row => !Number.isFinite(row.revenue) || !Number.isFinite(row.purchase) || !Number.isFinite(row.cardRevenue ?? 0))) throw new Error('INVALID_FINANCIAL_AMOUNT');
    const cumulative = buildCumulativeDays(month, through, rows);
    return cumulative.map(day => {
      const date = `${month}-${String(day.day).padStart(2, '0')}`;
      const laborCost = labor.days.find(row => row.date === date)?.cumulative ?? null;
      const expenseCost = expense.days.find(row => row.date === date)?.cumulativeAmount ?? null;
      const cards = rows.filter(row => row.date <= date).reduce((sum, row) => sum + (row.cardRevenue ?? 0), 0);
      // Difference of rounded cumulative fees keeps every prefix aligned with monthly round(card/80).
      const cardFee = Math.sign(cards) * Math.round(Math.abs(cards) / 80);
      const cost = expenseCost == null ? null : expenseCost + cardFee;
      const profit = laborCost == null || cost == null ? null : day.values.revenue! - day.values.purchase! - laborCost - cost;
      return { ...day, hasRecords: day.hasRecords || labor.savedMonthlyGross > 0 || expense.monthlyTotal > 0,
        values: { ...day.values, labor: laborCost, expense: cost, profit } };
    });
  }
  const [current, previous] = await Promise.all([read(period.month, period.day, true), read(period.previousMonth, period.previousDay, false)]);
  return { current, previous: previous.some(day => day.hasRecords) ? previous : [] };
}

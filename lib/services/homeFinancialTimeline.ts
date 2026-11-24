import { supabase } from '../supabase';
import { readAllRows } from './readAllRows';
import { getDailyLaborSeries } from './dailyLaborSeries';
import { getDailyExpenseSeries } from './dailyExpenseSeries';
import { getBusinessDayRange } from './posAnalytics';
import { financialPeriod, type DailyAmount } from '../utils/homeFinancialCard';
/**
 * Admin-only detail reads. Shared members keep the existing aggregate RPC contract.
 * 재무 접근 확인과 일별 조회를 동시에 보내 순차 대기를 줄인다. 확인이 거절되면 함께 받은 자료는 버리고
 * 거절 오류를 먼저 알린다(`get_home_daily_sources`는 자체 관리자 검사가 없어 이 확인이 화면 차단을 맡는다).
 */
export async function getHomeFinancialTimeline(storeId: string, closingTime: string, asOf = new Date()) {
  const access = Promise.resolve(supabase.rpc('assert_store_finance_access', { p_store_id: storeId }))
    .then(({ error }) => { if (error) throw error; });
  const period = financialPeriod(asOf);
  async function read(month: string, through: number, current: boolean) {
    const start = `${month}-01`, end = `${month}-${String(through).padStart(2, '0')}`;
    const from = getBusinessDayRange(start, closingTime).from;
    const until = getBusinessDayRange(end, closingTime).to;
    const to = current ? new Date(Math.min(Date.parse(until), asOf.getTime())).toISOString() : until;
    const [hour, minute] = closingTime.slice(0, 5).split(':').map(Number);
    async function rawRows(): Promise<DailyAmount[]> {
      const [orders, manual, purchases] = await Promise.all([
        from < to ? readAllRows((lo, hi) => supabase.from('toss_orders').select('id,order_at,total_amount,card_amount,cash_amount').eq('store_id', storeId).eq('status', 'COMPLETED').gte('order_at', from).lt('order_at', to).order('id').range(lo, hi)) : Promise.resolve([]),
        readAllRows((lo, hi) => supabase.from('manual_sales').select('id,date,card_amount,cash_amount').eq('store_id', storeId).gte('date', start).lte('date', end).order('id').range(lo, hi)),
        readAllRows((lo, hi) => supabase.from('purchases').select('id,date,amount').eq('store_id', storeId).gte('date', start).lte('date', end).order('id').range(lo, hi)),
      ]);
      return [
        ...orders.map(order => ({ date: new Date(Date.parse(order.order_at) + 9 * 3600000 - (hour * 60 + minute) * 60000).toISOString().slice(0, 10), revenue: Number(order.card_amount ?? 0) + Number(order.cash_amount ?? 0) > 0 ? Number(order.card_amount ?? 0) + Number(order.cash_amount ?? 0) : Number(order.total_amount ?? 0), purchase: 0, cardRevenue: Number(order.card_amount ?? 0) })),
        ...manual.map(row => ({ date: row.date, revenue: Number(row.card_amount ?? 0) + Number(row.cash_amount ?? 0), purchase: 0, cardRevenue: Number(row.card_amount ?? 0) })),
        ...purchases.map(row => ({ date: row.date, revenue: 0, purchase: Number(row.amount) })),
      ];
    }
    /** 영업일별 합계 한 번으로 받는다. 함수가 아직 배포되지 않았을 때(PGRST202)만 원본 행 조회로 계산한다. */
    async function dailyRows(): Promise<DailyAmount[]> {
      const { data, error } = await supabase.rpc('get_home_daily_sources', {
        p_store_id: storeId, p_start: start, p_end: end, p_from: from, p_to: to, p_closing_minutes: hour * 60 + minute,
      });
      if (error) { if (error.code === 'PGRST202') return rawRows(); throw error; }
      return ((data ?? []) as { date: string; revenue: unknown; card_revenue: unknown; purchase: unknown }[])
        .map(row => ({ date: row.date, revenue: Number(row.revenue), purchase: Number(row.purchase), cardRevenue: Number(row.card_revenue) }));
    }
    const [rows, labor, expense] = await Promise.all([
      dailyRows(),
      getDailyLaborSeries(storeId, month, through, asOf),
      getDailyExpenseSeries(storeId, month),
    ]);
    if (rows.some(row => !Number.isFinite(row.revenue) || !Number.isFinite(row.purchase) || !Number.isFinite(row.cardRevenue ?? 0))) throw new Error('INVALID_FINANCIAL_AMOUNT');
    const byDate = new Map<string, { revenue: number; purchase: number; card: number }>();
    for (const row of rows) {
      const bucket = byDate.get(row.date) ?? { revenue: 0, purchase: 0, card: 0 };
      bucket.revenue += row.revenue; bucket.purchase += row.purchase; bucket.card += row.cardRevenue ?? 0;
      byDate.set(row.date, bucket);
    }
    const laborByDate = new Map(labor.days.map(row => [row.date, row.cumulative]));
    const expenseByDate = new Map(expense.days.map(row => [row.date, row.cumulativeAmount]));
    let revenue = 0, purchase = 0, cards = 0, hasRecords = false;
    return Array.from({ length: through }, (_, index) => {
      const date = `${month}-${String(index + 1).padStart(2, '0')}`;
      const bucket = byDate.get(date);
      if (bucket) { revenue += bucket.revenue; purchase += bucket.purchase; cards += bucket.card; hasRecords = true; }
      const laborCost = laborByDate.get(date) ?? null;
      const expenseCost = expenseByDate.get(date) ?? null;
      // Difference of rounded cumulative fees keeps every prefix aligned with monthly round(card/80).
      const cardFee = Math.sign(cards) * Math.round(Math.abs(cards) / 80);
      const cost = expenseCost == null ? null : expenseCost + cardFee;
      const profit = laborCost == null || cost == null ? null : revenue - purchase - laborCost - cost;
      return { day: index + 1, hasRecords: hasRecords || labor.savedMonthlyGross > 0 || expense.monthlyTotal > 0,
        values: { revenue, purchase, labor: laborCost, expense: cost, profit } };
    });
  }
  const [accessResult, currentResult, previousResult] = await Promise.allSettled([
    access, read(period.month, period.day, true), read(period.previousMonth, period.previousDay, false),
  ]);
  if (accessResult.status === 'rejected') throw accessResult.reason;
  if (currentResult.status === 'rejected') throw currentResult.reason;
  if (previousResult.status === 'rejected') throw previousResult.reason;
  const current = currentResult.value, previous = previousResult.value;
  return { current, previous: previous.some(day => day.hasRecords) ? previous : [] };
}

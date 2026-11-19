import { getHomeFinancialTimeline } from '../../lib/services/homeFinancialTimeline';
import { getDailyExpenseSeries } from '../../lib/services/dailyExpenseSeries';
import { getDailyLaborSeries } from '../../lib/services/dailyLaborSeries';
import { supabase } from '../../lib/supabase';
import { readAllRows } from '../../lib/services/readAllRows';
jest.mock('../../lib/services/dailyExpenseSeries', () => ({ getDailyExpenseSeries: jest.fn() }));
jest.mock('../../lib/services/dailyLaborSeries', () => ({ getDailyLaborSeries: jest.fn() }));
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('../../lib/services/readAllRows', () => ({ readAllRows: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); (getDailyExpenseSeries as jest.Mock).mockImplementation(async (_store, month) => ({ monthlyTotal: 600, days: Array.from({ length: 31 }, (_, i) => ({ date: `${month}-${String(i+1).padStart(2,'0')}`, cumulativeAmount: (i+1)*20 })) })); (getDailyLaborSeries as jest.Mock).mockImplementation(async (_store, month, through) => ({ savedMonthlyGross: 100, days: Array.from({ length: through }, (_, i) => ({ date: `${month}-${String(i+1).padStart(2,'0')}`, cumulative: (i+1)*10 })) })); (supabase.rpc as jest.Mock).mockImplementation(async (name: string) => name === 'get_home_daily_sources'
  // 기존 테스트는 집계 RPC 미배포 상태(기존 원본 조회 경로)를 검사한다.
  ? { data: null, error: { code: 'PGRST202', message: 'missing' } } : { error: null }); });
it('권한 거절 후 원천 자료를 읽지 않는다', async () => {
  const denied = { code: '42501', message: 'denied' };
  (supabase.rpc as jest.Mock).mockResolvedValue({ error: denied });
  await expect(getHomeFinancialTimeline('store', '23:00', new Date('2026-11-05T15:30:00Z'))).rejects.toEqual(denied);
  expect(readAllRows).not.toHaveBeenCalled();
});
it('영업일별 카드+현금 및 수기 매출을 누적하고 전월 미존재를 구분한다', async () => {
  (readAllRows as jest.Mock).mockResolvedValueOnce([{ order_at: '2026-11-01T15:00:00Z', card_amount: 100, cash_amount: 20, total_amount: 999 }]).mockResolvedValueOnce([{ date: '2026-11-02', card_amount: 10, cash_amount: 5 }]).mockResolvedValueOnce([{ date: '2026-11-03', amount: 40 }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  const result = await getHomeFinancialTimeline('store','23:00',new Date('2026-11-05T15:30:00Z'));
  expect(result.current.at(-1)?.values).toEqual({ revenue:135,purchase:40,profit:-86,labor:60,expense:121 });
  expect(result.previous.at(-1)?.values.labor).toBe(60);
});
it('잘못된 금액을 0원으로 덮지 않는다', async () => {
  (readAllRows as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ date:'2026-11-01',amount:'bad' }]).mockResolvedValue([]);
  await expect(getHomeFinancialTimeline('store','23:00',new Date('2026-11-05T15:30:00Z'))).rejects.toThrow('INVALID_FINANCIAL_AMOUNT');
});

it('인건비 근거 누락을 0원으로 바꾸지 않는다', async () => {
  (readAllRows as jest.Mock).mockResolvedValue([]);
  (getDailyLaborSeries as jest.Mock).mockResolvedValue({ savedMonthlyGross: 0, days: [] });
  (getDailyExpenseSeries as jest.Mock).mockResolvedValue({ monthlyTotal: 0, days: [] });
  const result = await getHomeFinancialTimeline('store','23:00',new Date('2026-11-05T15:30:00Z'));
  expect(result.current.at(-1)?.values.labor).toBeNull();
  expect(result.previous).toEqual([]);
});

it('날짜 미상 비용이 있으면 비용·이익 그래프를 0으로 만들지 않는다', async () => {
  (readAllRows as jest.Mock).mockResolvedValue([]);
  (getDailyExpenseSeries as jest.Mock).mockResolvedValue({ monthlyTotal: 100, days: [] });
  const result = await getHomeFinancialTimeline('store','23:00',new Date('2026-11-05T15:30:00Z'));
  expect(result.current.at(-1)?.values.expense).toBeNull();
  expect(result.current.at(-1)?.values.profit).toBeNull();
  expect(result.current.at(-1)?.values.labor).toBe(60);
});
it('카드 수수료는 일별 반올림을 더하지 않고 누적 카드액에서 한 번 계산한다', async () => {
  (readAllRows as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([{date:'2026-11-01',card_amount:40,cash_amount:0},{date:'2026-11-02',card_amount:40,cash_amount:0}]).mockResolvedValueOnce([]).mockResolvedValue([]);
  (getDailyExpenseSeries as jest.Mock).mockImplementation(async (_s, month) => ({ monthlyTotal: 0, days:Array.from({length:31},(_,i)=>({date:`${month}-${String(i+1).padStart(2,'0')}`,cumulativeAmount:0})) }));
  const result=await getHomeFinancialTimeline('store','23:00',new Date('2026-11-05T15:30:00Z'));
  expect(result.current[0].values.expense).toBe(1);
  expect(result.current[1].values.expense).toBe(1);
});

describe('영업일 합계 RPC 경로', () => {
  function daily(rowsByMonth: Record<string, unknown[]>) {
    (supabase.rpc as jest.Mock).mockImplementation(async (name: string, args: { p_start: string }) => name === 'get_home_daily_sources'
      ? { data: rowsByMonth[args.p_start.slice(0, 7)] ?? [], error: null } : { error: null });
  }
  it('원본 행 대신 영업일 합계 한 번으로 같은 누적값을 만든다', async () => {
    daily({ '2026-11': [
      { date: '2026-11-01', revenue: '120', card_revenue: '100', purchase: '0' },
      { date: '2026-11-02', revenue: '15', card_revenue: '10', purchase: '0' },
      { date: '2026-11-03', revenue: '0', card_revenue: '0', purchase: '40' },
    ] });
    const result = await getHomeFinancialTimeline('store', '23:00', new Date('2026-11-05T15:30:00Z'));
    expect(result.current.at(-1)?.values).toEqual({ revenue: 135, purchase: 40, profit: -86, labor: 60, expense: 121 });
    expect(readAllRows).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith('get_home_daily_sources', expect.objectContaining({
      p_store_id: 'store', p_start: '2026-11-01', p_end: '2026-11-06', p_closing_minutes: 23 * 60,
      p_from: '2026-11-01T14:00:00.000Z', p_to: '2026-11-05T15:30:00.000Z' }));
  });
  it('금액이 0이어도 기록이 있는 날은 기록 있음으로 남긴다', async () => {
    (getDailyLaborSeries as jest.Mock).mockResolvedValue({ savedMonthlyGross: 0, days: [] });
    (getDailyExpenseSeries as jest.Mock).mockResolvedValue({ monthlyTotal: 0, days: [] });
    daily({ '2026-10': [{ date: '2026-10-02', revenue: '0', card_revenue: '0', purchase: '0' }] });
    const result = await getHomeFinancialTimeline('store', '23:00', new Date('2026-11-05T15:30:00Z'));
    expect(result.previous[1].hasRecords).toBe(true);
  });
  it('잘못된 합계를 0원으로 덮지 않는다', async () => {
    daily({ '2026-11': [{ date: '2026-11-01', revenue: 'bad', card_revenue: '0', purchase: '0' }] });
    await expect(getHomeFinancialTimeline('store', '23:00', new Date('2026-11-05T15:30:00Z'))).rejects.toThrow('INVALID_FINANCIAL_AMOUNT');
  });
  it('집계 RPC의 권한·네트워크 오류는 원본 조회로 우회하지 않는다', async () => {
    (supabase.rpc as jest.Mock).mockImplementation(async (name: string) => name === 'get_home_daily_sources'
      ? { data: null, error: { code: '42501', message: 'denied' } } : { error: null });
    await expect(getHomeFinancialTimeline('store', '23:00', new Date('2026-11-05T15:30:00Z'))).rejects.toMatchObject({ code: '42501' });
    expect(readAllRows).not.toHaveBeenCalled();
  });
});
it('정렬되지 않은 일별 원본에서도 매일의 누적·수수료·누락을 보존한다', async () => {
  (readAllRows as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([
    { date: '2026-11-03', card_amount: 40, cash_amount: 3 },
    { date: '2026-11-01', card_amount: 40, cash_amount: 1 },
    { date: '2026-11-02', card_amount: 40, cash_amount: 2 },
  ]).mockResolvedValueOnce([]).mockResolvedValue([]);
  const result = await getHomeFinancialTimeline('store', '23:00', new Date('2026-11-03T10:00:00Z'));
  expect(result.current.map(row => row.values.revenue)).toEqual([41, 83, 126]);
  expect(result.current.map(row => row.values.expense)).toEqual([21, 41, 62]);
});

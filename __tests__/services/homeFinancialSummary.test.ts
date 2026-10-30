import { getHomeFinancialSummary } from '../../lib/services/homeFinancialSummary';
const mockRpc = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));
const row = { year_month: '2026-10', revenue: '1000', purchase_cost: '200', labor_cost: '300', fixed_expense: '100', variable_expense: '150', operating_profit: '250' };
beforeEach(() => { mockRpc.mockReset(); });
it('개인 급여 조회 없이 홈 합계 RPC 결과를 변환한다', async () => {
  mockRpc.mockResolvedValue({ data: [row], error: null });
  const result = await getHomeFinancialSummary('store', '2026-10');
  expect(mockRpc).toHaveBeenCalledWith('get_home_financial_summary', { p_store_id: 'store', p_year_month: '2026-10' });
  expect(result).toEqual({ yearMonth: '2026-10', revenue: 1000, purchaseCost: 200, laborCost: 300, fixedExpense: 100, variableExpense: 150, operatingProfit: 250 });
});
it.each([null, '', 'NaN', 'Infinity'])('누락·잘못된 금액 %s를 0원으로 바꾸지 않는다', async value => {
  mockRpc.mockResolvedValue({ data: [{ ...row, labor_cost: value }], error: null });
  await expect(getHomeFinancialSummary('store', '2026-10')).rejects.toThrow('매장 요약을 확인하지 못했어요.');
});
it('권한 오류는 실패로 전달한다', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'HOME_SUMMARY_FORBIDDEN' } });
  await expect(getHomeFinancialSummary('other', '2026-10')).rejects.toEqual({ message: 'HOME_SUMMARY_FORBIDDEN' });
});

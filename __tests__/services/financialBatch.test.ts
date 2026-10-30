import { getFinancialSummaries } from '../../lib/services/homeFinancialSummary';
const mockRpc = jest.fn();
const mockFallback = jest.fn();
jest.mock('../../lib/services/adminFinancialFallback', () => ({ getAdminFinancialFallback: (...args: unknown[]) => mockFallback(...args) }));
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));
const row = { store_id: 'a', year_month: '2026-10', revenue: '0', purchase_cost: 0, labor_cost: 0, fixed_expense: 0, variable_expense: 0, operating_profit: 0 };
beforeEach(() => { mockRpc.mockReset(); mockFallback.mockReset(); });
it('명시적 관리자 권한과 중복 제거한 매장·월로 집계한다', async () => {
  mockRpc.mockResolvedValue({ data: [row], error: null });
  expect(await getFinancialSummaries(['a', 'a'], ['2026-10', '2026-10'], true)).toEqual([expect.objectContaining({ storeId: 'a', revenue: 0 })]);
  expect(mockRpc).toHaveBeenCalledWith('get_financial_summaries_v2', { p_store_ids: ['a'], p_year_months: ['2026-10'], p_require_admin: true });
});
it.each([null, true, '', 'NaN', 'Infinity', {}])('잘못된 합계 %p는 실패한다', async revenue => {
  mockRpc.mockResolvedValue({ data: [{ ...row, revenue }], error: null });
  await expect(getFinancialSummaries(['a'], ['2026-10'])).rejects.toThrow();
});
it('누락 행을 0원으로 만들지 않는다', async () => {
  mockRpc.mockResolvedValue({ data: [], error: null });
  await expect(getFinancialSummaries(['a'], ['2026-10'])).rejects.toThrow('누락');
});
it('마이그레이션이 없으면 구형 상세 쿼리로 우회하지 않는다', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'missing function' } });
  await expect(getFinancialSummaries(['a'], ['2026-10'])).rejects.toEqual({ message: 'missing function' });
  expect(mockRpc).toHaveBeenCalledTimes(1);
});

it('급여 미확인은 해당 행의 인건비와 이익만 null로 보존한다', async () => {
  mockRpc.mockResolvedValue({data:[{...row, labor_cost:null, operating_profit:null}],error:null});
  await expect(getFinancialSummaries(['a'],['2026-10'],true)).resolves.toEqual([expect.objectContaining({revenue:0,laborCost:null,operatingProfit:null})]);
});
it('인건비 미확인인데 이익이 채워진 응답은 거절한다', async () => {
  mockRpc.mockResolvedValue({data:[{...row,labor_cost:null}],error:null});
  await expect(getFinancialSummaries(['a'],['2026-10'],true)).rejects.toThrow();
});
it('정확히 v2 함수가 없을 때만 관리자 호환 조회를 사용한다', async () => {
  mockRpc.mockResolvedValue({error:{code:'PGRST202',message:'Could not find public.get_financial_summaries_v2'}});
  mockFallback.mockResolvedValue([{storeId:'a',yearMonth:'2026-10',laborCost:null}]);
  await getFinancialSummaries(['a'],['2026-10'],true);
  expect(mockFallback).toHaveBeenCalledWith(['a'],['2026-10']);
});
it.each(['FINANCIAL_SUMMARY_FORBIDDEN','WAGE_HISTORY_REQUIRED','network error'])('서버 오류 %s를 호환 조회로 숨기지 않는다', async message => {
  mockRpc.mockResolvedValue({error:{code:'P0001',message}});
  await expect(getFinancialSummaries(['a'],['2026-10'],true)).rejects.toMatchObject({message});
  expect(mockFallback).not.toHaveBeenCalled();
});

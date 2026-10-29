import { getAdminFinancialFallback } from '../../lib/services/adminFinancialFallback';
const mockRpc = jest.fn(), mockFrom = jest.fn(), mockDetail = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a), from: (...a: unknown[]) => mockFrom(...a) } }));
jest.mock('../../lib/services/profitLoss', () => ({ getProfitLossByMonth: (...a: unknown[]) => mockDetail(...a) }));
beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockResolvedValue({error:null});
  mockFrom.mockReturnValue({select: () => ({in: async () => ({data:[{id:'a',closing_time:'04:30:00'},{id:'b',closing_time:'23:00:00'}],error:null})})});
});
it('전체 권한 검사 실패 시 상세 조회를 시작하지 않는다', async () => {
  mockRpc.mockResolvedValueOnce({error:null}).mockResolvedValueOnce({error:{message:'FINANCE_ADMIN_REQUIRED'}});
  await expect(getAdminFinancialFallback(['a','b'],['2026-09'])).rejects.toMatchObject({message:'FINANCE_ADMIN_REQUIRED'});
  expect(mockFrom).not.toHaveBeenCalled(); expect(mockDetail).not.toHaveBeenCalled();
});
it('동시 조회 제한과 매장 마감 시간을 유지하고 null을 그대로 반환한다', async () => {
  let active=0,maximum=0;
  mockDetail.mockImplementation(async (_id,month) => {
    active++; maximum=Math.max(active,maximum); await new Promise(resolve=>setTimeout(resolve,1)); active--;
    return {yearMonth:month,revenue:100,purchaseCost:10,laborCost:month==='2026-09'?null:20,fixedExpense:1,variableExpense:2,operatingProfit:month==='2026-09'?null:67};
  });
  const rows=await getAdminFinancialFallback(['a','b'],['2026-09','2026-10']);
  expect(maximum).toBeLessThanOrEqual(3); expect(rows).toHaveLength(4);
  expect(rows.find(r=>r.storeId==='a'&&r.yearMonth==='2026-09')).toMatchObject({laborCost:null,operatingProfit:null,revenue:100});
  expect(mockDetail).toHaveBeenCalledWith('a','2026-09','04:30');
});

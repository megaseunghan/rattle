import { supabase } from '../supabase';
import { getProfitLossByMonth } from './profitLoss';
import type { StoreFinancialSummary } from './homeFinancialSummary';
import { UserFacingError } from '../utils/error';

/** v2 RPC 배포 전 관리자 호환 조회. 권한 검사를 먼저 완료하고 동시 조회를 제한한다. */
export async function getAdminFinancialFallback(ids: string[], months: string[]): Promise<StoreFinancialSummary[]> {
  for (const id of ids) {
    const { error } = await supabase.rpc('assert_store_finance_access', { p_store_id: id });
    if (error) throw error;
  }
  const { data: stores, error } = await supabase.from('stores').select('id, closing_time').in('id', ids);
  if (error) throw error;
  if (!stores || ids.some(id => !stores.some(store => store.id === id))) {
    throw new UserFacingError('매장 정보를 확인하지 못했어요. 다시 시도해주세요.');
  }
  const requests = ids.flatMap(id => months.map(month => ({ id, month })));
  const results: StoreFinancialSummary[] = [];
  // 대시보드의 여러 요청도 financial query queue가 하나로 묶어 전달한다.
  for (let i = 0; i < requests.length; i += 3) {
    results.push(...await Promise.all(requests.slice(i, i + 3).map(async ({ id, month }) => {
      const closing = stores.find(store => store.id === id)!.closing_time?.slice(0, 5) ?? '23:00';
      const row = await getProfitLossByMonth(id, month, closing);
      return { storeId: id, yearMonth: month, revenue: row.revenue, purchaseCost: row.purchaseCost,
        laborCost: row.laborCost, fixedExpense: row.fixedExpense, variableExpense: row.variableExpense,
        operatingProfit: row.operatingProfit };
    })));
  }
  return results;
}

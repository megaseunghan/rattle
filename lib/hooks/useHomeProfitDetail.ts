/**
 * 손익 칸 아래 세부 목록 자료(관리자 전용 월별 상세 손익). 통합 대시보드와 같은 월 상세 캐시 키를 써서
 * 같은 달을 다시 받지 않는다. 주 막대는 월 상세로 나눌 수 없어 조회하지 않는다.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { isAccessDenied, queryClient, queryKeys, useQueryScope } from '../query';
import { STALE_TIME } from '../query/staleTimes';
import { getProfitLossByMonth } from '../services/profitLoss';
import { getManualSalesTotals } from '../services/manualSales';
import type { BreakdownSource } from '../components/home/profit/profitBreakdown';

const CONCURRENCY = 2;

/** months가 비어 있으면 조회하지 않는다. */
export function useHomeProfitDetail(active: boolean, months: readonly string[]) {
  const { store, canManageStore } = useAuth();
  const scope = useQueryScope();
  const storeId = store?.id ?? '';
  const closing = store?.closing_time;
  const enabled = active && !!store && canManageStore && months.length > 0;
  const query = useQuery({
    queryKey: queryKeys.store(scope, storeId, 'financial', 'home-detail', closing, months.join(',')),
    enabled, staleTime: STALE_TIME.moneyDetail,
    queryFn: async ({ signal }): Promise<BreakdownSource[]> => {
      const rows: BreakdownSource[] = new Array(months.length);
      let next = 0;
      // 한 달에도 여러 조회가 필요해 연도 상세가 한꺼번에 몰리지 않게 둘씩 받는다.
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, months.length) }, async () => {
        while (next < months.length) {
          if (signal.aborted) throw new Error('조회가 취소됐어요.');
          const index = next++;
          const month = months[index];
          const [profitLoss, manual] = await Promise.all([
            queryClient.fetchQuery({
              queryKey: queryKeys.store(scope, storeId, 'financial', 'dashboard-detail', closing, month),
              queryFn: () => getProfitLossByMonth(storeId, month, closing?.slice(0, 5) ?? '23:00'),
              meta: { storeIds: [storeId] }, staleTime: STALE_TIME.moneyDetail,
            }),
            queryClient.fetchQuery({
              queryKey: queryKeys.store(scope, storeId, 'financial', 'manual-totals', month),
              queryFn: () => getManualSalesTotals(storeId, month), staleTime: STALE_TIME.entry,
            }),
          ]);
          rows[index] = { profitLoss, manual };
        }
      }));
      return rows;
    },
  }, queryClient);
  const denied = isAccessDenied(query.error);
  return {
    sources: denied ? undefined : query.data,
    loading: enabled && query.isPending && query.fetchStatus !== 'idle',
    error: enabled && query.isError && !denied,
    refetch: query.refetch,
  };
}

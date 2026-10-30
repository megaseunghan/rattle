import { useQuery } from '@tanstack/react-query';
import { queryClient, queryKeys, useQueryScope, isAccessDenied } from '../query';
import { getProfitLossByMonth } from '../services/profitLoss';
import { buildDashboardBreakdown, DashboardMetric } from '../services/dashboardBreakdown';
import { koreanDate } from '../utils/regularWages';
import type { ProfitLoss, Store } from '../../types';

export function useDashboardBreakdown(stores: Store[], period: 'month' | 'year', yearMonth: string, metric: DashboardMetric | null) {
  const identity = useQueryScope();
  const signature = stores.map(store => `${store.id}:${store.closing_time ?? '23:00'}`).sort().join(',');
  const today = koreanDate(new Date());
  const year = Number(yearMonth.slice(0, 4));
  const count = year > Number(today.slice(0, 4)) ? 0 : year === Number(today.slice(0, 4)) ? Number(today.slice(5, 7)) : 12;
  const months = period === 'month' ? [yearMonth] : Array.from({ length: count }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
  const query = useQuery({
    queryKey: ['rattle', identity, 'integrated', 'financial', 'breakdown', signature, period, yearMonth, metric],
    meta: { storeIds: stores.map(store => store.id) }, enabled: !!metric && stores.length > 0,
    queryFn: async ({ signal }) => {
      const tasks = stores.flatMap(store => months.map(month => ({ store, month })));
      const rows: ProfitLoss[] = new Array(tasks.length);
      let next = 0;
      // Keep store/year expansion bounded. All metric tabs reuse the same authorized monthly detail.
      await Promise.all(Array.from({ length: Math.min(2, tasks.length) }, async () => {
        while (next < tasks.length) {
          if (signal.aborted) throw new Error('조회가 취소됐어요.');
          const index = next++;
          const { store, month } = tasks[index];
          rows[index] = await queryClient.fetchQuery({
            queryKey: queryKeys.store(identity, store.id, 'financial', 'dashboard-detail', store.closing_time, month),
            queryFn: () => getProfitLossByMonth(store.id, month, store.closing_time?.slice(0, 5) ?? '23:00'),
            meta: { storeIds: [store.id] },
          });
        }
      }));
      if (signal.aborted) throw new Error('조회가 취소됐어요.');
      return buildDashboardBreakdown(rows, metric!);
    },
  }, queryClient);
  return { ...query, data: isAccessDenied(query.error) ? undefined : query.data };
}

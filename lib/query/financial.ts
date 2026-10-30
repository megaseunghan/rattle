import { queryOptions } from '@tanstack/react-query';
import { getFinancialSummaries, type StoreFinancialSummary } from '../services/homeFinancialSummary';
import { queryClient, queryKeys } from './client';

interface Pending { storeId: string; month: string; resolve: (row: StoreFinancialSummary) => void; reject: (error: unknown) => void }
const batches = new Map<string, Pending[]>();
function queueSummary(scope: string, storeId: string, month: string, requireAdmin: boolean): Promise<StoreFinancialSummary> {
  const key = JSON.stringify([scope, requireAdmin]);
  return new Promise((resolve, reject) => {
    const pending = batches.get(key);
    const request = { storeId, month, resolve, reject };
    if (pending) { pending.push(request); return; }
    batches.set(key, [request]);
    void Promise.resolve().then(async () => {
      const batch = batches.get(key)!;
      batches.delete(key);
      try {
        const rows = await getFinancialSummaries(batch.map(r => r.storeId), batch.map(r => r.month), requireAdmin);
        for (const r of batch) r.resolve(rows.find(row => row.storeId === r.storeId && row.yearMonth === r.month)!);
      } catch (error) { for (const r of batch) r.reject(error); }
    });
  });
}
export function financialSummaryOptions(scope: string, storeId: string, closingTime: string, month: string, requireAdmin: boolean) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return queryOptions({
    queryKey: queryKeys.store(scope, storeId, 'financial', closingTime, month, requireAdmin),
    queryFn: () => queueSummary(scope, storeId, month, requireAdmin),
    staleTime: month >= currentMonth ? 30_000 : 300_000,
  });
}
export function fetchFinancialSummary(scope: string, storeId: string, closingTime: string, month: string, requireAdmin: boolean) {
  return queryClient.fetchQuery(financialSummaryOptions(scope, storeId, closingTime, month, requireAdmin));
}

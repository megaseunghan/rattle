import { QueryClient } from '@tanstack/react-query';
export const queryClient = new QueryClient({ defaultOptions: { queries: {
  staleTime: 30_000, gcTime: process.env.NODE_ENV === 'test' ? Infinity : 15 * 60_000, retry: false, refetchOnWindowFocus: true,
} } });
export const queryKeys = {
  store: (scope: string, storeId: string, domain: string, ...parts: readonly unknown[]) =>
    ['rattle', scope, storeId, domain, ...parts] as const,
};
export function isAccessDenied(error: unknown): boolean {
  const value = error as { code?: string; message?: string; status?: number } | null;
  return ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(value?.code ?? '')
    || value?.status === 401 || value?.status === 403
    || /FORBIDDEN|FINANCE_ADMIN_REQUIRED|permission denied|JWT expired/i.test(value?.message ?? '');
}
/** Cancel first: a response started before a mutation must never restore stale values. */
export async function invalidateStoreData(storeId: string, domains?: string[], _months?: string[]): Promise<void> {
  const filters = { predicate: (query: { queryKey: readonly unknown[]; meta?: Record<string, unknown> }) =>
    query.queryKey[0] === 'rattle'
      && (!domains?.length || domains.includes(String(query.queryKey[3])))
      && (query.queryKey[2] === storeId || (Array.isArray(query.meta?.storeIds) && query.meta.storeIds.includes(storeId))) };
  await queryClient.cancelQueries(filters);
  await queryClient.invalidateQueries(filters);
}
export async function clearQueryData(): Promise<void> {
  const cancelled = queryClient.cancelQueries();
  queryClient.clear();
  await cancelled;
}

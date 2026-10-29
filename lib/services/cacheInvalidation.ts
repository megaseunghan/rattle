import { invalidateStoreData, queryClient } from '../query/client';

/** ID만 받는 기존 저장 경로도 연결된 요약을 오래된 값으로 남기지 않는다. */
export async function invalidateCachedStore(storeId?: string, domains?: string[]): Promise<void> {
  if (storeId) return invalidateStoreData(storeId, domains);
  const filters = { queryKey: ['rattle'], predicate: (query: { queryKey: readonly unknown[] }) =>
    !domains?.length || domains.includes(String(query.queryKey[3])) };
  await queryClient.cancelQueries(filters);
  await queryClient.invalidateQueries(filters);
}

import { queryClient, queryKeys, invalidateStoreData, clearQueryData } from '../../lib/query/client';
afterEach(async () => { await clearQueryData(); });
it('매장 변경은 모든 계정 범위와 통합 집계를 무효화하며 다른 매장은 유지한다', async () => {
  const a = queryKeys.store('u-admin', 'a', 'financial', '2026-10');
  const preview = queryKeys.store('u-preview', 'a', 'employees');
  const b = queryKeys.store('u-admin', 'b', 'financial', '2026-10');
  [a, preview, b].forEach(key => queryClient.setQueryData(key, 100));
  await queryClient.fetchQuery({ queryKey: ['rattle', 'u-admin', 'integrated'], queryFn: async () => 200, meta: { storeIds: ['a', 'b'] } });
  await invalidateStoreData('a');
  expect(queryClient.getQueryState(a)?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(preview)?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(b)?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(['rattle', 'u-admin', 'integrated'])?.isInvalidated).toBe(true);
});
it('취소 이전의 응답이 수정 후 캐시를 덮어쓰지 않는다', async () => {
  const key = queryKeys.store('u', 'a', 'financial');
  let finish!: (value: number) => void;
  const pending = queryClient.fetchQuery({ queryKey: key, queryFn: () => new Promise<number>(resolve => { finish = resolve; }) }).catch(() => {});
  await invalidateStoreData('a');
  queryClient.setQueryData(key, 200);
  finish(100); await pending; await Promise.resolve();
  expect(queryClient.getQueryData(key)).toBe(200);
});

it('청소 기록 갱신은 손익 계산을 다시 실행하지 않는다', async () => {
  const cleaning = queryKeys.store('u', 'a', 'cleaning');
  const financial = queryKeys.store('u', 'a', 'financial');
  const detail = queryKeys.store('u', 'a', 'detailed-financial');
  [cleaning, financial, detail].forEach(key => queryClient.setQueryData(key, 100));
  await invalidateStoreData('a', ['cleaning', 'notifications']);
  expect(queryClient.getQueryState(cleaning)?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(financial)?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(detail)?.isInvalidated).toBe(false);
});

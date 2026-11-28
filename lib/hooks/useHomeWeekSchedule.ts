/**
 * S04 홈 근무표: 매장의 요일별 고정 근무. 스케줄 저장·승인은 'schedule' 무효화로 바로 반영된다.
 * 서버 읽기 권한(관리자는 매장 전체, 그 외는 본인 근무)에 따라 받은 자료만 보여 준다.
 */
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { queryClient, queryKeys, useQueryScope } from '../query';
import { STALE_TIME } from '../query/staleTimes';
import { getStoreWeeklySchedule } from '../services/schedule';

export function useHomeWeekSchedule(active: boolean, refreshKey: number) {
  const { store } = useAuth();
  const scope = useQueryScope();
  const query = useQuery({
    queryKey: queryKeys.store(scope, store?.id ?? '', 'schedule', 'store-week'),
    queryFn: () => getStoreWeeklySchedule(store!.id),
    enabled: active && !!store, staleTime: STALE_TIME.config,
  }, queryClient);
  const lastRefresh = useRef(refreshKey);
  const { refetch } = query;
  useEffect(() => {
    if (lastRefresh.current === refreshKey) return;
    lastRefresh.current = refreshKey;
    if (active && store) void refetch();
  }, [refreshKey, active, store?.id, refetch]);
  return query;
}

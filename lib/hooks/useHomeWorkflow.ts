import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { queryClient, queryKeys, useQueryScope } from '../query';
import { STALE_TIME } from '../query/staleTimes';
import { getHomeWorkflow } from '../services/homeWorkflow';

/** 탭 진입은 enabled 전환, 스택 복귀는 화면의 useRefreshOnReturn, 저장은 'home-workflow' 무효화가 갱신한다. */
export function useHomeWorkflow(active = true, refreshKey = 0) {
  const { store } = useAuth();
  const scope = useQueryScope();
  const query = useQuery({ queryKey: queryKeys.store(scope, store?.id ?? '', 'home-workflow'),
    queryFn: () => getHomeWorkflow(store!.id), enabled: active && !!store, staleTime: STALE_TIME.config,
  }, queryClient);
  // 당겨서 새로고침(refreshKey 증가)은 재사용 시간과 무관하게 다시 받는다.
  const lastRefresh = useRef(refreshKey);
  const { refetch } = query;
  useEffect(() => {
    if (lastRefresh.current === refreshKey) return;
    lastRefresh.current = refreshKey;
    if (active && store) void refetch();
  }, [refreshKey, active, store?.id, refetch]);
  return query;
}

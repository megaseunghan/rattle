import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { queryClient } from './client';

interface RefreshOnReturnTarget {
  /** 탭 페이지의 active prop. false면 돌아와도 다시 받지 않는다. */
  active: boolean;
  storeId?: string | null;
  /** 쿼리 키 4번째 칸(domain) 목록 */
  domains: readonly string[];
}

/**
 * 스택 화면에서 돌아왔을 때 이 화면의 오래된(stale) 활성 쿼리만 다시 받는다.
 * 첫 포커스는 건너뛴다. 첫 조회와 탭 전환은 useQuery의 `enabled: active`와 staleTime이 맡는다.
 * 콜백을 고정해 active·키 변경으로 포커스 효과가 다시 실행되지 않게 한다.
 * TanStack Query React Native 가이드의 useRefreshOnFocus와 같은 방식이다.
 */
export function useRefreshOnReturn(target: RefreshOnReturnTarget): void {
  const latest = useRef(target);
  latest.current = target;
  const focusedOnce = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!focusedOnce.current) { focusedOnce.current = true; return; }
    const { active, storeId, domains } = latest.current;
    if (!active || !storeId) return;
    void queryClient.refetchQueries({
      type: 'active', stale: true,
      predicate: query => query.queryKey[0] === 'rattle' && query.queryKey[2] === storeId && domains.includes(String(query.queryKey[3])),
    }).catch(() => { /* 각 쿼리의 오류 상태가 화면에 드러난다. */ });
  }, []));
}

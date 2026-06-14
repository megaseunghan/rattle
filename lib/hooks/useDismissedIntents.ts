import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'rattle.dismissedIntents';

/**
 * Intent-based Design — 처리/닫기한 의도 카드를 로컬(AsyncStorage)에 기록.
 * Supabase 없이 기기 단위로 dismissed 상태를 관리한다.
 *
 * intentId에 날짜를 포함하면(`toss-sync:2026-06-14`) 매일 초기화되는 효과를 낸다.
 */
export function useDismissedIntents() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const ids: string[] = raw ? JSON.parse(raw) : [];
        if (active) setDismissed(new Set(ids));
      } catch {
        // 읽기 실패 시 빈 상태로 시작 (의도 카드가 모두 노출될 뿐 치명적이지 않음)
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => { active = false; };
  }, []);

  const dismiss = useCallback(async (intentId: string) => {
    setDismissed(prev => {
      if (prev.has(intentId)) return prev;
      const next = new Set(prev);
      next.add(intentId);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  const isDismissed = useCallback(
    (intentId: string) => dismissed.has(intentId),
    [dismissed],
  );

  return { isDismissed, dismiss, ready };
}

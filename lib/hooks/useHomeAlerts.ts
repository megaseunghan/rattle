import { UserFacingError } from '../utils/error';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { AppState } from 'react-native';
import { queryClient, queryKeys, useQueryScope } from '../query';
import { STALE_TIME } from '../query/staleTimes';
import { koreanDate } from '../utils/regularWages';
import { Store } from '../../types';
import { buildHomeAlerts, getHomeAlertReads, getHomeAlertStock, hasMonthlyFixedExpense, markHomeAlertRead, restoreHomeAlert } from '../services/homeAlerts';

interface HomeAlertSource {
  stock: Awaited<ReturnType<typeof getHomeAlertStock>>;
  hasFixed: boolean | undefined;
  read: string[];
}
const READ_ERROR = '홈 알림을 불러오지 못했어요. 다시 시도해 주세요.';

/**
 * 홈 알림 원천(재고·고정비·읽음)을 1분 재사용한다. active가 false면 자동으로 받지 않고 refetch로만 받는다.
 * 재고·매입·고정비 저장은 'home-alerts'를 포함한 무효화로 바로 반영된다.
 */
export function useHomeAlerts(todaySales?: number, selectedStore?: Store, financial = true, active = false) {
  const { store, user } = useAuth();
  const accessScope = useQueryScope();
  const targetStore = selectedStore ?? store;
  const storeId = targetStore?.id;
  const userId = user?.id;
  const tossLinked = !!targetStore?.toss_merchant_id;
  const [, setDateTick] = useState(0);
  const date = koreanDate(new Date());
  const scope = `${userId}:${storeId}:${financial}:${date}`;
  useEffect(() => {
    // One boundary wakeup, not periodic network polling. Resume also catches
    // midnight passed while the native app suspended its timers.
    const nextMidnight = Date.parse(`${date}T00:00:00+09:00`) + 86_400_000;
    const tick = () => setDateTick(value => value + 1);
    const timer = setTimeout(tick, Math.max(1, nextMidnight - Date.now()));
    const listener = AppState.addEventListener('change', state => { if (state === 'active') tick(); });
    return () => { clearTimeout(timer); listener.remove(); };
  }, [date]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const queryKey = useMemo(() => queryKeys.store(accessScope, storeId ?? '', 'home-alerts', userId ?? '', date, financial, tossLinked),
    [accessScope, storeId, userId, date, financial, tossLinked]);
  // buildHomeAlerts uses local calendar getters. Construct the Korean
  // calendar day at local noon so device timezone cannot change alert keys.
  const now = useMemo(() => new Date(`${date}T12:00:00`), [date]);
  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<HomeAlertSource> => {
      const [stock, hasFixed] = await Promise.all([
        getHomeAlertStock(storeId!), financial ? hasMonthlyFixedExpense(storeId!, date.slice(0, 7)) : undefined,
      ]);
      const alerts = buildHomeAlerts({ stock, now, fixedExpenseMissing: financial ? !hasFixed : undefined,
        tossNotSynced: financial && tossLinked });
      const read = await getHomeAlertReads(storeId!, userId!, alerts.map(alert => alert.key));
      return { stock, hasFixed, read };
    },
    enabled: active && !!storeId && !!userId, staleTime: STALE_TIME.homeStatus,
  }, queryClient);
  const { refetch: refetchQuery } = query;
  /** 당겨서 새로고침·다시 시도. 성공하면 true. */
  const refetch = useCallback(async () => {
    if (!storeId || !userId) return;
    const result = await refetchQuery();
    return result.isError ? undefined : true;
  }, [storeId, userId, refetchQuery]);
  const markRead = useCallback(async (key: string) => {
    if (!storeId || !userId) throw new UserFacingError('로그인과 매장을 확인해 주세요.');
    await markHomeAlertRead(storeId, userId, key);
    if (scopeRef.current !== scope) return false;
    // A read started before the save must not restore the hidden alert.
    await queryClient.cancelQueries({ queryKey, exact: true });
    if (queryClient.getQueryData<HomeAlertSource>(queryKey) === undefined) {
      // 첫 조회를 취소했다면 대기 상태로 남지 않도록 다시 받는다(저장된 읽음 기록이 반영된다).
      void refetchQuery();
      return true;
    }
    queryClient.setQueryData<HomeAlertSource>(queryKey, previous => previous ? { ...previous, read: [...previous.read, key] } : previous);
    return true;
  }, [storeId, userId, scope, queryKey, refetchQuery]);
  const restoreRead = useCallback(async (key: string) => {
    if (!storeId || !userId) throw new UserFacingError('로그인과 매장을 확인해 주세요.');
    await restoreHomeAlert(storeId, userId, key);
    if (scopeRef.current !== scope) return false;
    // 원인 조건이 이미 해결된 알림을 스냅샷으로 되살리지 않고 현재 원천을 다시 확인한다.
    const refreshed = await refetch();
    if (scopeRef.current !== scope) return false;
    if (!refreshed) throw new UserFacingError('홈 알림을 다시 확인해 주세요.');
    return true;
  }, [storeId, userId, scope, refetch]);
  const source = query.data;
  const alerts = useMemo(() => {
    if (!source) return [];
    const read = new Set(source.read);
    return buildHomeAlerts({
      stock: source.stock, now, fixedExpenseMissing: financial ? !source.hasFixed : undefined,
      tossNotSynced: financial && tossLinked && todaySales === 0,
    }).filter(alert => !read.has(alert.key) && (alert.kind !== 'tossNotSynced' || todaySales === 0));
  }, [source, now, financial, tossLinked, todaySales]);
  const hasTarget = !!storeId && !!userId;
  return { scope, alerts: hasTarget ? alerts : [], loading: !!storeId && (!hasTarget || query.isPending && !query.isError || query.isFetching),
    error: hasTarget && query.isError ? READ_ERROR : null, refetch, markRead, restoreRead };
}

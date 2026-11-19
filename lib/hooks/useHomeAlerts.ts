import { UserFacingError } from '../utils/error';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AppState } from 'react-native';
import { koreanDate } from '../utils/regularWages';
import { Store } from '../../types';
import { buildHomeAlerts, getHomeAlertReads, getHomeAlertStock, hasMonthlyFixedExpense, markHomeAlertRead, restoreHomeAlert } from '../services/homeAlerts';

export function useHomeAlerts(todaySales?: number, selectedStore?: Store, financial = true) {
  const { store, user } = useAuth();
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
  const requestId = useRef(0);
  const [source, setSource] = useState<{ scope: string; stock: Awaited<ReturnType<typeof getHomeAlertStock>>; hasFixed: boolean | undefined; now: Date; read: Set<string> } | null>(null);
  const [state, setState] = useState<{ scope: string; loading: boolean; error: string | null }>({
    scope: '', loading: false, error: null,
  });
  useEffect(() => () => { requestId.current += 1; }, []);
  const refetch = useCallback(async () => {
    const request = ++requestId.current;
    if (!storeId || !userId) return;
    setState({ scope, loading: true, error: null });
    try {
      // buildHomeAlerts uses local calendar getters. Construct the Korean
      // calendar day at local noon so device timezone cannot change alert keys.
      const now = new Date(`${date}T12:00:00`);
      const yearMonth = date.slice(0, 7);
      const [stock, hasFixed] = await Promise.all([
        getHomeAlertStock(storeId), financial ? hasMonthlyFixedExpense(storeId, yearMonth) : undefined,
      ]);
      const alerts = buildHomeAlerts({ stock, now, fixedExpenseMissing: financial ? !hasFixed : undefined,
        tossNotSynced: financial && tossLinked });
      const read = new Set(await getHomeAlertReads(storeId, userId, alerts.map(alert => alert.key)));
      if (request !== requestId.current || scopeRef.current !== scope) return;
      setSource({ scope, stock, hasFixed, now, read });
      setState({ scope, loading: false, error: null });
      return true;
    } catch {
      if (request !== requestId.current || scopeRef.current !== scope) return;
      setState({ scope, loading: false,
        error: '홈 알림을 불러오지 못했어요. 다시 시도해 주세요.' });
    }
  }, [storeId, userId, scope, financial, tossLinked, date]);
  const markRead = useCallback(async (key: string) => {
    if (!storeId || !userId) throw new UserFacingError('로그인과 매장을 확인해 주세요.');
    await markHomeAlertRead(storeId, userId, key);
    if (scopeRef.current === scope) {
      requestId.current += 1;
      setSource(previous => previous?.scope === scope ? { ...previous, read: new Set([...previous.read, key]) } : previous);
      setState(previous => previous.scope === scope ? { ...previous, loading: false } : previous);
      return true;
    }
    return false;
  }, [storeId, userId, scope]);
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
  const visible = state.scope === scope;
  const alerts = useMemo(() => source?.scope === scope ? buildHomeAlerts({
    stock: source.stock, now: source.now, fixedExpenseMissing: financial ? !source.hasFixed : undefined,
    tossNotSynced: financial && tossLinked && todaySales === 0,
  }).filter(alert => !source.read.has(alert.key) && (alert.kind !== 'tossNotSynced' || todaySales === 0)) : [], [source, scope, financial, tossLinked, todaySales]);
  return { scope, alerts: visible ? alerts : [], loading: visible ? state.loading : !!storeId,
    error: visible ? state.error : null, refetch, markRead, restoreRead };
}

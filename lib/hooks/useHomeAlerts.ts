import { UserFacingError } from '../utils/error';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { HomeAlert, Store } from '../../types';
import { buildHomeAlerts, getHomeAlertReads, getHomeAlertStock, hasMonthlyFixedExpense, markHomeAlertRead } from '../services/homeAlerts';

export function useHomeAlerts(todaySales?: number, selectedStore?: Store, financial = true) {
  const { store, user } = useAuth();
  const targetStore = selectedStore ?? store;
  const storeId = targetStore?.id;
  const userId = user?.id;
  const tossLinked = !!targetStore?.toss_merchant_id;
  const scope = `${userId}:${storeId}:${financial}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const requestId = useRef(0);
  const [state, setState] = useState<{ scope: string; alerts: HomeAlert[]; loading: boolean; error: string | null }>({
    scope: '', alerts: [], loading: false, error: null,
  });
  useEffect(() => () => { requestId.current += 1; }, []);
  const refetch = useCallback(async () => {
    const request = ++requestId.current;
    if (!storeId || !userId) return;
    setState(previous => ({ scope, alerts: previous.scope === scope ? previous.alerts : [], loading: true, error: null }));
    try {
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const [stock, hasFixed] = await Promise.all([
        getHomeAlertStock(storeId), financial ? hasMonthlyFixedExpense(storeId, yearMonth) : undefined,
      ]);
      const alerts = buildHomeAlerts({ stock, now, fixedExpenseMissing: financial ? !hasFixed : undefined,
        // 오늘 매출 0원 여부는 화면에서 현재 값으로 판단한다. 매출이 바뀔 때마다 알림 원본을 다시 읽지 않는다.
        tossNotSynced: financial && tossLinked });
      const read = new Set(await getHomeAlertReads(storeId, userId, alerts.map(alert => alert.key)));
      if (request !== requestId.current || scopeRef.current !== scope) return;
      setState({ scope, alerts: alerts.filter(alert => !read.has(alert.key)), loading: false, error: null });
    } catch {
      if (request !== requestId.current || scopeRef.current !== scope) return;
      setState(previous => ({ scope, alerts: previous.scope === scope ? previous.alerts : [], loading: false,
        error: '홈 알림을 불러오지 못했어요. 다시 시도해 주세요.' }));
    }
  }, [storeId, userId, scope, financial, tossLinked]);
  const markRead = useCallback(async (key: string) => {
    if (!storeId || !userId) throw new UserFacingError('로그인과 매장을 확인해 주세요.');
    await markHomeAlertRead(storeId, userId, key);
    if (scopeRef.current === scope) {
      requestId.current += 1;
      setState(previous => previous.scope === scope ? { ...previous, loading: false, alerts: previous.alerts.filter(alert => alert.key !== key) } : previous);
      return true;
    }
    return false;
  }, [storeId, userId, scope]);
  const visible = state.scope === scope;
  const shown = visible ? state.alerts.filter(alert => alert.kind !== 'tossNotSynced' || todaySales === 0) : [];
  return { alerts: shown, loading: visible ? state.loading : !!storeId,
    error: visible ? state.error : null, refetch, markRead };
}

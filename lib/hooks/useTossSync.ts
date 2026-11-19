import { usePreviewWriteGuard } from './usePreviewWriteGuard';
import { CancelledError, isCancelledError } from '@tanstack/react-query';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserFacingError, getErrorMessage } from '../utils/error';
import { fetchTossOrders, fetchTossCatalog, saveCatalog } from '../services/tossplace';
import { getAutoSyncRange, getBusinessDayRange, getDailySummariesByRange } from '../services/posAnalytics';
import { getTossMerchantId, hasPosOrders, savePosOrders } from '../services/tossSync';
import { coordinatePosSync, subscribePosSyncCompletion, POS_RECENT_SYNC_INTERVAL_MS, POS_HISTORY_SYNC_INTERVAL_MS } from '../services/posSyncCoordinator';
import { queryClient, queryKeys, useQueryScope, isAccessDenied } from '../query';
import { DailySummary, TossOrder } from '../../types';

export function useTossSync() {
  const { assertCanWrite } = usePreviewWriteGuard();
  const { store, canManageStore, canReadFinancials } = useAuth();
  const scope = useQueryScope();
  const identity = `${scope}:${store?.id ?? ''}:${store?.closing_time ?? ''}`;
  const current = useRef(identity);
  current.current = identity;
  const [loading, setLoading] = useState(false);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [todayError, setTodayError] = useState<string | null>(null);
  const [deniedSalesIdentity, setDeniedSalesIdentity] = useState<string | null>(null);
  const todayRequest = useRef(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [todaySales, setTodaySales] = useState(0);
  const [todayOrderCount, setTodayOrderCount] = useState(0);
  const storeId = store?.id;
  const merchantId = store?.toss_merchant_id;
  const closingTime = store?.closing_time ?? '23:00';
  const todayFrom = getAutoSyncRange(closingTime).from;
  const todayIdentity = `${identity}:${todayFrom}`;
  const salesIdentity = useRef(todayIdentity);
  const todayKey = queryKeys.store(scope, storeId ?? '', 'pos', 'today', closingTime, todayFrom);
  const cachedToday = canReadFinancials && storeId ? queryClient.getQueryData<DailySummary[]>(todayKey) : undefined;
  const canShowToday = canReadFinancials && deniedSalesIdentity !== todayIdentity && !isAccessDenied(queryClient.getQueryState(todayKey)?.error);
  const visibleSales = canShowToday && salesIdentity.current === todayIdentity ? todaySales : 0;
  const visibleCount = canShowToday && salesIdentity.current === todayIdentity ? todayOrderCount : 0;
  useEffect(() => {
    current.current = identity;
    setLoading(false); setAutoSyncing(false); setError(null); setLastSyncAt(null);
    todayRequest.current += 1; setTodayError(null);
    setTodaySales(0); setTodayOrderCount(0);
    return () => { if (current.current === identity) current.current = ''; };
  }, [identity]);

  const syncOrders = useCallback(async (dateFrom: string, dateTo: string): Promise<TossOrder[]> => {
    assertCanWrite();
    if (!storeId || !canManageStore) throw new UserFacingError('관리자만 POS를 동기화할 수 있어요.');
    setLoading(true); setError(null);
    try {
      const orders = await fetchTossOrders(await getTossMerchantId(storeId, merchantId), dateFrom, dateTo);
      assertCanWrite();
      if (current.current !== identity) throw new CancelledError();
      await savePosOrders(storeId, orders);
      if (current.current === identity) setLastSyncAt(new Date().toISOString());
      return orders;
    } catch (e) {
      if (!isCancelledError(e) && current.current === identity) setError(getErrorMessage(e));
      throw e;
    } finally { if (current.current === identity) setLoading(false); }
  }, [storeId, merchantId, identity, canManageStore]);

  const syncCatalog = useCallback(async () => {
    assertCanWrite();
    if (!storeId || !canManageStore) throw new UserFacingError('관리자만 POS를 동기화할 수 있어요.');
    setLoading(true); setError(null);
    try {
      const items = await fetchTossCatalog(await getTossMerchantId(storeId, merchantId));
      assertCanWrite();
      if (items.length) await saveCatalog(storeId, items);
      return items;
    } catch (e) {
      if (current.current === identity) setError(getErrorMessage(e));
      throw e;
    } finally { if (current.current === identity) setLoading(false); }
  }, [storeId, merchantId, identity, canManageStore]);

  const loadTodaySales = useCallback(async (force = false) => {
    if (!storeId || !canReadFinancials || current.current !== identity) return;
    const request = ++todayRequest.current;
    const valid = () => current.current === identity && request === todayRequest.current && getAutoSyncRange(closingTime).from === from;
    const { from } = getAutoSyncRange(closingTime);
    const to = new Date(Date.now()).toISOString();
    try {
      const rows = await queryClient.fetchQuery({
        queryKey: queryKeys.store(scope, storeId, 'pos', 'today', closingTime, from),
        queryFn: () => getDailySummariesByRange(storeId, closingTime, new Date(from), new Date(to)),
        staleTime: force ? 0 : 30_000, gcTime: 900_000,
      });
      if (!valid()) return;
      salesIdentity.current = `${identity}:${from}`;
      setDeniedSalesIdentity(null);
      setTodayError(null);
      setTodaySales(rows.reduce((sum, row) => sum + row.totalAmount, 0));
      setTodayOrderCount(rows.reduce((sum, row) => sum + row.orderCount, 0));
    } catch (e) {
      if (!isCancelledError(e) && valid()) {
        if (isAccessDenied(e)) setDeniedSalesIdentity(`${identity}:${from}`);
        setTodayError(getErrorMessage(e));
      }
    }
  }, [storeId, closingTime, scope, identity, canReadFinancials]);

  // Wake at the Korean business-day boundary even when the screen stays open.
  const [, setBusinessDayTick] = useState(0);
  useEffect(() => {
    if (!storeId || !canReadFinancials) return;
    const delay = Math.max(1, Date.parse(todayFrom) + 86_400_000 - Date.now());
    const timer = setTimeout(() => {
      setBusinessDayTick(tick => tick + 1);
      void loadTodaySales();
    }, delay);
    return () => clearTimeout(timer);
  }, [storeId, canReadFinancials, todayFrom, loadTodaySales]);

  useEffect(() => subscribePosSyncCompletion(identity, () => {
    void loadTodaySales();
  }), [identity, loadTodaySales]);

  // Callbacks depend only on scope/configuration, never on loading or sync timestamps.
  const autoSync = useCallback(async () => {
    if (!storeId || !canManageStore) return;
    setAutoSyncing(true);
    try {
      const { from, to } = getAutoSyncRange(closingTime);
      await coordinatePosSync(identity, `today:${from}`, POS_RECENT_SYNC_INTERVAL_MS, async () => {
        if (current.current !== identity) throw new CancelledError();
        if (!(await hasPosOrders(storeId, from, to))) await syncOrders(from, to);
      });
      await loadTodaySales();
    } catch (e) { if (!isCancelledError(e) && current.current === identity) setError(getErrorMessage(e)); }
    finally { if (current.current === identity) setAutoSyncing(false); }
  }, [storeId, closingTime, identity, syncOrders, loadTodaySales, canManageStore]);

  const autoSyncRecent = useCallback(async (close: string, days = 14) => {
    if (!storeId || !canManageStore) return;
    setAutoSyncing(true);
    try {
      const interval = days > 2 ? POS_HISTORY_SYNC_INTERVAL_MS : POS_RECENT_SYNC_INTERVAL_MS;
      await coordinatePosSync(identity, `recent:${close}:${days}`, interval, async () => {
        if (current.current !== identity) throw new CancelledError();
        const { from } = getAutoSyncRange(close);
        const start = new Date(new Date(from).getTime() - days * 86_400_000);
        await syncOrders(start.toISOString(), new Date().toISOString());
      });
      await loadTodaySales();
    } catch (e) { if (!isCancelledError(e) && current.current === identity) setError(getErrorMessage(e)); }
    finally { if (current.current === identity) setAutoSyncing(false); }
  }, [storeId, identity, syncOrders, loadTodaySales, canManageStore]);

  const syncByDate = useCallback(async (date: string) => {
    const { from, to } = getBusinessDayRange(date, closingTime);
    await syncOrders(from, to);
  }, [closingTime, syncOrders]);
  const syncByMonth = useCallback(async (year: number, month: number) => {
    const from = getBusinessDayRange(`${year}-${String(month).padStart(2, '0')}-01`, closingTime).from;
    const next = new Date(Date.UTC(year, month, 1));
    const end = getBusinessDayRange(next.toISOString().slice(0, 10), closingTime).from;
    await syncOrders(from, new Date(Math.min(new Date(end).getTime(), Date.now())).toISOString());
  }, [closingTime, syncOrders]);
  const autoSyncOnForeground = useCallback(async () => {
    const kst = new Date(Date.now() + 9 * 3600_000);
    const [h, m] = closingTime.split(':').map(Number);
    if (kst.getUTCHours() * 60 + kst.getUTCMinutes() >= h * 60 + m) await autoSyncRecent(closingTime, 2);
    else await autoSync();
  }, [closingTime, autoSyncRecent, autoSync]);
  return { loading, autoSyncing, error: error ?? todayError, lastSyncAt,
    todaySales: canShowToday && cachedToday ? cachedToday.reduce((sum, row) => sum + row.totalAmount, 0) : visibleSales,
    todayOrderCount: canShowToday && cachedToday ? cachedToday.reduce((sum, row) => sum + row.orderCount, 0) : visibleCount,
    syncOrders, syncCatalog, loadTodaySales, autoSync, autoSyncRecent, autoSyncOnForeground, syncByDate, syncByMonth };
}

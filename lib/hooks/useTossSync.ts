import { isCancelledError } from '@tanstack/react-query';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserFacingError, getErrorMessage } from '../utils/error';
import { fetchTossOrders, fetchTossCatalog, saveCatalog } from '../services/tossplace';
import { getAutoSyncRange, getBusinessDayRange, getDailySummariesByRange } from '../services/posAnalytics';
import { getTossMerchantId, hasPosOrders, savePosOrders } from '../services/tossSync';
import { coordinatePosSync } from '../services/posSyncCoordinator';
import { queryClient, queryKeys, useQueryScope } from '../query';
import { TossOrder } from '../../types';

export function useTossSync() {
  const { store, currentRole, canReadFinancials } = useAuth();
  const scope = useQueryScope();
  const identity = `${scope}:${store?.id ?? ''}:${store?.closing_time ?? ''}`;
  const current = useRef(identity);
  current.current = identity;
  const [loading, setLoading] = useState(false);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [todayError, setTodayError] = useState<string | null>(null);
  const todayRequest = useRef(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [todaySales, setTodaySales] = useState(0);
  const [todayOrderCount, setTodayOrderCount] = useState(0);
  const storeId = store?.id;
  const merchantId = store?.toss_merchant_id;
  const closingTime = store?.closing_time ?? '23:00';
  useEffect(() => {
    setLoading(false); setAutoSyncing(false); setError(null); setLastSyncAt(null);
    todayRequest.current += 1; setTodayError(null);
    setTodaySales(0); setTodayOrderCount(0);
  }, [identity]);

  const syncOrders = useCallback(async (dateFrom: string, dateTo: string): Promise<TossOrder[]> => {
    if (!storeId || currentRole !== 'admin') throw new UserFacingError('관리자만 POS를 동기화할 수 있어요.');
    setLoading(true); setError(null);
    try {
      const orders = await fetchTossOrders(await getTossMerchantId(storeId, merchantId), dateFrom, dateTo);
      await savePosOrders(storeId, orders);
      if (current.current === identity) setLastSyncAt(new Date().toISOString());
      return orders;
    } catch (e) {
      if (current.current === identity) setError(getErrorMessage(e));
      throw e;
    } finally { if (current.current === identity) setLoading(false); }
  }, [storeId, merchantId, identity, currentRole]);

  const syncCatalog = useCallback(async () => {
    if (!storeId || currentRole !== 'admin') throw new UserFacingError('관리자만 POS를 동기화할 수 있어요.');
    setLoading(true); setError(null);
    try {
      const items = await fetchTossCatalog(await getTossMerchantId(storeId, merchantId));
      if (items.length) await saveCatalog(storeId, items);
      return items;
    } catch (e) {
      if (current.current === identity) setError(getErrorMessage(e));
      throw e;
    } finally { if (current.current === identity) setLoading(false); }
  }, [storeId, merchantId, identity, currentRole]);

  const loadTodaySales = useCallback(async () => {
    if (!storeId || !canReadFinancials) return;
    const request = ++todayRequest.current;
    const valid = () => current.current === identity && request === todayRequest.current;
    const { from } = getAutoSyncRange(closingTime);
    // Stable minute boundary lets simultaneous hook instances share the same request.
    const to = new Date(Math.ceil(Date.now() / 60_000) * 60_000).toISOString();
    try {
      const rows = await queryClient.fetchQuery({
        queryKey: queryKeys.store(scope, storeId, 'pos', 'today', closingTime, from, to),
        queryFn: () => getDailySummariesByRange(storeId, closingTime, new Date(from), new Date(to)),
        staleTime: 30_000, gcTime: 900_000,
      });
      if (!valid()) return;
      setTodayError(null);
      setTodaySales(rows.reduce((sum, row) => sum + row.totalAmount, 0));
      setTodayOrderCount(rows.reduce((sum, row) => sum + row.orderCount, 0));
    } catch (e) { if (!isCancelledError(e) && valid()) setTodayError(getErrorMessage(e)); }
  }, [storeId, closingTime, scope, identity, canReadFinancials]);

  // Callbacks depend only on scope/configuration, never on loading or sync timestamps.
  const autoSync = useCallback(async () => {
    if (!storeId || currentRole !== 'admin') return;
    setAutoSyncing(true);
    try {
      const { from, to } = getAutoSyncRange(closingTime);
      await coordinatePosSync(identity, `today:${from}`, 30 * 60_000, async () => {
        if (!(await hasPosOrders(storeId, from, to))) await syncOrders(from, to);
      });
      await loadTodaySales();
    } catch (e) { if (!isCancelledError(e) && current.current === identity) setError(getErrorMessage(e)); }
    finally { if (current.current === identity) setAutoSyncing(false); }
  }, [storeId, closingTime, identity, syncOrders, loadTodaySales, currentRole]);

  const autoSyncRecent = useCallback(async (close: string, days = 14) => {
    if (!storeId || currentRole !== 'admin') return;
    setAutoSyncing(true);
    try {
      await coordinatePosSync(identity, `recent:${close}:${days}`, 30 * 60_000, async () => {
        const { from } = getAutoSyncRange(close);
        const start = new Date(new Date(from).getTime() - days * 86_400_000);
        await syncOrders(start.toISOString(), new Date().toISOString());
      });
      await loadTodaySales();
    } catch (e) { if (!isCancelledError(e) && current.current === identity) setError(getErrorMessage(e)); }
    finally { if (current.current === identity) setAutoSyncing(false); }
  }, [storeId, identity, syncOrders, loadTodaySales, currentRole]);

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
  return { loading, autoSyncing, error: error ?? todayError, lastSyncAt, todaySales, todayOrderCount,
    syncOrders, syncCatalog, loadTodaySales, autoSync, autoSyncRecent, autoSyncOnForeground, syncByDate, syncByMonth };
}

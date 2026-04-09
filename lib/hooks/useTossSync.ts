import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabase';
import { fetchTossOrders, fetchTossCatalog, saveCatalog } from '../services/tossplace';
import { getAutoSyncRange, getBusinessDayRange } from '../services/posAnalytics';
import { TossOrder, TossCatalogItem } from '../../types';

interface TossSyncState {
  loading: boolean;
  error: string | null;
  lastSyncAt: string | null;
  todaySales: number;
  todayOrderCount: number;
}

interface UseTossSyncResult extends TossSyncState {
  syncOrders: (dateFrom: string, dateTo: string) => Promise<TossOrder[]>;
  syncCatalog: () => Promise<TossCatalogItem[]>;
  loadTodaySales: () => Promise<void>;
  autoSync: () => Promise<void>;
  syncByDate: (date: string) => Promise<void>;
  autoSyncing: boolean;
}

export function useTossSync(): UseTossSyncResult {
  const { store } = useAuth();
  const [loading, setLoading] = useState(false);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [todaySales, setTodaySales] = useState(0);
  const [todayOrderCount, setTodayOrderCount] = useState(0);

  async function getMerchantId(): Promise<string> {
    if (!store) throw new Error('매장 정보가 없습니다');

    const { data, error } = await supabase
      .from('stores')
      .select('toss_merchant_id')
      .eq('id', store.id)
      .single();

    if (error) throw new Error(error.message);
    if (!data.toss_merchant_id) throw new Error('Toss Place 연동이 설정되지 않았습니다');

    return data.toss_merchant_id as string;
  }

  async function getClosingTime(): Promise<string> {
    if (!store) return '23:00';
    const { data } = await supabase
      .from('stores')
      .select('closing_time')
      .eq('id', store.id)
      .single();
    return (data?.closing_time as string | null) ?? '23:00';
  }

  const syncOrders = useCallback(async (dateFrom: string, dateTo: string): Promise<TossOrder[]> => {
    if (!store) throw new Error('매장 정보가 없습니다');
    setLoading(true);
    setError(null);
    try {
      const merchantId = await getMerchantId();
      const orders = await fetchTossOrders(merchantId, dateFrom, dateTo);

      if (orders.length > 0) {
        // RPC 함수를 사용해 트랜잭션 단위로 주문 + 상세항목 저장 (병렬 처리)
        await Promise.all(orders.map(async (o) => {
          const { error: rpcError } = await supabase.rpc('upsert_toss_order_with_items', {
            p_store_id: store.id,
            p_toss_order_id: o.orderId,
            p_order_at: o.orderAt,
            p_total_amount: o.totalAmount,
            p_status: o.status,
            p_items: o.items,
          });
          if (rpcError) throw new Error(rpcError.message);
        }));
      }

      setLastSyncAt(new Date().toISOString());
      return orders;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const syncCatalog = useCallback(async (): Promise<TossCatalogItem[]> => {
    if (!store) throw new Error('매장 정보가 없습니다');
    setLoading(true);
    setError(null);
    try {
      const merchantId = await getMerchantId();
      const items = await fetchTossCatalog(merchantId);
      if (items.length > 0) {
        await saveCatalog(store.id, items);
      }
      return items;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const loadTodaySales = useCallback(async () => {
    if (!store) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from('toss_orders')
      .select('total_amount, status')
      .eq('store_id', store.id)
      .eq('status', 'COMPLETED')
      .gte('order_at', today.toISOString());

    const sales = data ?? [];
    setTodaySales(sales.reduce((sum: number, s: { total_amount: number }) => sum + Number(s.total_amount), 0));
    setTodayOrderCount(sales.length);
  }, [store]);

  /** 오늘 영업일 데이터 없으면 자동 동기화 */
  const autoSync = useCallback(async (): Promise<void> => {
    if (!store || autoSyncing) return;
    try {
      setAutoSyncing(true);
      const closingTime = await getClosingTime();
      const { from, to } = getAutoSyncRange(closingTime);

      // 이미 데이터 있으면 스킵
      const { count } = await supabase
        .from('toss_orders')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', store.id)
        .gte('order_at', from)
        .lte('order_at', to);

      if ((count ?? 0) > 0) return;

      const merchantId = await getMerchantId();
      const orders = await fetchTossOrders(merchantId, from, to);

      if (orders.length > 0) {
        await Promise.all(orders.map((o) =>
          supabase.rpc('upsert_toss_order_with_items', {
            p_store_id: store.id,
            p_toss_order_id: o.orderId,
            p_order_at: o.orderAt,
            p_total_amount: o.totalAmount,
            p_status: o.status,
            p_items: o.items,
          })
        ));
      }

      setLastSyncAt(new Date().toISOString());
      await loadTodaySales();
    } catch {
      // 자동 동기화 실패는 조용히 무시
    } finally {
      setAutoSyncing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, autoSyncing]);

  /** 특정 날짜 영업일 수동 동기화 */
  const syncByDate = useCallback(async (date: string): Promise<void> => {
    if (!store) throw new Error('매장 정보가 없습니다');
    const closingTime = await getClosingTime();
    const { from, to } = getBusinessDayRange(date, closingTime);
    // ISO 타임스탬프 그대로 전달 (Toss API: from/to 파라미터, timestamp 형식)
    await syncOrders(from, to);
  }, [store, syncOrders]);

  return {
    loading,
    error,
    lastSyncAt,
    todaySales,
    todayOrderCount,
    syncOrders,
    syncCatalog,
    loadTodaySales,
    autoSync,
    syncByDate,
    autoSyncing,
  };
}

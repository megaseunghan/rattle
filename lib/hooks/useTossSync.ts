import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabase';
import { fetchTossOrders, fetchTossCatalog } from '../services/tossplace';
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
}

export function useTossSync(): UseTossSyncResult {
  const { store } = useAuth();
  const [loading, setLoading] = useState(false);
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

  const syncOrders = useCallback(async (dateFrom: string, dateTo: string): Promise<TossOrder[]> => {
    if (!store) throw new Error('매장 정보가 없습니다');
    setLoading(true);
    setError(null);
    try {
      const merchantId = await getMerchantId();
      const orders = await fetchTossOrders(merchantId, dateFrom, dateTo);

      if (orders.length > 0) {
        const rows = orders.map(o => ({
          store_id: store.id,
          toss_order_id: o.orderId,
          order_at: o.orderAt,
          total_amount: o.totalAmount,
          status: o.status,
          items: o.items,
        }));

        const { error: upsertError } = await supabase
          .from('toss_sales')
          .upsert(rows, { onConflict: 'toss_order_id' });

        if (upsertError) throw new Error(upsertError.message);
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
    setLoading(true);
    setError(null);
    try {
      const merchantId = await getMerchantId();
      return await fetchTossCatalog(merchantId);
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
      .from('toss_sales')
      .select('total_amount, status')
      .eq('store_id', store.id)
      .eq('status', 'COMPLETED')
      .gte('order_at', today.toISOString());

    const sales = data ?? [];
    setTodaySales(sales.reduce((sum: number, s: { total_amount: number }) => sum + Number(s.total_amount), 0));
    setTodayOrderCount(sales.length);
  }, [store]);

  return {
    loading,
    error,
    lastSyncAt,
    todaySales,
    todayOrderCount,
    syncOrders,
    syncCatalog,
    loadTodaySales,
  };
}

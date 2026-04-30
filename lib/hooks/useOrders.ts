import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getOrders,
  createOrderWithItems,
  updateOrderStatus,
  deliverOrder,
  deleteOrder,
  OrderWithItems,
} from '../services/orders';
import { Order } from '../../types';

const PAGE_SIZE = 20;
const CACHE_TTL = 60_000;

interface UseOrdersResult {
  data: OrderWithItems[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
  create: (
    supplierName: string,
    orderDate: string,
    items: { ingredient_id: string; quantity: number; unit: string; unit_price: number }[]
  ) => Promise<void>;
  updateStatus: (id: string, status: Order['status']) => Promise<void>;
  deliver: (orderId: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useOrders(): UseOrdersResult {
  const { store } = useAuth();
  const [data, setData] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const lastFetchedAt = useRef(0);

  const refetch = useCallback(async () => {
    if (!store) return;
    if (Date.now() - lastFetchedAt.current < CACHE_TTL) return;
    setLoading(true);
    setError(null);
    setPage(0);
    setHasMore(true);
    try {
      const result = await getOrders(store.id, 0, PAGE_SIZE);
      setData(result);
      setHasMore(result.length === PAGE_SIZE);
      lastFetchedAt.current = Date.now();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [store]);

  const loadMore = useCallback(async () => {
    if (!store || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await getOrders(store.id, nextPage, PAGE_SIZE);
      setData(prev => [...prev, ...result]);
      setPage(nextPage);
      setHasMore(result.length === PAGE_SIZE);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  }, [store, page, hasMore, loadingMore]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function create(
    supplierName: string,
    orderDate: string,
    items: { ingredient_id: string; quantity: number; unit: string; unit_price: number }[]
  ) {
    if (!store) return;
    await createOrderWithItems(store.id, supplierName, orderDate, items);
    lastFetchedAt.current = 0;
    await refetch();
  }

  async function updateStatus(id: string, status: Order['status']) {
    await updateOrderStatus(id, status);
    lastFetchedAt.current = 0;
    await refetch();
  }

  async function deliver(orderId: string) {
    await deliverOrder(orderId);
    lastFetchedAt.current = 0;
    await refetch();
  }

  async function remove(id: string) {
    const previous = data;
    setData(prev => prev.filter(item => item.id !== id));
    try {
      await deleteOrder(id);
    } catch (e: any) {
      setData(previous);
      setError(e.message);
    }
  }

  return { data, loading, loadingMore, hasMore, error, refetch, loadMore, create, updateStatus, deliver, remove };
}

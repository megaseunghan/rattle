import { useState, useEffect, useCallback } from 'react';
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

interface UseOrdersResult {
  data: OrderWithItems[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
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
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getOrders(store.id);
      setData(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [store]);

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
    await refetch();
  }

  async function updateStatus(id: string, status: Order['status']) {
    await updateOrderStatus(id, status);
    await refetch();
  }

  async function deliver(orderId: string) {
    await deliverOrder(orderId);
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

  return { data, loading, error, refetch, create, updateStatus, deliver, remove };
}

import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getPurchasesByMonth, createPurchase, deletePurchase } from '../services/purchases';
import { Purchase, PurchaseCategory, PurchaseType } from '../../types';

export function usePurchases(yearMonth: string) {
  const { store } = useAuth();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getPurchasesByMonth(store.id, yearMonth);
      setPurchases(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [store, yearMonth]);

  const add = useCallback(async (data: {
    date: string;
    supplier: string;
    amount: number;
    category: PurchaseCategory;
    type: PurchaseType;
    note?: string | null;
  }) => {
    if (!store) throw new Error('매장 정보가 없습니다');
    const created = await createPurchase({ ...data, store_id: store.id });
    setPurchases(prev => [created, ...prev]);
    return created;
  }, [store]);

  const remove = useCallback(async (id: string) => {
    await deletePurchase(id);
    setPurchases(prev => prev.filter(p => p.id !== id));
  }, []);

  return { purchases, loading, error, refetch, add, remove };
}

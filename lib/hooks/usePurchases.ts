import { getErrorMessage, UserFacingError } from '../utils/error';
import { useState, useCallback, useRef } from 'react';
import { useQueryScope } from '../query';
import { useAuth } from '../contexts/AuthContext';
import { getPurchasesByMonth, createPurchase, deletePurchase, createPurchaseWithItems } from '../services/purchases';
import { Purchase, PurchaseCategory, PurchaseType, PurchaseItemInput } from '../../types';

export function usePurchases(yearMonth: string) {
  const { store } = useAuth();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const scope = useQueryScope();
  const identity = `${scope}:${store?.id ?? ''}:${yearMonth}`;
  const active = useRef(identity);
  active.current = identity;
  const requestVersion = useRef(0);
  const [loadedIdentity, setLoadedIdentity] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<{ identity: string; message: string } | null>(null);
  const error = errorState?.identity === identity ? errorState.message : null;

  const refetch = useCallback(async () => {
    if (!store || active.current !== identity) return false;
    const version = ++requestVersion.current;
    const current = () => active.current === identity && requestVersion.current === version;
    setLoading(true);
    setErrorState(null);
    try {
      const result = await getPurchasesByMonth(store.id, yearMonth);
      if (current()) { setPurchases(result); setLoadedIdentity(identity); }
      return true;
    } catch (e: any) {
      if (current()) setErrorState({ identity, message: getErrorMessage(e) });
      return false;
    } finally {
      if (current()) setLoading(false);
    }
  }, [store, yearMonth, identity]);

  const add = useCallback(async (data: {
    date: string;
    supplier: string;
    amount: number;
    category: PurchaseCategory;
    type: PurchaseType;
    note?: string | null;
  }) => {
    if (!store) throw new UserFacingError('매장 정보가 없습니다');
    const created = await createPurchase({ ...data, store_id: store.id });
    if (active.current === identity) { setPurchases(prev => [created, ...prev]); setLoadedIdentity(identity); }
    return created;
  }, [store, identity]);

  const addWithItems = useCallback(async (data: {
    date: string;
    supplier: string;
    type: PurchaseType;
    items: PurchaseItemInput[];
  }) => {
    if (!store) throw new UserFacingError('매장 정보가 없습니다');
    const result = await createPurchaseWithItems({ ...data, store_id: store.id });
    const refreshed = await refetch();
    return { refreshFailed: result.refreshFailed || !refreshed };
  }, [store, refetch]);

  const remove = useCallback(async (id: string) => {
    await deletePurchase(id);
    setPurchases(prev => prev.filter(p => p.id !== id));
  }, []);

  return { loaded: loadedIdentity === identity, purchases: loadedIdentity === identity ? purchases : [], loading: !!store && (loading || (loadedIdentity !== identity && !error)), error, refetch, add, addWithItems, remove };
}

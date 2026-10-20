import { UserFacingError } from '../utils/error';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { changePurchaseType, DEFAULT_PURCHASE_TYPES, getPurchaseTypes } from '../services/purchaseTypes';

export function usePurchaseTypes() {
  const { store } = useAuth();
  const storeId = store?.id;
  const currentStore = useRef(storeId);
  currentStore.current = storeId;
  const requestId = useRef(0);
  const [state, setState] = useState<{ storeId?: string; types: string[]; loading: boolean; error: string | null }>({
    types: DEFAULT_PURCHASE_TYPES, loading: false, error: null,
  });
  useEffect(() => () => { requestId.current += 1; }, []);
  const refetch = useCallback(async () => {
    const request = ++requestId.current;
    if (!storeId) return;
    setState(previous => ({ storeId, types: previous.storeId === storeId ? previous.types : DEFAULT_PURCHASE_TYPES, loading: true, error: null }));
    try {
      const types = await getPurchaseTypes(storeId);
      if (request === requestId.current && currentStore.current === storeId) setState({ storeId, types, loading: false, error: null });
    } catch {
      if (request === requestId.current && currentStore.current === storeId) setState(previous => ({ ...previous, loading: false,
        error: ' 매입 유형을 불러오지 못했어요. 다시 시도해주세요.'.trim() }));
    }
  }, [storeId]);
  useEffect(() => { void refetch(); }, [refetch]);
  const change = useCallback(async (oldName: string | null, newName: string) => {
    if (!storeId) throw new UserFacingError('매장을 선택해 주세요.');
    const types = await changePurchaseType(storeId, oldName, newName);
    if (currentStore.current === storeId) {
      requestId.current += 1;
      setState({ storeId, types, loading: false, error: null });
    }
  }, [storeId]);
  const visible = state.storeId === storeId;
  return { types: visible ? state.types : DEFAULT_PURCHASE_TYPES, loading: visible && state.loading,
    error: visible ? state.error : null, refetch,
    add: (name: string) => change(null, name), rename: (oldName: string, newName: string) => change(oldName, newName) };
}

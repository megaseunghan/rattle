import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { isAccessDenied, queryClient, queryKeys, useQueryScope } from '../query';
import { getErrorMessage } from '../utils/error';
import { getManualSalesByMonth, deleteManualSale } from '../services/manualSales';
import { ManualSale } from '../../types';
const EMPTY: ManualSale[] = [];
export function useManualSales(yearMonth: string) {
  const { store } = useAuth();
  const accessScope = useQueryScope();
  const storeId = store?.id;
  const scope = `${accessScope}:${storeId}:${yearMonth}`;
  const active = useRef(scope); active.current = scope;
  useEffect(() => { active.current = scope; return () => { active.current = ''; }; }, [scope]);
  const lock = useRef<string | null>(null);
  const uncertain = useRef(new Set<string>());
  const reads = useRef(new Map<string, number>());
  const [action, setAction] = useState<{ scope: string; id: string | null; error: string | null } | null>(null);
  const key = queryKeys.store(accessScope, storeId ?? '', 'sales', 'manual', yearMonth);
  const query = useQuery({ queryKey: key, queryFn: () => getManualSalesByMonth(storeId!, yearMonth), enabled: false }, queryClient);
  const sales = storeId && !isAccessDenied(query.error) ? query.data ?? EMPTY : EMPTY;
  const readError = query.error ? getErrorMessage(query.error) : null;
  const actionError = action?.scope === scope ? action.error : null;
  const refetch = useCallback(async () => {
    if (!storeId || lock.current === scope) return;
    reads.current.set(scope, (reads.current.get(scope) ?? 0) + 1);
    try {
      const result = await query.refetch();
      if (!result.error) {
        uncertain.current.delete(scope);
        if (active.current === scope) setAction(null);
      }
    } finally { reads.current.set(scope, Math.max(0, (reads.current.get(scope) ?? 1) - 1)); }
  }, [storeId, scope, query.refetch]);
  const remove = useCallback(async (id: string) => {
    if (!storeId || active.current !== scope || lock.current || uncertain.current.has(scope) || (reads.current.get(scope) ?? 0) > 0 || !query.isSuccess || query.isFetching || actionError || !sales.some(row => row.id === id)) return;
    lock.current = scope; setAction({ scope, id, error: null });
    try {
      await deleteManualSale(id);
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      queryClient.setQueryData<ManualSale[]>(key, previous => (previous ?? []).filter(row => row.id !== id));
      if (active.current === scope) setAction(null);
    } catch {
      uncertain.current.add(scope);
      if (active.current === scope) setAction({ scope, id: null, error: '삭제 여부를 확인하지 못했어요. 다시 불러와 실제 내역을 확인해주세요.' });
    } finally { if (lock.current === scope) lock.current = null; }
  }, [storeId, scope, key, query.isSuccess, query.isFetching, actionError, sales]);
  return { sales, loading: !!storeId && query.isPending && !query.error, refreshing: query.isFetching,
    ready: !!storeId && query.isSuccess, error: readError, actionError,
    removingId: action?.scope === scope ? action.id : null, refetch, remove,
    total: readError || actionError ? null : sales.reduce((sum, row) => sum + Number(row.cash_amount) + Number(row.card_amount), 0) };
}

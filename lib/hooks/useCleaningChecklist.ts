import { useCallback, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAccessDenied, queryClient, queryKeys, useQueryScope } from '../query';
import { getErrorMessage, UserFacingError } from '../utils/error';
import { useAuth } from '../contexts/AuthContext';
import {
  addCleaningItem, checkCleaningItem, listCleaningItems, listCleaningLogsByDate,
  removeCleaningItem, reorderCleaningItems, uncheckCleaningItem, updateCleaningItem,
} from '../services/cleaning';
import { CleaningItem, CleaningLog, CleaningSegment } from '../../types';

const EMPTY_ITEMS: CleaningItem[] = [];
const EMPTY_LOGS: CleaningLog[] = [];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useCleaningChecklist() {
  const { store } = useAuth();
  const scope = useQueryScope();
  const storeId = store?.id;
  const toggleLock = useRef(false);
  const [toggleError, setToggleError] = useState<{ scope: string; message: string } | null>(null);
  const uncertainScope = useRef<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const date = todayISO();

  const actionScope = `${scope}:${storeId}:${date}`;
  const itemKey = queryKeys.store(scope, storeId ?? '', 'cleaning', 'items');
  const logKey = queryKeys.store(scope, storeId ?? '', 'cleaning', 'logs', date);
  const itemQuery = useQuery({ queryKey: itemKey, queryFn: () => listCleaningItems(storeId!), enabled: !!storeId }, queryClient);
  const logQuery = useQuery({ queryKey: logKey, queryFn: () => listCleaningLogsByDate(storeId!, date), enabled: !!storeId }, queryClient);
  const items = storeId && !isAccessDenied(itemQuery.error) ? itemQuery.data ?? EMPTY_ITEMS : EMPTY_ITEMS;
  const logs = storeId && !isAccessDenied(logQuery.error) ? logQuery.data ?? EMPTY_LOGS : EMPTY_LOGS;
  const loading = !!storeId && (itemQuery.isFetching || logQuery.isFetching) && (itemQuery.data === undefined || logQuery.data === undefined);
  const error = itemQuery.error || logQuery.error;
  const refetch = useCallback(async () => {
    if (!storeId) return;
    const results = await Promise.all([itemQuery.refetch(), logQuery.refetch()]);
    if (results.every(result => !result.error)) {
      if (uncertainScope.current === actionScope) uncertainScope.current = null;
      setToggleError(previous => previous?.scope === actionScope ? null : previous);
    }
  }, [storeId, actionScope, itemQuery.refetch, logQuery.refetch]);

  // Cancel older reads before publishing committed writes to every screen sharing this scope.
  async function updateItems(update: (previous: CleaningItem[]) => CleaningItem[]) {
    await queryClient.cancelQueries({ queryKey: itemKey, exact: true });
    queryClient.setQueryData<CleaningItem[]>(itemKey, previous => update(previous ?? []));
  }
  async function updateLogs(update: (previous: CleaningLog[]) => CleaningLog[]) {
    await queryClient.cancelQueries({ queryKey: logKey, exact: true });
    queryClient.setQueryData<CleaningLog[]>(logKey, previous => update(previous ?? []));
  }

  async function toggle(item: CleaningItem, checkedByName: string) {
    if (!store || toggleLock.current || uncertainScope.current === actionScope) return;
    if (!itemQuery.isSuccess || !logQuery.isSuccess || itemQuery.isFetching || logQuery.isFetching) throw new UserFacingError('체크리스트를 다시 불러온 뒤 확인해주세요.');
    toggleLock.current = true;
    setCheckingId(item.id);
    try {
      const existing = logs.find(l => l.item_id === item.id);
      if (existing) {
        await uncheckCleaningItem(item.id, date);
        await updateLogs(prev => prev.filter(l => l.item_id !== item.id));
      } else {
        const log = await checkCleaningItem(store.id, item.id, date, checkedByName);
        await updateLogs(prev => [...prev.filter(l => l.item_id !== item.id), log]);
      }
    } catch {
      uncertainScope.current = actionScope;
      const message = '체크 결과를 확인하지 못했어요. 다시 불러와 현재 상태를 확인해주세요.';
      setToggleError({ scope: actionScope, message });
      throw new UserFacingError(message);
    } finally {
      toggleLock.current = false;
      setCheckingId(null);
    }
  }

  async function addItem(segment: CleaningSegment, title: string, weekday: number | null = null) {
    if (!store) throw new UserFacingError('매장을 선택해 주세요.');
    if (!itemQuery.isSuccess) throw new UserFacingError('체크리스트를 먼저 불러온 뒤 다시 추가해 주세요.');
    const sameSegment = items.filter(i => i.segment === segment);
    const sortOrder = sameSegment.length > 0 ? Math.max(...sameSegment.map(i => i.sort_order)) + 1 : 0;
    const item = await addCleaningItem(store.id, segment, title, sortOrder, weekday);
    await updateItems(prev => [...prev.filter(row => row.id !== item.id), item]);
    return item;
  }

  async function editItem(id: string, title: string) {
    await updateCleaningItem(id, title);
    await updateItems(prev => prev.map(i => (i.id === id ? { ...i, title } : i)));
  }

  async function removeItem(id: string) {
    await removeCleaningItem(id);
    await updateItems(prev => prev.filter(i => i.id !== id));
  }

  async function reorder(segmentItems: CleaningItem[]) {
    const updates = segmentItems.map((item, idx) => ({ id: item.id, sort_order: idx }));
    await reorderCleaningItems(updates);
    await updateItems(prev => prev.map(i => {
      const found = updates.find(u => u.id === i.id);
      return found ? { ...i, sort_order: found.sort_order } : i;
    }));
  }

  return {
    items, logs, loading, itemsReady: !!storeId && itemQuery.isSuccess, error: error ? getErrorMessage(error) : toggleError?.scope === actionScope ? toggleError.message : null, checkingId, date, refetch,
    toggle, addItem, editItem, removeItem, reorder,
  };
}

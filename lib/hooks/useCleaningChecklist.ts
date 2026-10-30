import { useCallback, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  addCleaningItem, checkCleaningItem, listCleaningItems, listCleaningLogsByDate,
  removeCleaningItem, reorderCleaningItems, uncheckCleaningItem, updateCleaningItem,
} from '../services/cleaning';
import { CleaningItem, CleaningLog, CleaningSegment } from '../../types';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useCleaningChecklist() {
  const { store, user } = useAuth();
  const [items, setItems] = useState<CleaningItem[]>([]);
  const [logs, setLogs] = useState<CleaningLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const date = todayISO();

  const refetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    try {
      const [itemRows, logRows] = await Promise.all([
        listCleaningItems(store.id),
        listCleaningLogsByDate(store.id, date),
      ]);
      setItems(itemRows);
      setLogs(logRows);
    } finally {
      setLoading(false);
    }
  }, [store, date]);

  async function toggle(item: CleaningItem, checkedByName: string) {
    if (!store) return;
    setCheckingId(item.id);
    try {
      const existing = logs.find(l => l.item_id === item.id);
      if (existing) {
        await uncheckCleaningItem(item.id, date);
        setLogs(prev => prev.filter(l => l.item_id !== item.id));
      } else {
        const log = await checkCleaningItem(store.id, item.id, date, checkedByName);
        setLogs(prev => [...prev, log]);
      }
    } finally {
      setCheckingId(null);
    }
  }

  async function addItem(segment: CleaningSegment, title: string, weekday: number | null = null) {
    if (!store) return;
    const sameSegment = items.filter(i => i.segment === segment);
    const sortOrder = sameSegment.length > 0 ? Math.max(...sameSegment.map(i => i.sort_order)) + 1 : 0;
    const item = await addCleaningItem(store.id, segment, title, sortOrder, weekday);
    setItems(prev => [...prev, item]);
  }

  const editItem = useCallback(async (id: string, title: string) => {
    await updateCleaningItem(id, title);
    setItems(prev => prev.map(i => (i.id === id ? { ...i, title } : i)));
  }, []);

  const removeItem = useCallback(async (id: string) => {
    await removeCleaningItem(id);
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  async function reorder(segmentItems: CleaningItem[]) {
    const updates = segmentItems.map((item, idx) => ({ id: item.id, sort_order: idx }));
    await reorderCleaningItems(updates);
    setItems(prev => prev.map(i => {
      const found = updates.find(u => u.id === i.id);
      return found ? { ...i, sort_order: found.sort_order } : i;
    }));
  }

  return {
    items, logs, loading, checkingId, date, refetch,
    toggle, addItem, editItem, removeItem, reorder,
  };
}

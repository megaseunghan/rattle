import { useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { queryClient, queryKeys, useQueryScope } from '../query';
import { listCleaningItems, listCleaningLogsByDate } from '../services/cleaning';

export function useDailyChecklistSummary(active: boolean, refreshKey: number) {
  const { store } = useAuth();
  const scope = useQueryScope();
  // Same calendar date convention as the checklist editor, including stores closing after midnight.
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const query = useQuery({
    queryKey: queryKeys.store(scope, store?.id ?? '', 'cleaning', 'daily-summary', date), enabled: false,
    queryFn: async () => {
      const [items, logs] = await Promise.all([listCleaningItems(store!.id), listCleaningLogsByDate(store!.id, date)]);
      const checked = new Set(logs.map(log => log.item_id));
      const summary = (segment: 'open' | 'close') => {
        const group = items.filter(item => item.segment === segment);
        return { total: group.length, done: group.filter(item => checked.has(item.id)).length };
      };
      return { open: summary('open'), close: summary('close') };
    }, staleTime: 15_000,
  }, queryClient);
  useFocusEffect(useCallback(() => { if (active && store) void query.refetch(); }, [active, store?.id, date, scope, query.refetch]));
  useEffect(() => { if (refreshKey && active && store) void query.refetch(); }, [refreshKey, active, store?.id, query.refetch]);
  return query;
}

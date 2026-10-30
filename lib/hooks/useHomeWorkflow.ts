import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { queryClient, queryKeys, useQueryScope } from '../query';
import { getHomeWorkflow } from '../services/homeWorkflow';

export function useHomeWorkflow(active = true) {
  const { store } = useAuth();
  const scope = useQueryScope();
  const query = useQuery({ queryKey: queryKeys.store(scope, store?.id ?? '', 'home-workflow'),
    queryFn: () => getHomeWorkflow(store!.id), enabled: active && !!store, staleTime: 15_000,
    refetchInterval: active ? 30_000 : false,
  }, queryClient);
  useFocusEffect(useCallback(() => { if (active && store) void query.refetch(); }, [active, store?.id, query.refetch]));
  return query;
}

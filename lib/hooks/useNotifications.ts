import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../services/notifications';
import { AppNotification, NotificationCategory } from '../../types';
import { queryClient, queryKeys, useQueryScope, isAccessDenied } from '../query';
import { subscribeNotificationPolling } from '../query/notificationPolling';

export function useNotifications() {
  const { store, user, currentRole, canReadFinancials } = useAuth();
  const scope = useQueryScope();
  const storeId = store?.id;
  const scopeId = `${scope}:${storeId ?? ''}`;
  const scopeRef = useRef(scopeId);
  scopeRef.current = scopeId;
  const [writeError, setWriteError] = useState<{ scope: string; message: string } | null>(null);
  const options = {
    queryKey: queryKeys.store(scope, storeId ?? '', 'notifications'),
    queryFn: () => getNotifications(storeId!, undefined, canReadFinancials), staleTime: 15_000,
  };
  // Only focused subscribers start reads; sharing a query does not create more timers.
  const query = useQuery({ ...options, enabled: false }, queryClient);
  const load = useCallback(async (force: boolean) => {
    if (!storeId || !user) return;
    try {
      await queryClient.fetchQuery({ queryKey: queryKeys.store(scope, storeId, 'notifications'),
        queryFn: () => getNotifications(storeId, undefined, canReadFinancials), staleTime: force ? 0 : 15_000 });
    } catch { /* The query error is displayed below. */ }
  }, [scope, storeId, user?.id, canReadFinancials]);
  const refetch = useCallback(async (_category?: NotificationCategory) => { await load(true); }, [load]);
  useFocusEffect(useCallback(() => {
    if (!storeId || !user) return;
    return subscribeNotificationPolling(scopeId, () => load(false), {
      isActive: () => AppState.currentState === 'active',
      subscribeActive: callback => {
        const subscription = AppState.addEventListener('change', state => { if (state === 'active') callback(); });
        return () => subscription.remove();
      },
    });
  }, [scopeId, storeId, user?.id, load]));

  const changeRead = useCallback(async (id?: string) => {
    if (!storeId || !user) return;
    try {
      if (id) await markNotificationRead(id);
      else await markAllNotificationsRead(storeId);
      if (scopeRef.current !== scopeId) return;
      const queryKey = queryKeys.store(scope, storeId, 'notifications');
      // Discard a GET started before this write, then publish to every observer.
      await queryClient.cancelQueries({ queryKey, exact: true });
      if (scopeRef.current !== scopeId) return;
      queryClient.setQueryData<AppNotification[]>(queryKey, items => items?.map(n => !id || n.id === id ? { ...n, is_read: true } : n));
      setWriteError(null);
    } catch {
      if (scopeRef.current === scopeId) setWriteError({ scope: scopeId, message: '알림을 읽음으로 바꾸지 못했어요. 다시 시도해주세요.' });
    }
  }, [scope, scopeId, storeId, user?.id]);
  const markRead = useCallback((id: string) => changeRead(id), [changeRead]);
  const markAllRead = useCallback(() => changeRead(), [changeRead]);
  const notifications = !storeId || !user || isAccessDenied(query.error) ? []
    : (query.data ?? []).filter(n => (n.category !== 'members' || currentRole === 'admin') && (canReadFinancials || !['sales', 'profit'].includes(n.category)));
  return { notifications, loading: query.isFetching,
    error: writeError?.scope === scopeId ? writeError.message : query.error ? '알림을 불러오지 못했어요. 다시 시도해주세요.' : null,
    unreadCount: notifications.filter(n => !n.is_read).length, refetch, markRead, markAllRead };
}

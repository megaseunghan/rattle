import { useCallback, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../services/notifications';
import { AppNotification, NotificationCategory } from '../../types';

export function useNotifications() {
  const { store } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async (category?: NotificationCategory) => {
    if (!store) return;
    setLoading(true);
    try {
      const data = await getNotifications(store.id, category);
      setNotifications(data);
    } finally {
      setLoading(false);
    }
  }, [store]);

  const markRead = useCallback(async (id: string) => {
    await markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }, []);

  const markAllRead = useCallback(async () => {
    if (!store) return;
    await markAllNotificationsRead(store.id);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }, [store]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return { notifications, loading, unreadCount, refetch, markRead, markAllRead };
}

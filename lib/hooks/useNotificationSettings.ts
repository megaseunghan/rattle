import { useCallback, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getNotificationSettings, setNotificationSetting } from '../services/notifications';

export function useNotificationSettings() {
  const { store } = useAuth();
  const [settings, setSettings] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    try {
      setSettings(await getNotificationSettings(store.id));
    } finally {
      setLoading(false);
    }
  }, [store]);

  const toggle = useCallback(async (key: string, enabled: boolean) => {
    if (!store) return;
    setSavingKey(key);
    setSettings(prev => ({ ...prev, [key]: enabled }));
    try {
      await setNotificationSetting(store.id, key, enabled);
    } finally {
      setSavingKey(null);
    }
  }, [store]);

  return { settings, loading, savingKey, refetch, toggle };
}

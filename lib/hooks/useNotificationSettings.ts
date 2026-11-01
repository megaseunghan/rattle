import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getNotificationSettings, setNotificationSetting } from '../services/notifications';
import { getErrorMessage } from '../utils/error';

export function useNotificationSettings() {
  const { store, user, currentRole, devPreviewMode } = useAuth();
  const storeId = store?.id;
  const scope = useMemo(() => ({}), [storeId, user?.id, currentRole, devPreviewMode]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const request = useRef(0);
  const writeLock = useRef<object | null>(null);
  const readyScope = useRef<object | null>(null);
  const [state, setState] = useState<{ scope: object; settings: Record<string, boolean>; ready: boolean; loading: boolean; error: string | null; savingKey: string | null }>(() => ({ scope, settings: {}, ready: false, loading: true, error: null, savingKey: null }));
  const available = !!storeId && !!user?.id;
  const visible: Pick<typeof state, 'settings' | 'ready' | 'loading' | 'error' | 'savingKey'> = !available
    ? { settings: {}, ready: false, loading: false, error: null, savingKey: null }
    : state.scope === scope ? state : { settings: {}, ready: false, loading: true, error: null, savingKey: null };

  const refetch = useCallback(async () => {
    if (!storeId || !available || !mounted.current || currentScope.current !== scope || writeLock.current === scope) return;
    readyScope.current = null;
    const id = ++request.current;
    const current = () => mounted.current && currentScope.current === scope && request.current === id;
    setState(prev => ({ scope, settings: prev.scope === scope ? prev.settings : {}, ready: false, loading: true, error: null, savingKey: null }));
    try {
      const settings = await getNotificationSettings(storeId);
      if (current()) { readyScope.current = scope; setState({ scope, settings, ready: true, loading: false, error: null, savingKey: null }); }
    } catch (e) {
      if (current()) setState({ scope, settings: {}, ready: false, loading: false, error: getErrorMessage(e), savingKey: null });
    }
  }, [storeId, scope, available]);

  const toggle = useCallback(async (key: string, enabled: boolean) => {
    if (!storeId || !available || !mounted.current || currentScope.current !== scope || readyScope.current !== scope || state.scope !== scope || !state.ready || state.loading || writeLock.current === scope) return;
    request.current += 1;
    writeLock.current = scope;
    const previous = state.settings;
    setState(prev => ({ ...prev, settings: { ...previous, [key]: enabled }, savingKey: key, error: null }));
    try {
      await setNotificationSetting(storeId, key, enabled);
    } catch {
      if (readyScope.current === scope) readyScope.current = null;
      if (mounted.current && currentScope.current === scope) setState(prev => ({ ...prev, settings: previous, ready: false, error: '저장 여부를 확인하지 못했어요. 설정을 다시 불러와 실제 상태를 확인해주세요.' }));
    } finally {
      if (writeLock.current === scope) writeLock.current = null;
      if (mounted.current && currentScope.current === scope) setState(prev => ({ ...prev, savingKey: null }));
    }
  }, [storeId, scope, state, available]);

  return { settings: visible.settings, loading: visible.loading, ready: visible.ready, error: visible.error, savingKey: visible.savingKey, refetch, toggle };
}

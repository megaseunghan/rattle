import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getMyStoreVisibility, setStoreVisibility } from '../services/storeVisibility';
import { getMyStoreAccess, setStoreManager } from '../services/storeAccess';
import type { StoreAccess, StoreVisibility, StoreVisibilityScopes } from '../../types';
import { useScopedWriteGuard } from './useScopedWriteGuard';

export function useRoleSettings() {
  const canWrite = useScopedWriteGuard([]);
  const { user, store, devPreviewMode, permissionRevision, access: authAccess, refreshStore } = useAuth();
  const scope = `${user?.id}:${store?.id}:${devPreviewMode}:${permissionRevision}`;
  const identity = useRef(scope); identity.current = scope;
  const request = useRef(0); const busy = useRef(false);
  const [state, setState] = useState({ scope, access: null as StoreAccess | null, visibility: null as StoreVisibility | null, loading: true, error: '', outcome: '' });
  const allowed = devPreviewMode === 'self' && authAccess?.is_owner === true;
  const refetch = useCallback(async (reconcile = false) => {
    const version = ++request.current;
    if (!store || !user || !allowed) { setState({ scope, access: null, visibility: null, loading: false, error: '', outcome: '' }); return; }
    try {
      const [access, visibility] = await Promise.all([getMyStoreAccess(store.id), getMyStoreVisibility(store.id)]);
      if (identity.current !== scope || version !== request.current) return;
      setState(old => ({ scope, access: access.status === 'success' ? access.data : null, visibility: visibility.status === 'success' ? visibility.data : null, loading: false,
        error: access.status === 'success' && visibility.status === 'success' ? '' : '설정을 불러오지 못했어요. 잠시 후 다시 확인해주세요', outcome: reconcile && access.status === 'success' && visibility.status === 'success' ? '' : old.scope === scope ? old.outcome : '' }));
    } catch { if (identity.current === scope) setState({ scope, access: null, visibility: null, loading: false, error: '설정을 불러오지 못했어요', outcome: '' }); }
  }, [scope, store?.id, user?.id, allowed]);
  useEffect(() => { busy.current = false; void refetch(); return () => { request.current++; }; }, [refetch]);
  async function save(action: 'visibility' | 'manager', input: StoreVisibilityScopes | string | null) {
    if (!allowed || !canWrite() || !store || busy.current || identity.current !== scope || state.scope !== scope || ['unknown', 'saved', 'savedRefresh', 'conflict', 'saving'].includes(state.outcome)) return;
    if (action === 'visibility' && !state.visibility || action === 'manager' && !state.access?.manager_revision) return;
    busy.current = true; setState(old => ({ ...old, outcome: 'saving' }));
    try {
      const result = action === 'visibility'
        ? await setStoreVisibility(store.id, input as StoreVisibilityScopes, state.visibility!.visibility_revision)
        : await setStoreManager(store.id, input as string | null, state.access!.manager_revision!);
      if (identity.current !== scope) return;
      const outcome = result.status === 'success' ? 'saved' : result.status === 'unknown' ? 'unknown' : result.status === 'conflict' ? 'conflict' : 'failed';
      setState(old => ({ ...old, outcome }));
      if (result.status === 'success') {
        await refetch();
        try { await refreshStore(store.id); } catch { if (identity.current === scope) setState(old => ({ ...old, outcome: 'savedRefresh' })); }
      }
    } catch { if (identity.current === scope) setState(old => ({ ...old, outcome: 'unknown' })); }
    finally { if (identity.current === scope) busy.current = false; }
  }
  return { ...(state.scope === scope ? state : { access: null, visibility: null, loading: true, error: '', outcome: '' }), allowed, refetch, save };
}

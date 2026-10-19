import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getStoreMembers } from '../services/storeMembers';
import type { StoreMember } from '../../types';
import { getErrorMessage } from '../utils/error';

export function useStoreMembers() {
  const { store, user } = useAuth();
  const scope = `${store?.id ?? ''}:${user?.id ?? ''}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const request = useRef(0);
  const [state, setState] = useState({ scope, members: [] as StoreMember[], loading: true, error: null as string | null });
  useEffect(() => () => { request.current++; }, []);
  const refetch = useCallback(async () => {
    const version = ++request.current;
    if (!store || !user) {
      setState({ scope, members: [], loading: false, error: null });
      return;
    }
    setState(prev => ({ scope, members: prev.scope === scope ? prev.members : [], loading: true, error: null }));
    try {
      const members = await getStoreMembers(store.id);
      if (version === request.current && scopeRef.current === scope) setState({ scope, members, loading: false, error: null });
    } catch (e: unknown) {
      if (version === request.current && scopeRef.current === scope) setState({ scope, members: [], loading: false, error: getErrorMessage(e, '멤버 목록을 불러오지 못했어요.') });
    }
  }, [store?.id, user?.id, scope]);
  return { members: state.scope === scope ? state.members : [], loading: state.scope !== scope || state.loading, error: state.scope === scope ? state.error : null, refetch };
}

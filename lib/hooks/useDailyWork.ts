import { useCallback, useEffect, useRef, useState } from 'react';
import { DailyWorkRecord } from '../../types';
import { getDailyWork } from '../services/dailyWork';
import { useAuth } from '../contexts/AuthContext';

export function useDailyWork(storeId: string, employeeId: string, month: string) {
  const { user, currentRole, devPreviewMode } = useAuth();
  const scope = `${user?.id}:${currentRole}:${devPreviewMode}:${storeId}:${employeeId}:${month}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const request = useRef(0);
  const [state, setState] = useState<{ scope: string; rows: DailyWorkRecord[]; loading: boolean; error: string | null }>({ scope: '', rows: [], loading: true, error: null });
  useEffect(() => () => { request.current++; currentScope.current = ''; }, []);
  const refetch = useCallback(async () => {
    const id = ++request.current;
    setState(old => ({ scope, rows: old.scope === scope ? old.rows : [], loading: true, error: null }));
    try {
      const rows = await getDailyWork(storeId, employeeId, month);
      if (id !== request.current || currentScope.current !== scope) return false;
      setState({ scope, rows, loading: false, error: null }); return true;
    } catch {
      if (id === request.current && currentScope.current === scope) setState(old => ({ scope, rows: old.scope === scope ? old.rows : [], loading: false, error: '일별 근무시간을 불러오지 못했어요. 다시 시도해 주세요.' }));
      return false;
    }
  }, [scope, storeId, employeeId, month]);
  useEffect(() => { void refetch(); }, [refetch]);
  return state.scope === scope ? { ...state, refetch } : { rows: [], loading: true, error: null, refetch };
}

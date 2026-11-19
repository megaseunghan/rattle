import { useCallback, useEffect, useRef, useState } from 'react';
import { getStoreWageHistory } from '../services/wageHistory';
import { WageHistory } from '../../types';

type HistoryMap = Record<string, WageHistory[]>;

/**
 * 매장 전체 급여 조건 이력을 직원별로 묶어 둔다.
 * 같은 매장 재조회(탭 재방문 등)는 기존 이력을 보여 둔 채 새로 받고, 매장·계정·권한 범위가 바뀌면 이전 이력을 즉시 숨긴다.
 */
export function useStoreWageHistory(storeId: string | undefined, accessScope = '') {
  const identity = JSON.stringify([storeId, accessScope]);
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const [state, setState] = useState<{ identity: string; map: HistoryMap; loaded: boolean }>({ identity, map: {}, loaded: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const request = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const current = state.identity === identity ? state : { identity, map: {}, loaded: false };

  useEffect(() => () => { request.current += 1; }, []);
  useEffect(() => { setError(false); setLoading(true); }, [identity]);

  const refetch = useCallback(async () => {
    const id = ++request.current;
    if (!storeId) { setState({ identity, map: {}, loaded: true }); setLoading(false); return; }
    const sameStore = stateRef.current.identity === identity && stateRef.current.loaded;
    if (!sameStore) { setState({ identity, map: {}, loaded: false }); setLoading(true); }
    setError(false);
    try {
      const rows = await getStoreWageHistory(storeId);
      if (id !== request.current || identityRef.current !== identity) return;
      const map: HistoryMap = {};
      for (const row of rows) (map[row.employee_id] ??= []).push(row);
      setState({ identity, map, loaded: true });
    } catch { if (id === request.current && identityRef.current === identity) setError(true); }
    finally { if (id === request.current && identityRef.current === identity) setLoading(false); }
  }, [storeId, identity]);

  return { map: current.map, loading: current.loaded ? false : loading, error, refetch };
}

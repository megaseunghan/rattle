import { useCallback, useEffect, useRef, useState } from 'react';
import { getStoreWageHistory } from '../services/wageHistory';
import { WageHistory } from '../../types';

type HistoryMap = Record<string, WageHistory[]>;

/**
 * 매장 전체 급여 조건 이력을 직원별로 묶어 둔다.
 * 같은 매장 재조회(탭 재방문 등)는 기존 이력을 보여 둔 채 새로 받고, 매장이 바뀌면 이전 매장 이력을 즉시 숨긴다.
 */
export function useStoreWageHistory(storeId: string | undefined) {
  const [state, setState] = useState<{ storeId: string | undefined; map: HistoryMap; loaded: boolean }>({ storeId, map: {}, loaded: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const request = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const current = state.storeId === storeId ? state : { storeId, map: {}, loaded: false };

  useEffect(() => () => { request.current += 1; }, []);
  useEffect(() => { setError(false); setLoading(true); }, [storeId]);

  const refetch = useCallback(async () => {
    const id = ++request.current;
    if (!storeId) { setState({ storeId, map: {}, loaded: true }); setLoading(false); return; }
    const sameStore = stateRef.current.storeId === storeId && stateRef.current.loaded;
    if (!sameStore) { setState({ storeId, map: {}, loaded: false }); setLoading(true); }
    setError(false);
    try {
      const rows = await getStoreWageHistory(storeId);
      if (id !== request.current) return;
      const map: HistoryMap = {};
      for (const row of rows) (map[row.employee_id] ??= []).push(row);
      setState({ storeId, map, loaded: true });
    } catch { if (id === request.current) setError(true); }
    finally { if (id === request.current) setLoading(false); }
  }, [storeId]);

  return { map: current.map, loading: current.loaded ? false : loading, error, refetch };
}

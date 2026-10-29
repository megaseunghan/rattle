import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PayrollWorkSubmission } from '../../types';
import { getPayrollSubmissions } from '../services/payrollSubmissions';

export function usePayrollSubmissions(yearMonth: string, employeeId?: string) {
  const { store, user } = useAuth();
  const storeId = store?.id;
  const scope = `${user?.id}:${storeId}:${yearMonth}:${employeeId}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const request = useRef(0);
  const [state, setState] = useState<{ scope: string; rows: PayrollWorkSubmission[]; loading: boolean; error: string | null }>({
    scope: '', rows: [], loading: false, error: null,
  });
  useEffect(() => () => { request.current += 1; }, []);
  const refetch = useCallback(async () => {
    const id = ++request.current;
    if (!storeId) return false;
    setState({ scope, rows: [], loading: true, error: null });
    try {
      const rows = await getPayrollSubmissions(storeId, yearMonth, employeeId);
      if (id === request.current && scope === scopeRef.current) setState({ scope, rows, loading: false, error: null });
      return id === request.current && scope === scopeRef.current;
    } catch {
      if (id === request.current && scope === scopeRef.current) setState({ scope, rows: [], loading: false,
        error: '근무시간 제출 내역을 불러오지 못했어요. 다시 시도해주세요.' });
      return false;
    }
  }, [storeId, yearMonth, employeeId, scope]);
  const visible = state.scope === scope;
  return { rows: visible ? state.rows : [], loading: visible ? state.loading : !!storeId,
    error: visible ? state.error : null, refetch };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getRecurringFixedExpenses, saveRecurringFixedExpense } from '../services/recurringFixedExpenses';
import { getErrorMessage, UserFacingError } from '../utils/error';
import type { RecurringFixedExpenseMonth, SaveRecurringFixedExpense } from '../types/recurringExpenses';

export function useRecurringFixedExpenses(yearMonth: string) {
  const { store, user, currentRole, devPreviewMode } = useAuth();
  const identity = `${user?.id ?? ''}:${store?.id ?? ''}:${currentRole}:${devPreviewMode}:${yearMonth}`;
  const scope = useRef(identity); scope.current = identity;
  const generation = useRef(0);
  const busy = useRef(false);
  const [snapshot, setSnapshot] = useState<{ identity: string; data: RecurringFixedExpenseMonth } | null>(null);
  const [state, setState] = useState({ identity, loading: true, error: null as string | null });
  const refetch = useCallback(async () => {
    if (!store || currentRole !== 'admin') return;
    const request = ++generation.current;
    const current = () => scope.current === identity && request === generation.current;
    setState({ identity, loading: true, error: null });
    try {
      const data = await getRecurringFixedExpenses(store.id, yearMonth);
      if (current()) { setSnapshot({ identity, data }); setState({ identity, loading: false, error: null }); }
    } catch (error) {
      if (current()) setState({ identity, loading: false, error: getErrorMessage(error) });
    }
  }, [store, currentRole, yearMonth, identity]);
  useEffect(() => { void refetch(); return () => { ++generation.current; }; }, [refetch]);
  const save = useCallback(async (input: SaveRecurringFixedExpense) => {
    if (!store || currentRole !== 'admin' || input.store_id !== store.id) throw new UserFacingError('관리자만 이 매장 일정을 변경할 수 있어요.');
    if (busy.current) throw new UserFacingError('저장 중입니다. 잠시 기다려주세요.');
    busy.current = true;
    try {
      const id = await saveRecurringFixedExpense(input);
      if (scope.current === identity) { ++generation.current; void refetch(); }
      return id;
    } finally { busy.current = false; }
  }, [store, currentRole, identity, refetch]);
  return { identity, data: snapshot?.identity === identity ? snapshot.data : null,
    loading: state.identity !== identity || state.loading, error: state.identity === identity ? state.error : null,
    refetch, save };
}

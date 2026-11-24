import { usePreviewWriteGuard } from './usePreviewWriteGuard';
import { getErrorMessage, UserFacingError } from '../utils/error';
import { useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { queryClient, queryKeys, useQueryScope } from '../query';
import { STALE_TIME } from '../query/staleTimes';
import { getExpensesByMonth, getEffectiveFixedExpenses, getLegacyEffectiveFixedExpenses, createExpense, updateExpense, deleteExpense, copyFixedExpensesWithDates } from '../services/expenses';
import { ExpenseCategory } from '../../types';
import { DatedExpense as Expense } from '../types/expenses';

interface MonthExpenses { expenses: Expense[]; carried: Expense[] }
const EMPTY: Expense[] = [];

/**
 * 월별 비용과 이월 고정비(5분 재사용). 저장·삭제·복사는 서비스의 매장 무효화로 다시 받는다.
 * 저장 직후 화면은 결과 행을 캐시에 바로 반영해, 무효화 응답이 오기 전에도 내 수정이 보이게 한다.
 */
export function useExpenses(yearMonth: string, active = true) {
  const { assertCanWrite } = usePreviewWriteGuard();
  const { store, canManageStore } = useAuth();
  const scope = useQueryScope();
  const storeId = store?.id;
  const key = useMemo(() => queryKeys.store(scope, storeId ?? '', 'expenses', yearMonth, canManageStore), [scope, storeId, yearMonth, canManageStore]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const mutationBusy = useRef(false);
  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<MonthExpenses> => {
      const expenses = await getExpensesByMonth(storeId!, yearMonth);
      const carried = expenses.some(e => e.category === '고정비') ? [] :
        (await (canManageStore ? getEffectiveFixedExpenses : getLegacyEffectiveFixedExpenses)(storeId!, yearMonth)).filter(e => e.year_month !== yearMonth);
      return { expenses, carried };
    },
    enabled: active && !!storeId, staleTime: STALE_TIME.entry,
  }, queryClient);
  const { refetch: refetchQuery } = query;

  /** 당겨서 새로고침·다시 시도 */
  const refetch = useCallback(async () => {
    if (!storeId) return;
    await refetchQuery();
  }, [storeId, refetchQuery]);

  /** 화면 전환 뒤 끝난 저장은 새 화면 캐시를 건드리지 않는다. */
  const applyLocal = useCallback((mutationKey: typeof key, change: (rows: Expense[]) => Expense[]) => {
    if (currentKey.current !== mutationKey) return;
    queryClient.setQueryData<MonthExpenses>(mutationKey, previous => previous ? { ...previous, expenses: change(previous.expenses) } : previous);
  }, []);

  const runExclusive = useCallback(async <T,>(work: () => Promise<T>): Promise<T> => {
    if (mutationBusy.current) throw new UserFacingError('저장 중입니다. 잠시 기다려주세요.');
    mutationBusy.current = true;
    try { return await work(); } finally { mutationBusy.current = false; }
  }, []);

  const add = useCallback(async (data: {
    category: ExpenseCategory;
    name: string;
    amount: number;
    occurred_on: string;
  }) => {
    assertCanWrite();
    if (!store) throw new UserFacingError('매장 정보가 없습니다');
    const mutationKey = key;
    return runExclusive(async () => {
      const created = await createExpense({ ...data, store_id: store.id, year_month: data.occurred_on.slice(0, 7) });
      applyLocal(mutationKey, rows => created.year_month === yearMonth ? [...rows.filter(e => e.id !== created.id), created] : rows);
      return created;
    });
  }, [store, yearMonth, key, assertCanWrite, applyLocal, runExclusive]);

  const update = useCallback(async (id: string, data: { name: string; amount: number; occurred_on?: string }) => {
    assertCanWrite();
    const mutationKey = key;
    return runExclusive(async () => {
      const updated = await updateExpense(id, data);
      applyLocal(mutationKey, rows => rows.map(e => (e.id === id ? updated : e)).filter(e => e.year_month === yearMonth));
      return updated;
    });
  }, [yearMonth, key, assertCanWrite, applyLocal, runExclusive]);

  const remove = useCallback(async (id: string) => {
    assertCanWrite();
    const mutationKey = key;
    await runExclusive(async () => {
      await deleteExpense(id);
      applyLocal(mutationKey, rows => rows.filter(e => e.id !== id));
    });
  }, [key, assertCanWrite, applyLocal, runExclusive]);

  const copyCarriedFixedExpenses = useCallback(async (dates: { id: string; occurred_on: string }[]) => {
    assertCanWrite();
    if (!store) throw new UserFacingError('매장 정보가 없습니다');
    // 서비스가 매장 무효화로 복사 결과를 다시 받는다. 부분 결과를 화면에 미리 붙이지 않는다.
    await runExclusive(() => copyFixedExpensesWithDates(store.id, yearMonth, dates));
  }, [store, yearMonth, assertCanWrite, runExclusive]);

  const data = storeId ? query.data : undefined;
  return { expenses: data?.expenses ?? EMPTY, carriedFixedExpenses: data?.carried ?? EMPTY,
    loading: !!storeId && query.isPending && !query.isError, error: storeId && query.isError ? getErrorMessage(query.error) : null,
    refetch, add, update, remove, copyCarriedFixedExpenses };
}

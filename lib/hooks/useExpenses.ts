import { getErrorMessage, UserFacingError } from '../utils/error';
import { useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getExpensesByMonth, getEffectiveFixedExpenses, getLegacyEffectiveFixedExpenses, createExpense, updateExpense, deleteExpense, copyFixedExpensesWithDates } from '../services/expenses';
import { ExpenseCategory } from '../../types';
import { DatedExpense as Expense } from '../types/expenses';

export function useExpenses(yearMonth: string) {
  const { store, user, currentRole, devPreviewMode } = useAuth();
  const identity = `${user?.id ?? ''}:${store?.id ?? ''}:${currentRole}:${devPreviewMode}:${yearMonth}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const requestVersion = useRef(0);
  const [dataIdentity, setDataIdentity] = useState('');
  const mutationBusy = useRef(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [carriedFixedExpenses, setCarriedFixedExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!store) return;
    const version = ++requestVersion.current;
    const current = () => currentIdentity.current === identity && requestVersion.current === version;
    setLoading(true);
    setError(null);
    try {
      const result = await getExpensesByMonth(store.id, yearMonth);
      if (!current()) return;
      const carried = result.some(e => e.category === '고정비') ? [] :
        (await (currentRole === 'admin' ? getEffectiveFixedExpenses : getLegacyEffectiveFixedExpenses)(store.id, yearMonth)).filter(e => e.year_month !== yearMonth);
      if (!current()) return;
      setExpenses(result);
      setCarriedFixedExpenses(carried);
      setDataIdentity(identity);
    } catch (e: any) {
      if (current()) setError(getErrorMessage(e));
    } finally {
      if (current()) setLoading(false);
    }
  }, [store, yearMonth, identity]);

  const add = useCallback(async (data: {
    category: ExpenseCategory;
    name: string;
    amount: number;
    occurred_on: string;
  }) => {
    if (!store) throw new UserFacingError('매장 정보가 없습니다');
    if (mutationBusy.current) throw new UserFacingError('저장 중입니다. 잠시 기다려주세요.');
    mutationBusy.current = true;
    try {
      const created = await createExpense({ ...data, store_id: store.id, year_month: data.occurred_on.slice(0, 7) });
      if (currentIdentity.current !== identity) return created;
      ++requestVersion.current;
      setExpenses(prev => created.year_month === yearMonth ? [...prev.filter(e => e.id !== created.id), created] : prev);
      void refetch();
      return created;
    } finally { mutationBusy.current = false; }
  }, [store, yearMonth, identity, refetch]);

  const update = useCallback(async (id: string, data: { name: string; amount: number; occurred_on?: string }) => {
    if (mutationBusy.current) throw new UserFacingError('저장 중입니다. 잠시 기다려주세요.');
    mutationBusy.current = true;
    try {
      const updated = await updateExpense(id, data);
      if (currentIdentity.current !== identity) return updated;
      ++requestVersion.current;
      setExpenses(prev => prev.map(e => (e.id === id ? updated : e)).filter(e => e.year_month === yearMonth));
      void refetch();
      return updated;
    } finally { mutationBusy.current = false; }
  }, [identity, yearMonth, refetch]);

  const remove = useCallback(async (id: string) => {
    if (mutationBusy.current) throw new UserFacingError('저장 중입니다. 잠시 기다려주세요.');
    mutationBusy.current = true;
    try {
      await deleteExpense(id);
      if (currentIdentity.current !== identity) return;
      ++requestVersion.current;
      setExpenses(prev => prev.filter(e => e.id !== id));
      void refetch();
    } finally { mutationBusy.current = false; }
  }, [identity, yearMonth, refetch]);

  const copyCarriedFixedExpenses = useCallback(async (dates: { id: string; occurred_on: string }[]) => {
    if (!store) throw new UserFacingError('매장 정보가 없습니다');
    if (mutationBusy.current) throw new UserFacingError('저장 중입니다. 잠시 기다려주세요.');
    mutationBusy.current = true;
    try {
      await copyFixedExpensesWithDates(store.id, yearMonth, dates);
      if (currentIdentity.current === identity) { ++requestVersion.current; void refetch(); }
    } finally { mutationBusy.current = false; }
  }, [store, yearMonth, identity, refetch]);


  return { expenses: dataIdentity === identity ? expenses : [], carriedFixedExpenses: dataIdentity === identity ? carriedFixedExpenses : [], loading, error, refetch, add, update, remove, copyCarriedFixedExpenses };
}

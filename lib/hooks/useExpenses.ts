import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getExpensesByMonth, createExpense, updateExpense, deleteExpense } from '../services/expenses';
import { Expense, ExpenseCategory } from '../../types';

export function useExpenses(yearMonth: string) {
  const { store } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getExpensesByMonth(store.id, yearMonth);
      setExpenses(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [store, yearMonth]);

  const add = useCallback(async (data: {
    category: ExpenseCategory;
    name: string;
    amount: number;
  }) => {
    if (!store) throw new Error('매장 정보가 없습니다');
    const created = await createExpense({ ...data, store_id: store.id, year_month: yearMonth });
    setExpenses(prev => [...prev, created]);
    return created;
  }, [store, yearMonth]);

  const update = useCallback(async (id: string, data: { name: string; amount: number }) => {
    const updated = await updateExpense(id, data);
    setExpenses(prev => prev.map(e => (e.id === id ? updated : e)));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteExpense(id);
    setExpenses(prev => prev.filter(e => e.id !== id));
  }, []);

  return { expenses, loading, error, refetch, add, update, remove };
}

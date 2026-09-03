import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getExpensesByMonth, getEffectiveFixedExpenses, createExpense, updateExpense, deleteExpense } from '../services/expenses';
import { Expense, ExpenseCategory } from '../../types';

export function useExpenses(yearMonth: string) {
  const { store } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [carriedFixedExpenses, setCarriedFixedExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getExpensesByMonth(store.id, yearMonth);
      setExpenses(result);

      // 이번 달에 직접 등록된 고정비가 없으면, 손익계산서에 반영 중인
      // 이전 달 고정비(carry-forward)를 참고용으로 함께 보여준다.
      const hasOwnFixed = result.some(e => e.category === '고정비');
      if (hasOwnFixed) {
        setCarriedFixedExpenses([]);
      } else {
        const carried = await getEffectiveFixedExpenses(store.id, yearMonth);
        setCarriedFixedExpenses(carried.filter(e => e.year_month !== yearMonth));
      }
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
    if (data.category === '고정비') setCarriedFixedExpenses([]);
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

  // 이어받은 고정비를 이번 달 항목으로 그대로 등록(복사)한다.
  const copyCarriedFixedExpenses = useCallback(async () => {
    if (!store || carriedFixedExpenses.length === 0) return;
    const created = await Promise.all(
      carriedFixedExpenses.map(e =>
        createExpense({ store_id: store.id, year_month: yearMonth, category: e.category, name: e.name, amount: e.amount }),
      ),
    );
    setExpenses(prev => [...prev, ...created]);
    setCarriedFixedExpenses([]);
  }, [store, yearMonth, carriedFixedExpenses]);

  return { expenses, carriedFixedExpenses, loading, error, refetch, add, update, remove, copyCarriedFixedExpenses };
}

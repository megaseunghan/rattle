import { readAllRows } from './readAllRows';
import { invalidateCachedStore } from './cacheInvalidation';
import { supabase } from '../supabase';
import { Expense, ExpenseCategory } from '../../types';

export async function getExpensesByMonth(
  storeId: string,
  yearMonth: string, // 'YYYY-MM'
): Promise<Expense[]> {
  const data = await readAllRows((start, end) => supabase
    .from('expenses')
    .select('*')
    .eq('store_id', storeId)
    .eq('year_month', yearMonth)
    .order('created_at', { ascending: true }).order('id').range(start, end));

  return (data ?? []) as Expense[];
}

/**
 * 손익 반영용 "유효 고정비": 해당 월에 등록된 고정비가 있으면 그대로,
 * 없으면 직전 가장 최근 등록 월의 고정비를 이어받는다(carry-forward).
 * 최초 등록 월 이전에는 더 과거 데이터가 없어 자동으로 [] (= 이전 달 미반영).
 */
export async function getEffectiveFixedExpenses(
  storeId: string,
  yearMonth: string,
): Promise<Expense[]> {
  // 먼저 적용할 최근 월 하나를 찾고, 그 월의 고정비를 빠짐없이 읽는다.
  const { data, error } = await supabase.from('expenses').select('year_month')
    .eq('store_id', storeId).eq('category', '고정비').lte('year_month', yearMonth)
    .order('year_month', { ascending: false }).limit(1);
  if (error) throw error;
  if (!data?.length) return [];
  return await readAllRows((start, end) => supabase.from('expenses').select('*')
    .eq('store_id', storeId).eq('category', '고정비').eq('year_month', data[0].year_month)
    .order('id').range(start, end)) as Expense[];
}

export async function createExpense(data: {
  store_id: string;
  year_month: string;
  category: ExpenseCategory;
  name: string;
  amount: number;
}): Promise<Expense> {
  const { data: row, error } = await supabase
    .from('expenses')
    .insert(data)
    .select()
    .single();

  if (error) throw new Error(error.message);
  await invalidateCachedStore(data.store_id);
  return row as Expense;
}

export async function updateExpense(
  id: string,
  data: { name: string; amount: number },
): Promise<Expense> {
  const { data: row, error } = await supabase
    .from('expenses')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  await invalidateCachedStore();
  return row as Expense;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw new Error(error.message);
  await invalidateCachedStore();
}

export async function getExpensesTotalByMonth(
  storeId: string,
  yearMonth: string,
): Promise<{ fixedExpense: number; variableExpense: number }> {
  const items = await getExpensesByMonth(storeId, yearMonth);
  const VARIABLE_CATEGORIES: ExpenseCategory[] = ['마케팅', '시설보수', '공과금'];
  const fixedExpense = items
    .filter(e => e.category === '고정비')
    .reduce((s, e) => s + e.amount, 0);
  const variableExpense = items
    .filter(e => VARIABLE_CATEGORIES.includes(e.category))
    .reduce((s, e) => s + e.amount, 0);
  return { fixedExpense, variableExpense };
}

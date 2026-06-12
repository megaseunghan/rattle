import { supabase } from '../supabase';
import { Expense, ExpenseCategory } from '../../types';

export async function getExpensesByMonth(
  storeId: string,
  yearMonth: string, // 'YYYY-MM'
): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('store_id', storeId)
    .eq('year_month', yearMonth)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Expense[];
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
  return row as Expense;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw new Error(error.message);
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

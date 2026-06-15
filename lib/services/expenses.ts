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

/**
 * 손익 반영용 "유효 고정비": 해당 월에 등록된 고정비가 있으면 그대로,
 * 없으면 직전 가장 최근 등록 월의 고정비를 이어받는다(carry-forward).
 * 최초 등록 월 이전에는 더 과거 데이터가 없어 자동으로 [] (= 이전 달 미반영).
 */
export async function getEffectiveFixedExpenses(
  storeId: string,
  yearMonth: string,
): Promise<Expense[]> {
  // 1. 해당 월에 직접 등록된 고정비
  const { data: current, error: curErr } = await supabase
    .from('expenses')
    .select('*')
    .eq('store_id', storeId)
    .eq('year_month', yearMonth)
    .eq('category', '고정비');
  if (curErr) throw new Error(curErr.message);
  if (current && current.length > 0) return current as Expense[];

  // 2. 직전 가장 최근 등록 월의 고정비를 이어받음
  const { data: prev, error: prevErr } = await supabase
    .from('expenses')
    .select('*')
    .eq('store_id', storeId)
    .eq('category', '고정비')
    .lt('year_month', yearMonth)
    .order('year_month', { ascending: false });
  if (prevErr) throw new Error(prevErr.message);

  const rows = (prev ?? []) as Expense[];
  if (rows.length === 0) return [];
  const latestMonth = rows[0].year_month;
  return rows.filter(r => r.year_month === latestMonth);
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

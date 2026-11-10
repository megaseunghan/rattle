import { readAllRows } from './readAllRows';
import { getEffectiveExpenseRows } from './recurringFixedExpenses';
import { invalidateCachedStore } from './cacheInvalidation';
import { supabase } from '../supabase';
import { ExpenseCategory } from '../../types';
import { DatedExpense as Expense } from '../types/expenses';
import { UserFacingError } from '../utils/error';
import { validateExpenseDate, validateExpenseAmount } from '../utils/expenseDate';

function expenseWriteError(message: string): Error {
  if (message.includes('RECURRING_EXPENSE_SOURCE_LOCKED')) {
    return new UserFacingError('반복 일정에 연결된 원본은 월 이동·분류 변경·삭제할 수 없어요. 반복 일정에서 변경해주세요.');
  }
  return new Error(message);
}

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
export async function getLegacyEffectiveFixedExpenses(
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

/** Canonical admin month: legacy carry with adopted sources excluded, plus recurring occurrences. */
export async function getEffectiveFixedExpenses(storeId: string, yearMonth: string): Promise<Expense[]> {
  const rows = await getEffectiveExpenseRows(storeId, yearMonth);
  return rows.filter(row => row.category === '고정비').map(row => ({
    id: row.id, store_id: storeId, year_month: row.original_year_month,
    category: row.category, name: row.name, amount: row.amount, occurred_on: row.occurred_on,
    // Projection has no creation timestamp. This field is not used for occurrence/cost calculations.
    created_at: '',
  }));
}

export async function createExpense(data: {
  store_id: string;
  year_month: string;
  occurred_on: string;
  category: ExpenseCategory;
  name: string;
  amount: number;
}): Promise<Expense> {
  validateExpenseDate(data.occurred_on);
  validateExpenseAmount(data.name, data.amount);
  if (data.year_month !== data.occurred_on.slice(0, 7)) throw new UserFacingError('발생일과 등록 월이 다릅니다.');
  if (!['마케팅', '고정비', '시설보수', '공과금'].includes(data.category)) throw new UserFacingError('비용 분류를 확인해주세요.');
  const { data: row, error } = await supabase
    .from('expenses')
    .insert(data)
    .select()
    .single();

  if (error) throw expenseWriteError(error.message);
  await invalidateCachedStore(data.store_id);
  return row as Expense;
}

export async function updateExpense(
  id: string,
  data: { name: string; amount: number; occurred_on?: string },
): Promise<Expense> {
  validateExpenseAmount(data.name, data.amount);
  if (data.occurred_on !== undefined) validateExpenseDate(data.occurred_on);
  const { data: row, error } = await supabase
    .from('expenses')
    .update({ ...data, ...(data.occurred_on ? { year_month: data.occurred_on.slice(0, 7) } : {}) })
    .eq('id', id)
    .select()
    .single();

  if (error) throw expenseWriteError(error.message);
  await invalidateCachedStore();
  return row as Expense;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw expenseWriteError(error.message);
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

/** Whole carried set, explicit dates, one transaction. No inferred day or partial copies. */
export async function copyFixedExpensesWithDates(storeId: string, yearMonth: string, dates: { id: string; occurred_on: string }[]): Promise<void> {
  if (!dates.length) throw new UserFacingError('복사할 고정비가 없습니다.');
  for (const row of dates) {
    validateExpenseDate(row.occurred_on);
    if (row.occurred_on.slice(0, 7) !== yearMonth) throw new UserFacingError('선택한 월의 발생일을 입력해주세요.');
  }
  const { error } = await supabase.rpc('copy_fixed_expenses_with_dates', { p_store_id: storeId, p_year_month: yearMonth, p_dates: dates });
  if (error) {
    if (error.message.includes('FIXED_EXPENSES_ALREADY_EXIST')) throw new UserFacingError('이번 달 고정비가 이미 등록됐어요. 목록을 새로고침해주세요.');
    if (error.message.includes('FIXED_COPY_INVALID')) throw new UserFacingError('고정비 항목이 변경됐어요. 다시 불러와 모든 발생일을 확인해주세요.');
    throw error;
  }
  await invalidateCachedStore(storeId);
}

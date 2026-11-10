import { supabase } from '../supabase';
import type { RecurringFixedExpenseOccurrence } from '../types/recurringExpenses';

export interface DailyExpenseSeries {
  yearMonth: string;
  availability: 'complete' | 'partial';
  monthlyTotal: number;
  unallocatedAmount: number;
  unallocatedCount: number;
  carriedFixedAmount: number;
  recurringTotal: number;
  scheduledTotal: number;
  incurredKnownTotal: number;
  occurrences: RecurringFixedExpenseOccurrence[];
  days: { date: string; amount: number | null; knownAmount: number; cumulativeAmount: number | null; knownCumulativeAmount: number }[];
}

/** Admin RPC. Input dates are KST occurrence labels, not timestamps/business closing times.
 * Includes effective fixed + variable entries. Excludes automatic card fees (00 adds once).
 * Full calendar month; caller clips comparison to min(today's day, days in previous month).
 * On error throw: never substitute an empty/zero series. */
export async function getDailyExpenseSeries(storeId: string, yearMonth: string): Promise<DailyExpenseSeries> {
  if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(yearMonth) || yearMonth.startsWith('0000')) throw new Error('INVALID_YEAR_MONTH');
  const { data, error } = await supabase.rpc('get_daily_expense_series', { p_store_id: storeId, p_year_month: yearMonth });
  if (error) throw error;
  if (!data) throw new Error('EMPTY_DAILY_EXPENSE_SERIES');
  return data as DailyExpenseSeries;
}

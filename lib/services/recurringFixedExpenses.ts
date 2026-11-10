import { supabase } from '../supabase';
import { invalidateCachedStore } from './cacheInvalidation';
import { UserFacingError } from '../utils/error';
import { validateExpenseMonth, validateRecurringExpense } from '../utils/recurringExpense';
import type { EffectiveExpenseRow, RecurringFixedExpenseMonth, SaveRecurringFixedExpense } from '../types/recurringExpenses';

export async function getRecurringFixedExpenses(storeId: string, yearMonth: string): Promise<RecurringFixedExpenseMonth> {
  validateExpenseMonth(yearMonth);
  const { data, error } = await supabase.rpc('get_recurring_fixed_expenses', { p_store_id: storeId, p_year_month: yearMonth });
  if (error) throw error;
  if (!data) throw new Error('EMPTY_RECURRING_EXPENSES');
  return data as RecurringFixedExpenseMonth;
}

export async function getEffectiveExpenseRows(storeId: string, yearMonth: string): Promise<EffectiveExpenseRow[]> {
  validateExpenseMonth(yearMonth);
  const { data, error } = await supabase.rpc('get_effective_expense_rows', { p_store_id: storeId, p_year_month: yearMonth });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('EMPTY_EFFECTIVE_EXPENSES');
  return data as EffectiveExpenseRow[];
}

/** Rule UUID remains stable through uncertain responses/retries. Mutations append immutable versions. */
export async function saveRecurringFixedExpense(input: SaveRecurringFixedExpense): Promise<string> {
  validateRecurringExpense(input);
  const { data, error } = await supabase.rpc('save_recurring_fixed_expense', {
    p_rule_id: input.rule_id, p_store_id: input.store_id, p_effective_month: input.effective_month,
    p_name: input.name.trim(), p_amount: input.amount, p_payment_day: input.payment_day,
    p_active: input.active, p_end_month: input.end_month, p_source_expense_id: input.source_expense_id,
    p_expected_revision: input.expected_revision,
  });
  if (error) {
    const messages: Record<string, string> = {
      RECURRING_EXPENSE_VERSION_CONFLICT: '다른 화면에서 일정이 변경됐어요. 다시 불러온 뒤 수정해주세요.',
      RECURRING_EXPENSE_SOURCE_LOCKED: '반복 일정에 연결된 원본은 월 이동·삭제할 수 없어요. 반복 일정에서 변경해주세요.',
      RECURRING_EXPENSE_SOURCE_CONFLICT: '이미 반복 일정에 연결된 비용이에요. 기존 일정을 확인해주세요.',
      RECURRING_EXPENSE_SOURCE_INVALID: '같은 매장의 기존 고정비를 선택하고, 원본 월 다음 달부터 적용해주세요.',
      RECURRING_EXPENSE_NO_BACKDATE: '새 일정은 이번 달부터, 일정 변경은 다음 달부터 적용할 수 있어요.',
      RECURRING_EXPENSE_FUTURE_CHANGE_REQUIRED: '일정 변경은 다음 달부터 적용할 수 있어요. 과거 월은 유지됩니다.',
      RECURRING_EXPENSE_IDENTITY_CHANGED: '다른 일정 또는 매장 정보로 바뀌었어요. 목록을 다시 불러와주세요.',
      RECURRING_EXPENSE_INVALID: '이름·금액·결제일·적용/종료 월을 확인해주세요.',
    };
    for (const [code, message] of Object.entries(messages)) {
      if (error.message.includes(code)) throw new UserFacingError(message);
    }
    throw error;
  }
  if (typeof data !== 'string') throw new Error('EMPTY_RECURRING_EXPENSE_SAVE');
  // All months: revisions also affect carry-forward and aggregate/multi-store queries.
  await invalidateCachedStore(input.store_id);
  return data;
}

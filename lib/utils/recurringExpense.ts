import { UserFacingError } from './error';
import { validateExpenseAmount } from './expenseDate';
import type { SaveRecurringFixedExpense } from '../types/recurringExpenses';

export function validateExpenseMonth(month: string): string {
  if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month) || month.startsWith('0000')) {
    throw new UserFacingError('적용 월을 YYYY-MM 형식으로 입력해주세요.');
  }
  return month;
}

export function koreaExpenseMonth(asOf = new Date()): string {
  return new Date(asOf.getTime() + 9 * 3600000).toISOString().slice(0, 7);
}

export function nextExpenseMonth(month: string): string {
  validateExpenseMonth(month);
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const result = date.toISOString().slice(0, 7);
  return validateExpenseMonth(result);
}

/** Preview only; server applies the same month-end rule and validates again. */
export function recurringExpenseDate(month: string, day: number): string {
  validateExpenseMonth(month);
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new UserFacingError('매월 결제일은 1~31 사이 정수로 입력해주세요.');
  const last = new Date(`${month}-01T00:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  return `${month}-${String(Math.min(day, last.getUTCDate())).padStart(2, '0')}`;
}

export function validateRecurringExpense(input: SaveRecurringFixedExpense): void {
  validateExpenseAmount(input.name, input.amount);
  recurringExpenseDate(input.effective_month, input.payment_day);
  if (input.end_month) {
    validateExpenseMonth(input.end_month);
    if (input.end_month < input.effective_month) throw new UserFacingError('종료 월은 적용 월 이후로 지정해주세요.');
  }
}

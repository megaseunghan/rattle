import { UserFacingError } from './error';

export function validateExpenseDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0, 4) === '0000') {
    throw new UserFacingError('발생일을 YYYY-MM-DD 형식으로 입력해주세요.');
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new UserFacingError('실제로 존재하는 발생일을 입력해주세요.');
  }
  return value;
}

export function validateExpenseAmount(name: string, amount: number) {
  if (!name.trim() || !Number.isFinite(amount) || amount <= 0) {
    throw new UserFacingError('항목명과 0보다 큰 유한한 금액을 입력해주세요.');
  }
}

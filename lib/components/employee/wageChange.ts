/* design-system: DESIGN.md — 직원 정보(S05) 시급·월급 '바꾸기'의 적용일 계산(순수 함수). */
import { addDays, addMonthsInclusiveEnd, isIsoDate } from '../../payroll';
import { STORE_LAST_DAY } from '../../../types';

export type WageChangeFrom = 'today' | 'next';

function lastDayOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * 다음 급여 기간 시작일(오늘보다 뒤인 가장 가까운 날).
 * - 매장 급여 마감일(stores.payroll_close_day)이 있으면 그 다음 날. 0(말일)이나 그달에 없는 날이면 그달 말일 다음 날.
 * - 마감일이 없으면 다음 달 1일.
 */
export function nextPayPeriodStart(today: string, closeDay: number | null | undefined): string {
  const [year, month] = today.split('-').map(Number);
  if (closeDay == null || closeDay === STORE_LAST_DAY || !Number.isInteger(closeDay) || closeDay < 0) {
    return addDays(addMonthsInclusiveEnd(`${year}-${String(month).padStart(2, '0')}-01`, 1), 1);
  }
  const closeOf = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-${String(Math.min(closeDay, lastDayOf(y, m))).padStart(2, '0')}`;
  const thisClose = closeOf(year, month);
  if (today <= thisClose) return addDays(thisClose, 1);
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  return addDays(closeOf(next.y, next.m), 1);
}

/** 바꾼 급여를 적용할 날. 입사 전이면 입사일부터. */
export function wageChangeDate(from: WageChangeFrom, today: string, closeDay: number | null | undefined, joinedAt: string | null): string {
  const date = from === 'today' ? today : nextPayPeriodStart(today, closeDay);
  return joinedAt && isIsoDate(joinedAt) && date < joinedAt ? joinedAt : date;
}

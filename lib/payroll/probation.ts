import type { Employee } from '../../types';
import { addDays, addMonthsInclusiveEnd, monthDates } from './period';

/** 수습 중 지급 비율. 수습 감액은 사장님이 수습으로 표시한 직원에게만 적용한다. */
export const PROBATION_RATE = 0.9;
/** 직접 정하는 수습 기간의 최대 일수(최저임금법 시행령 3조의 3개월 범위 안). */
export const MAX_PROBATION_DAYS = 90;

export type ProbationEmployee = Pick<Employee, 'is_probation' | 'probation_started_at' | 'joined_at'>
  & { probation_ends_on?: string | null };

export type ProbationPeriod = { kind: 'none' } | { kind: 'months'; months: 1 | 2 | 3 } | { kind: 'days'; days: number };

/** 수습 시작일과 기간으로 마지막 날(포함)을 구한다. 기간이 없으면 null. */
export function probationEndDate(start: string, period: ProbationPeriod): string | null {
  if (period.kind === 'none') return null;
  if (period.kind === 'months') return addMonthsInclusiveEnd(start, period.months);
  if (!Number.isInteger(period.days) || period.days < 1 || period.days > MAX_PROBATION_DAYS) {
    throw new Error('INVALID_PROBATION_DAYS');
  }
  return addDays(start, period.days - 1);
}

/** 계산 대상 날짜가 수습 기간 안인지. 오늘 날짜가 아니라 대상 날짜로 판단한다. */
export function isProbationOn(employee: ProbationEmployee, date: string): boolean {
  if (!employee.is_probation || !employee.probation_ends_on) return false;
  const start = employee.probation_started_at ?? employee.joined_at;
  if (!start) return false;
  return start <= date && date <= employee.probation_ends_on;
}

export function probationFactorOn(employee: ProbationEmployee, date: string): number {
  return isProbationOn(employee, date) ? PROBATION_RATE : 1;
}

/** 월 단위 계수: 달력 일수 중 수습일 비율로 가중 평균한다(반올림하지 않아 서버 일할 계산과 같다). */
export function monthProbationFactor(employee: ProbationEmployee, yearMonth: string): number {
  const dates = monthDates(yearMonth);
  const probationDays = dates.filter(date => isProbationOn(employee, date)).length;
  return (dates.length - probationDays * (1 - PROBATION_RATE)) / dates.length;
}

export function hasProbationInMonth(employee: ProbationEmployee, yearMonth: string): boolean {
  return monthDates(yearMonth).some(date => isProbationOn(employee, date));
}

import type { Employee } from '../../types';
import { addMonthsInclusiveEnd, monthDates } from './period';

/**
 * 수습 중 지급 비율의 기본값(매장 기본값이 없을 때). 2026-11-27 사용자 결정으로 매장 기본값과 직원별 비율을 따로 둔다.
 * 직원 비율은 DB가 저장 시점에 매장 기본값으로 채운다(이후 매장 기본값을 바꿔도 기존 직원은 그대로).
 */
export const DEFAULT_PROBATION_RATE = 0.9;
/** @deprecated DEFAULT_PROBATION_RATE를 쓴다. */
export const PROBATION_RATE = DEFAULT_PROBATION_RATE;
/** 최저임금법 시행령 3조: 수습 중에도 최저임금의 90%보다 적게 줄 수 없다(앱은 막지 않고 안내만). */
export const PROBATION_MINIMUM_WAGE_FLOOR = 0.9;
/** 수습 기간 최대 개월 수(최저임금법 시행령 3조: 수습 시작일부터 3개월 이내). 일수가 아니라 달력 개월로 센다(89~92일). */
export const MAX_PROBATION_MONTHS = 3;

export type ProbationEmployee = Pick<Employee, 'is_probation' | 'probation_started_at' | 'joined_at'>
  & { probation_ends_on?: string | null; probation_rate?: number | string | null };

/** 직원에게 적용할 수습 비율(0 초과 1 이하). 없거나 이상한 값이면 기본 90%. */
export function probationRateOf(employee: Pick<ProbationEmployee, 'probation_rate'>): number {
  const rate = Number(employee.probation_rate);
  return employee.probation_rate != null && Number.isFinite(rate) && rate > 0 && rate <= 1 ? rate : DEFAULT_PROBATION_RATE;
}

/** 매장 기본 수습 기간: 없음 / 1·2·3개월(2026-11-27 결정, 일 단위 직접 정하기 없음). */
export type ProbationPeriod = { kind: 'none' } | { kind: 'months'; months: 1 | 2 | 3 };

/** 수습 시작일과 기간으로 마지막 날(포함)을 구한다. 기간이 없으면 null. */
export function probationEndDate(start: string, period: ProbationPeriod): string | null {
  if (period.kind === 'none') return null;
  return addMonthsInclusiveEnd(start, period.months);
}

/** 고를 수 있는 수습 마지막 날의 최댓값: 시작일 + 3개월로 계산한 마지막 날(서버 private.probation_max_end와 같다). */
export function maxProbationEnd(start: string): string {
  return addMonthsInclusiveEnd(start, MAX_PROBATION_MONTHS);
}

/** 계산 대상 날짜가 수습 기간 안인지. 오늘 날짜가 아니라 대상 날짜로 판단한다. */
export function isProbationOn(employee: ProbationEmployee, date: string): boolean {
  if (!employee.is_probation || !employee.probation_ends_on) return false;
  const start = employee.probation_started_at ?? employee.joined_at;
  if (!start) return false;
  return start <= date && date <= employee.probation_ends_on;
}

export function probationFactorOn(employee: ProbationEmployee, date: string): number {
  return isProbationOn(employee, date) ? probationRateOf(employee) : 1;
}

/** 월 단위 계수: 달력 일수 중 수습일 비율로 가중 평균한다(반올림하지 않아 서버 일할 계산과 같다). */
export function monthProbationFactor(employee: ProbationEmployee, yearMonth: string): number {
  const dates = monthDates(yearMonth);
  const probationDays = dates.filter(date => isProbationOn(employee, date)).length;
  return (dates.length - probationDays * (1 - probationRateOf(employee))) / dates.length;
}

export function hasProbationInMonth(employee: ProbationEmployee, yearMonth: string): boolean {
  return monthDates(yearMonth).some(date => isProbationOn(employee, date));
}

/* design-system: DESIGN.md — 합류 승인·직원 정보의 수습 시트 계산(순수 함수). 3개월은 90일이 아니라 lib/payroll의 달력 개월 계산을 쓴다. */
import {
  addDays, addMonthsInclusiveEnd, DEFAULT_PROBATION_RATE, isBelowProbationFloor, isIsoDate,
  maxProbationEnd, minimumWageFor, PayrollStandardMissingError,
} from '../../payroll';

export type ProbationMonths = 1 | 2 | 3;
export const PROBATION_QUICK_MONTHS: readonly ProbationMonths[] = [1, 2, 3];

/** 시트가 다루는 값. rate는 1~100 사이 %를 문자열로 둔다(입력 중). */
export interface ProbationDraft {
  isProbation: boolean;
  endsOn: string;
  ratePercent: string;
}

/** 입사일부터 n개월의 마지막 날(N개월 뒤 같은 날 하루 전, 없는 날이면 그달 말일). */
export function probationQuickEnd(joinedAt: string, months: ProbationMonths): string {
  return addMonthsInclusiveEnd(joinedAt, months);
}

/** 매장 기본 기간으로 계산한 첫 마지막 날. 매장 기본이 없으면 3개월 끝. */
export function defaultProbationEnd(joinedAt: string, storeMonths: ProbationMonths | null | undefined): string {
  return storeMonths ? probationQuickEnd(joinedAt, storeMonths) : maxProbationEnd(joinedAt);
}

/** 고를 수 있는 범위(입사일 ~ 3개월 끝) 안으로 맞춘다. */
export function clampProbationEnd(endsOn: string, joinedAt: string): string {
  const max = maxProbationEnd(joinedAt);
  if (!isIsoDate(endsOn) || endsOn > max) return max;
  return endsOn < joinedAt ? joinedAt : endsOn;
}

/** 입사일부터 마지막 날까지 일수(양 끝 포함). */
export function probationSpanDays(joinedAt: string, endsOn: string): number {
  const start = Date.UTC(+joinedAt.slice(0, 4), +joinedAt.slice(5, 7) - 1, +joinedAt.slice(8, 10));
  const end = Date.UTC(+endsOn.slice(0, 4), +endsOn.slice(5, 7) - 1, +endsOn.slice(8, 10));
  return Math.round((end - start) / 86_400_000) + 1;
}

/** 비율(0~1)을 화면 %로. 매장 기본이 없으면 90. */
export function ratePercentOf(rate: number | string | null | undefined): string {
  const value = Number(rate);
  const safe = rate != null && Number.isFinite(value) && value > 0 && value <= 1 ? value : DEFAULT_PROBATION_RATE;
  return String(Math.round(safe * 1000) / 10);
}

/** 입력한 %를 비율로. 1~100(소수 한 자리까지)이 아니면 null. */
export function parseRatePercent(text: string): number | null {
  const cleaned = text.trim();
  if (!/^\d{1,3}(\.\d)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value >= 1 && value <= 100 ? Math.round(value * 10) / 1000 : null;
}

export function isStoreDefaultRate(text: string, storeRate: number | null | undefined): boolean {
  const parsed = parseRatePercent(text);
  return parsed != null && ratePercentOf(parsed) === ratePercentOf(storeRate);
}

/** 수습 시트를 열 때의 첫 값. */
export function initialProbationDraft(input: {
  isProbation: boolean; endsOn: string | null | undefined; rate: number | string | null | undefined;
  joinedAt: string; storeMonths: ProbationMonths | null | undefined; storeRate: number | null | undefined;
}): ProbationDraft {
  const valid = isIsoDate(input.joinedAt);
  const endsOn = !valid ? '' : input.endsOn ? clampProbationEnd(input.endsOn, input.joinedAt) : defaultProbationEnd(input.joinedAt, input.storeMonths);
  return { isProbation: input.isProbation, endsOn, ratePercent: ratePercentOf(input.isProbation && input.rate != null ? input.rate : input.storeRate) };
}

/** 달력에서 한 달을 그릴 때의 칸: 앞쪽 빈칸 수와 날짜들. */
export function calendarCells(year: number, month: number): { leading: number; dates: string[] } {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  return { leading: first.getUTCDay(), dates: Array.from({ length: days }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`) };
}

export function shiftMonth(year: number, month: number, offset: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + offset;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export interface ProbationWageInput {
  isPart: boolean;
  hourlyWage: number | null;
  monthlySalary: number | null;
  weeklyMinutes: number | null;
  weeklyRestIncluded: boolean | null;
}

/** 수습 비율을 적용한 금액이 최저임금 90%보다 적은지. 기준이 없거나 비교할 수 없으면 false(막지 않고 안내에만 쓴다). */
export function probationBelowFloor(wage: ProbationWageInput, rate: number, date: string): boolean {
  let minimum: number;
  try { minimum = minimumWageFor(date); }
  catch (error) { if (error instanceof PayrollStandardMissingError) return false; throw error; }
  return wage.isPart
    ? wage.hourlyWage != null && isBelowProbationFloor({ hourlyWage: wage.hourlyWage * rate, weeklyRestIncluded: wage.weeklyRestIncluded, weeklyMinutes: wage.weeklyMinutes }, minimum)
    : wage.monthlySalary != null && isBelowProbationFloor({ monthlySalary: wage.monthlySalary * rate, weeklyMinutes: wage.weeklyMinutes }, minimum);
}

/** 예시 금액 한 줄(‘시급 10,000원이면 수습 중 9,000원이에요.’). */
export function probationExample(wage: ProbationWageInput, rate: number): string | null {
  const base = wage.isPart ? wage.hourlyWage : wage.monthlySalary;
  if (base == null || !Number.isFinite(base) || base <= 0) return null;
  const label = wage.isPart ? '시급' : '월 기본급';
  return `${label} ${base.toLocaleString('ko-KR')}원이면 수습 중 ${Math.round(base * rate).toLocaleString('ko-KR')}원이에요.`;
}

/** 수습 마지막 날 다음 날(급여가 원래대로 돌아오는 날). */
export function probationReturnDate(endsOn: string): string {
  return addDays(endsOn, 1);
}

import type { PaydayHolidayRule } from '../../types';
import { STORE_LAST_DAY } from '../../types';

/**
 * 매장 급여 날짜(마저 채우기 급여 날짜 묶음) 계산. 순수 함수만 둔다.
 * - 날짜 값 0(STORE_LAST_DAY) = 말일. 1~29일만 고를 수 있다(30·31일은 없는 달이 있어 막는다).
 * - 마감 달 M의 근무분: 마감일이 말일이면 M월 1일~말일, 아니면 (M-1)월 (마감일+1)일 ~ M월 마감일.
 * - 지급일: M월(같은 달) 또는 M+1월(다음 달)의 지급일. 그 달에 없는 날이면 그 달 말일로 당긴다.
 * - 쉬는 날 처리: 앱에 공휴일 자료가 없어 토·일만 쉬는 날로 본다(공휴일은 판단하지 않는다).
 * 날짜 문자열은 모두 KST 기준 'YYYY-MM-DD'.
 */
export interface PaydaySettings {
  closeDay: number;
  monthOffset: 0 | 1;
  payDay: number;
  holidayRule: PaydayHolidayRule;
}

export interface PaydayOccurrence {
  /** 쉬는 날 처리 후 실제로 주는 날 */
  date: string;
  /** 쉬는 날 처리 전 원래 지급일 */
  scheduled: string;
  /** 근무분의 기준 달(마감 달) */
  workYear: number;
  workMonth: number;
}

export interface PaydayAlertInfo extends PaydayOccurrence {
  kind: 'd3' | 'today';
}

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;
const ALERT_DAYS_BEFORE = 3;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
export const MAX_PICKABLE_DAY = 29;

export function kstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0(말일)이나 그 달에 없는 날을 실제 날짜로 바꾼다. */
export function resolveDay(year: number, month: number, day: number): number {
  const last = daysInMonth(year, month);
  return day === STORE_LAST_DAY ? last : Math.min(day, last);
}

export function isValidPickDay(day: number | null | undefined): day is number {
  return day != null && Number.isInteger(day) && (day === STORE_LAST_DAY || (day >= 1 && day <= MAX_PICKABLE_DAY));
}

/** 같은 달 지급은 지급일이 마감일보다 뒤일 때만 뜻이 있다. 마감일이 말일이면 같은 달에 줄 수 없다. */
export function isSameMonthPayAllowed(closeDay: number, payDay: number | null): boolean {
  if (closeDay === STORE_LAST_DAY) return false;
  if (payDay == null) return true;
  return payDay === STORE_LAST_DAY || payDay > closeDay;
}

/** 고른 날짜로 같은 달이 안 되면 다음 달로 맞춘다. */
export function normalizeMonthOffset(closeDay: number, payDay: number, offset: 0 | 1): 0 | 1 {
  return offset === 0 && !isSameMonthPayAllowed(closeDay, payDay) ? 1 : offset;
}

function toUtc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function fromUtc(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function ymd(year: number, month: number, day: number): string {
  return fromUtc(Date.UTC(year, month - 1, day));
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12 + 12) % 12 + 1 };
}

/** 토·일이면 규칙대로 옮긴다. 공휴일은 앱에 자료가 없어 판단하지 않는다. */
export function adjustForDayOff(date: string, rule: PaydayHolidayRule): string {
  if (rule === 'same') return date;
  const step = rule === 'before' ? -DAY_MS : DAY_MS;
  let time = toUtc(date);
  while (isWeekend(time)) time += step;
  return fromUtc(time);
}

function isWeekend(time: number): boolean {
  const day = new Date(time).getUTCDay();
  return day === 0 || day === 6;
}

/** 마감 달(workYear·workMonth) 근무분을 주는 날. */
export function paydayFor(settings: PaydaySettings, workYear: number, workMonth: number): PaydayOccurrence {
  const pay = addMonths(workYear, workMonth, settings.monthOffset);
  const scheduled = ymd(pay.year, pay.month, resolveDay(pay.year, pay.month, settings.payDay));
  return { date: adjustForDayOff(scheduled, settings.holidayRule), scheduled, workYear, workMonth };
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** 오늘이 지급일 3일 전이면 'd3', 당일이면 'today'. 쉬는 날 처리로 옮긴 날을 기준으로 본다. */
export function findPaydayAlert(settings: PaydaySettings, today: string): PaydayAlertInfo | null {
  const [year, month] = today.split('-').map(Number);
  for (let delta = -2; delta <= 1; delta += 1) {
    const work = addMonths(year, month, delta);
    const occurrence = paydayFor(settings, work.year, work.month);
    const gap = daysBetween(today, occurrence.date);
    if (gap === 0) return { ...occurrence, kind: 'today' };
    if (gap === ALERT_DAYS_BEFORE) return { ...occurrence, kind: 'd3' };
  }
  return null;
}

/** '12월 10일(수)' */
export function formatMonthDayWeekday(date: string): string {
  const time = toUtc(date);
  const value = new Date(time);
  return `${value.getUTCMonth() + 1}월 ${value.getUTCDate()}일(${WEEKDAYS[value.getUTCDay()]})`;
}

/** 시안 형식: 3일 전 '12월 10일(수) · 11월 근무분', 당일 '11월 근무분을 줄 날이에요'. */
export function paydayAlertCopy(alert: PaydayAlertInfo): { title: string; body: string } {
  if (alert.kind === 'today') return { title: '오늘은 월급날이에요', body: `${alert.workMonth}월 근무분을 줄 날이에요` };
  return { title: '3일 뒤 월급날이에요', body: `${formatMonthDayWeekday(alert.date)} · ${alert.workMonth}월 근무분` };
}

export function dayLabel(day: number): string {
  return day === STORE_LAST_DAY ? '말일' : `${day}일`;
}

/** 지급일 줄 표시: '다음 달 10일' */
export function paydayRowLabel(offset: 0 | 1, payDay: number): string {
  return `${offset === 1 ? '다음 달' : '같은 달'} ${dayLabel(payDay)}`;
}

/** 급여 날짜 묶음 아래 한 줄 설명: '전달 16일~이번 달 15일 근무분을 다음 달 10일에 줘요.' */
export function describePaySchedule(closeDay: number, offset: 0 | 1, payDay: number): string {
  const period = closeDay === STORE_LAST_DAY ? '이번 달 1일~말일' : `전달 ${closeDay + 1}일~이번 달 ${closeDay}일`;
  return `${period} 근무분을 ${offset === 1 ? '다음 달' : '이번 달'} ${dayLabel(payDay)}에 줘요.`;
}

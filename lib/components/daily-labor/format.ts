/** 일용근로자 급여대장 화면의 표시·입력 변환. 계산은 하지 않는다. */
import { addDays, daysInMonth } from '../../payroll';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
/** 금액 입력 최대 자릿수(1,000만 원 미만 + 여유). 서버·서비스가 다시 검사한다. */
const MAX_AMOUNT_DIGITS = 8;

export function won(value: number): string {
  return `${value.toLocaleString('ko-KR')}원`;
}

export function weekdayOf(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

/** '11월 8일(일)' */
export function dayLabel(date: string): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일(${weekdayOf(date)})`;
}

/** '2026년 11월' */
export function monthLabel(yearMonth: string): string {
  return `${yearMonth.slice(0, 4)}년 ${Number(yearMonth.slice(5, 7))}월`;
}

export function shiftMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** 숫자만 남긴 금액. 비어 있으면 null. */
export function parseAmount(text: string): number | null {
  const digits = text.replace(/\D/g, '').slice(0, MAX_AMOUNT_DIGITS);
  return digits ? Number(digits) : null;
}

/** 입력칸에 보여 줄 쉼표 금액. null이면 빈칸. */
export function amountText(value: number | null): string {
  return value == null ? '' : value.toLocaleString('ko-KR');
}

/** 달력 칸: 앞쪽 빈칸(null)과 그 달 날짜. */
export function calendarCells(yearMonth: string): (string | null)[] {
  const first = `${yearMonth}-01`;
  const blanks = new Date(`${first}T00:00:00Z`).getUTCDay();
  const dates = Array.from({ length: daysInMonth(yearMonth) }, (_, i) => addDays(first, i));
  return [...Array<null>(blanks).fill(null), ...dates];
}

export { WEEKDAYS };

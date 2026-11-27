/** 급여 계산용 날짜 도우미. 모든 날짜는 'YYYY-MM-DD' 문자열(한국 날짜)로 다룬다. */
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isYearMonth(value: string): boolean {
  return MONTH.test(value);
}

export function isIsoDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function daysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthDates(yearMonth: string): string[] {
  return Array.from({ length: daysInMonth(yearMonth) }, (_, i) => `${yearMonth}-${String(i + 1).padStart(2, '0')}`);
}

export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** n개월 기간의 마지막 날(민법 160조): 같은 날의 전날(3-15 + 1개월 → 4-14), 같은 날이 없으면 그 달 말일(1-31 + 1개월 → 2-28). */
export function addMonthsInclusiveEnd(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const targetIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12 + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const ym = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
  if (day > lastDay) return `${ym}-${String(lastDay).padStart(2, '0')}`;
  return addDays(`${ym}-${String(day).padStart(2, '0')}`, -1);
}

/** 월~일을 한 주로 보고 그 주 월요일 날짜를 돌려준다. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

export function floorTo(value: number, unit: number): number {
  return Math.floor(value / unit) * unit;
}

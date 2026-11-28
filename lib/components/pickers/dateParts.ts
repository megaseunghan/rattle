/* design-system: DESIGN.md — 휠·날짜 표시에 쓰는 순수 도우미(직원 합류·직원 정보·일용근로자 공용). */

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
/** 입사일 휠의 첫 해(확정 시안: 1970년부터). */
export const WHEEL_MIN_YEAR = 1970;
/** 주 근무시간 휠: 0~52시간, 분은 10분 단위. */
export const DURATION_MAX_HOURS = 52;
export const DURATION_MINUTE_STEPS = [0, 10, 20, 30, 40, 50] as const;

export interface DateParts { year: number; month: number; day: number }

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 'YYYY-MM-DD'를 나눈다. 없는 날짜면 null. */
export function splitIsoDate(iso: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** 년·월·일을 'YYYY-MM-DD'로 합친다. 그달에 없는 날이면 그달 말일로 맞춘다. */
export function joinIsoDate(year: number, month: number, day: number): string {
  const bounded = Math.min(Math.max(1, day), daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, '0')}-${String(bounded).padStart(2, '0')}`;
}

export function weekdayOf(iso: string): string {
  const parts = splitIsoDate(iso);
  if (!parts) return '';
  return WEEKDAYS[new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()];
}

/** '2026년 12월 1일(화)'. 요일을 빼려면 weekday: false. 잘못된 날짜면 원문을 돌려준다. */
export function formatKoreanDate(iso: string, options: { weekday?: boolean } = {}): string {
  const parts = splitIsoDate(iso);
  if (!parts) return iso;
  const base = `${parts.year}년 ${parts.month}월 ${parts.day}일`;
  return options.weekday === false ? base : `${base}(${weekdayOf(iso)})`;
}

/** 휠에 보여 줄 연도 목록(1970년 ~ maxYear). */
export function wheelYears(maxYear: number): number[] {
  const last = Math.max(WHEEL_MIN_YEAR, maxYear);
  return Array.from({ length: last - WHEEL_MIN_YEAR + 1 }, (_, i) => WHEEL_MIN_YEAR + i);
}

/** '20시간', '20시간 30분', '30분'. 비어 있으면 빈 문자열. */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return '';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0 && rest > 0) return `${rest}분`;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

/** 분을 휠의 시간·분 칸으로 나눈다(휠 범위 밖이면 가장 가까운 칸). */
export function splitDuration(minutes: number): { hours: number; minutes: number } {
  const max = DURATION_MAX_HOURS * 60 + 50;
  const safe = Math.min(max, Math.max(0, Math.round(minutes / 10) * 10));
  return { hours: Math.floor(safe / 60), minutes: safe % 60 };
}

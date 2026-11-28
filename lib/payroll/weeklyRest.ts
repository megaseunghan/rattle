import { addDays, addMonthsInclusiveEnd, weekStart } from './period';
import { weeklyRestMinutes } from './minimumWage';

export interface WeeklyRestEstimate { week_start: string; worked_minutes: number; rest_minutes: number; amount: number }

/**
 * 주휴수당을 시급과 별도로 주기로 한 파트타이머의 예상 주휴수당.
 * 실제 근무 분을 주(월~일)별로 묶어 15시간 이상인 주만 계산한다. 결근·개근 판단은 하지 않는 예상값이다.
 */
export function estimateWeeklyRest(days: { date: string; minutes: number }[], hourlyWage: number): WeeklyRestEstimate[] {
  const weeks = new Map<string, number>();
  for (const day of days) {
    if (!Number.isFinite(day.minutes) || day.minutes < 0) continue;
    const key = weekStart(day.date);
    weeks.set(key, (weeks.get(key) ?? 0) + day.minutes);
  }
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([week_start, worked]) => {
    const rest = weeklyRestMinutes(worked);
    return rest > 0 ? [{ week_start, worked_minutes: worked, rest_minutes: rest, amount: Math.round(rest * hourlyWage / 60) }] : [];
  });
}

export interface MonthWeeklyRest { amount: number; partialWeeks: number }

/**
 * 한 달 명세의 예상 주휴수당. 달 안에서 월~일이 다 들어가는 주만 계산하고,
 * 달을 넘는 주(앞뒤 달 근무를 합쳐야 판단 가능)는 partialWeeks로 세어 '확인 필요'로 안내한다.
 * 각 주의 시급은 그 주 마지막 근무일의 적용 시급이다.
 */
export function monthWeeklyRest(days: { date: string; minutes: number; hourlyWage: number }[], yearMonth: string): MonthWeeklyRest {
  const first = `${yearMonth}-01`;
  const last = addMonthsInclusiveEnd(first, 1);
  const byWeek = new Map<string, typeof days>();
  for (const day of days) {
    const key = weekStart(day.date);
    byWeek.set(key, [...(byWeek.get(key) ?? []), day]);
  }
  let amount = 0;
  let partialWeeks = 0;
  for (const [start, weekDays] of byWeek) {
    if (start < first || addDays(start, 6) > last) { partialWeeks++; continue; }
    const wage = [...weekDays].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!.hourlyWage;
    amount += estimateWeeklyRest(weekDays, wage).reduce((sum, week) => sum + week.amount, 0);
  }
  return { amount, partialWeeks };
}

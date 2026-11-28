/** 최저임금 비교(저장 때 회색 안내만, 막지 않음). */
export const STANDARD_WEEKLY_MINUTES = 40 * 60;
const WEEKS_PER_MONTH = 365 / 7 / 12;

/** 주휴시간(분): 주 15시간 이상일 때 min(주 소정근로, 40시간) ÷ 40 × 8시간. */
export function weeklyRestMinutes(weeklyMinutes: number): number {
  if (weeklyMinutes < 15 * 60) return 0;
  return Math.min(weeklyMinutes, STANDARD_WEEKLY_MINUTES) / 5;
}

export interface MinimumWageInput {
  /** 시급제: 적용 시급(수습 반영 후) */
  hourlyWage?: number | null;
  /** 시급에 주휴수당이 포함됐는지 */
  weeklyRestIncluded?: boolean | null;
  /** 월급제: 월 기본급(비과세 제외 전, 수습 반영 후) */
  monthlySalary?: number | null;
  weeklyMinutes?: number | null;
}

/** 최저임금과 비교할 시간당 금액. 계산할 수 없으면 null. */
export function comparableHourly(input: MinimumWageInput): number | null {
  if (input.hourlyWage != null) {
    if (!input.weeklyRestIncluded) return input.hourlyWage;
    const weekly = input.weeklyMinutes;
    if (weekly == null || weekly <= 0) return null;
    return input.hourlyWage * weekly / (weekly + weeklyRestMinutes(weekly));
  }
  if (input.monthlySalary != null) {
    const weekly = input.weeklyMinutes ?? STANDARD_WEEKLY_MINUTES;
    // 고시의 월 환산 기준시간처럼 시간 단위로 올린다(주 40시간 → 208.57 → 209시간).
    const monthlyHours = Math.ceil((weekly + weeklyRestMinutes(weekly)) / 60 * WEEKS_PER_MONTH);
    return monthlyHours > 0 ? input.monthlySalary / monthlyHours : null;
  }
  return null;
}

export function isBelowMinimumWage(input: MinimumWageInput, minimumHourly: number): boolean {
  const value = comparableHourly(input);
  return value != null && value + 1e-9 < minimumHourly;
}

/**
 * 수습 비율을 적용한 금액이 최저임금의 90%보다 적은지(최저임금법 시행령 3조). 막지 않고 회색 안내에만 쓴다.
 * input은 수습 비율을 적용한 뒤의 시급·월급이다.
 */
export function isBelowProbationFloor(input: MinimumWageInput, minimumHourly: number, floor = 0.9): boolean {
  return isBelowMinimumWage(input, minimumHourly * floor);
}


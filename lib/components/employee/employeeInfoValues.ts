/* design-system: DESIGN.md 「직원 정보 수정(S05)」 — 줄 표시값과 저장 내용(순수 함수). */
import type { Employee } from '../../../types';
import { addDays, addMonthsInclusiveEnd, isIsoDate } from '../../payroll';
import { clampProbationEnd, PROBATION_QUICK_MONTHS, probationSpanDays } from '../join/probationValues';
import type { ProbationResult } from '../join/ProbationSheet';

export const DEPENDENTS_MIN = 1;
export const DEPENDENTS_MAX = 11;
/** 주 15시간(분). 이보다 적게 일하는 파트타이머는 4대보험·부양가족을 쓰지 않는다. */
const INSURED_WEEKLY_MINUTES = 15 * 60;

export type EmployeePatch = Partial<Omit<Employee, 'id' | 'store_id' | 'created_at'>>;

export function weeklyMinutesOf(employee: Pick<Employee, 'weekly_minutes' | 'weekly_hours'>): number | null {
  return employee.weekly_minutes ?? (employee.weekly_hours != null ? employee.weekly_hours * 60 : null);
}

/** 부양가족 줄: 프리랜서가 아니고, 정규직이거나 주 15시간 이상 파트타이머일 때만. */
export function showsDependents(employee: Employee): boolean {
  if (employee.income_type === 'freelancer') return false;
  if (employee.employment_type === 'regular') return true;
  return (weeklyMinutesOf(employee) ?? 0) >= INSURED_WEEKLY_MINUTES;
}

export function clampDependents(value: number): number {
  return Math.min(DEPENDENTS_MAX, Math.max(DEPENDENTS_MIN, Math.round(value)));
}

export function weeklyMinutesPatch(minutes: number): EmployeePatch {
  // 기존 계산 경로 호환용 정수 시간(내림)도 같이 맞춘다.
  return { weekly_minutes: minutes, weekly_hours: Math.floor(minutes / 60) };
}

/**
 * 입사일을 바꾸면 수습 기간도 같이 옮긴다(사용자 결정 2026-11-28). 1·2·3개월로 정한 기간이면 새 입사일부터 같은 개월 수로,
 * 달력에서 고른 날이면 같은 일수로 옮긴다. 그래도 새 입사일부터 3개월 안으로 맞춘다.
 */
export function joinedAtPatch(employee: Employee, joinedAt: string): EmployeePatch {
  if (!employee.is_probation) return { joined_at: joinedAt };
  return { joined_at: joinedAt, probation_started_at: joinedAt, probation_ends_on: movedProbationEnd(employee, joinedAt) };
}

function movedProbationEnd(employee: Employee, joinedAt: string): string | null {
  const end = employee.probation_ends_on;
  if (!end || !isIsoDate(end)) return null;
  const start = employee.probation_started_at ?? employee.joined_at;
  if (!start || !isIsoDate(start) || end < start) return clampProbationEnd(end, joinedAt);
  const months = PROBATION_QUICK_MONTHS.find(n => addMonthsInclusiveEnd(start, n) === end);
  const moved = months ? addMonthsInclusiveEnd(joinedAt, months) : addDays(joinedAt, probationSpanDays(start, end) - 1);
  return clampProbationEnd(moved, joinedAt);
}

export function probationPatch(joinedAt: string | null, value: ProbationResult): EmployeePatch {
  if (!value.is_probation || !joinedAt) return { is_probation: false, probation_started_at: null, probation_ends_on: null, probation_rate: null };
  return { is_probation: true, probation_started_at: joinedAt, probation_ends_on: value.probation_ends_on, probation_rate: value.probation_rate };
}

export function accountPatch(bankName: string, accountNumber: string): EmployeePatch {
  // 계좌번호를 비우면 지금 번호를 그대로 둔다.
  return accountNumber ? { bank_name: bankName, account_number: accountNumber } : { bank_name: bankName };
}

export function formatAccountNumber(value: string): string {
  return value.replace(/\D/g, '');
}

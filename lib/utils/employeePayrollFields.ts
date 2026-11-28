import type { Employee, IncomeType } from '../../types';
import { UserFacingError } from './error';
import { isBelowMinimumWage, isIsoDate, minimumWageFor, PayrollStandardMissingError, probationEndDate } from '../payroll';
import { koreanDate } from './regularWages';

/** 직원 폼의 급여 계산 입력(2026-v2 최소 필드). 화면 상태는 문자열로 둔다. */
export interface PayrollFieldsForm {
  income_type: IncomeType;
  weekly_hours: string;   // 주 근무시간 — 시간
  weekly_mins: string;    // 주 근무시간 — 분(10분 단위)
  weekly_rest_included: boolean | null;
  is_probation: boolean;
  probation_ends_on: string;
}

export const EMPTY_PAYROLL_FIELDS: PayrollFieldsForm = {
  income_type: 'employee', weekly_hours: '', weekly_mins: '', weekly_rest_included: null, is_probation: false, probation_ends_on: '',
};

export function payrollFieldsFrom(employee: Employee): PayrollFieldsForm {
  const minutes = employee.weekly_minutes ?? (employee.weekly_hours != null ? employee.weekly_hours * 60 : null);
  return {
    income_type: employee.income_type ?? 'employee',
    weekly_hours: minutes == null ? '' : String(Math.floor(minutes / 60)),
    weekly_mins: minutes == null ? '' : String(minutes % 60),
    weekly_rest_included: employee.weekly_rest_included ?? null,
    is_probation: employee.is_probation,
    probation_ends_on: employee.probation_ends_on ?? '',
  };
}

/** 비어 있으면 null(공제하지 않고 입력 안내). 10분 단위, 주 168시간 이내. */
export function parseWeeklyMinutes(hours: string, minutes: string): number | null {
  if (!hours.trim() && !minutes.trim()) return null;
  if (!/^\d*$/.test(hours.trim()) || !/^\d*$/.test(minutes.trim())) throw new UserFacingError('주 근무시간을 숫자로 입력해 주세요.');
  const h = Number(hours.trim() || '0'), m = Number(minutes.trim() || '0');
  if (m >= 60 || m % 10 !== 0) throw new UserFacingError('주 근무시간의 분은 0~50분, 10분 단위로 입력해 주세요.');
  const total = h * 60 + m;
  if (total === 0) throw new UserFacingError('주 근무시간을 10분 이상으로 입력해 주세요. 모르면 비워 두세요.');
  if (total > 168 * 60) throw new UserFacingError('주 근무시간은 168시간을 넘을 수 없어요.');
  return total;
}

/** 수습 마지막 날 바로 채우기(입사일 기준). */
export function probationEndFor(joinedAt: string, months: 1 | 2 | 3): string | null {
  return isIsoDate(joinedAt) ? probationEndDate(joinedAt, { kind: 'months', months }) : null;
}

export interface PayrollFieldsPayload {
  income_type: IncomeType;
  weekly_minutes: number | null;
  weekly_hours: number | null;
  weekly_rest_included: boolean | null;
  is_probation: boolean;
  probation_started_at: string | null;
  probation_ends_on: string | null;
}

export function buildPayrollFieldsPayload(form: PayrollFieldsForm, isPart: boolean, joinedAt: string | null): PayrollFieldsPayload {
  const weekly = isPart ? parseWeeklyMinutes(form.weekly_hours, form.weekly_mins) : null;
  let probationEnd: string | null = null;
  if (form.is_probation) {
    const end = form.probation_ends_on.trim();
    if (!joinedAt || !isIsoDate(joinedAt)) throw new UserFacingError('수습을 적용하려면 입사일을 먼저 입력해 주세요.');
    if (!isIsoDate(end) || end < joinedAt) throw new UserFacingError('수습 마지막 날을 입사일 이후 YYYY-MM-DD로 입력해 주세요.');
    const threeMonths = probationEndDate(joinedAt, { kind: 'months', months: 3 })!;
    if (end > threeMonths) throw new UserFacingError('3개월이 지나면 급여를 줄일 수 없어요. 수습 기간을 3개월 이내로 정해 주세요.');
    probationEnd = end;
  }
  return {
    income_type: form.income_type,
    weekly_minutes: weekly,
    // 기존 합류·계산 경로 호환용 정수 시간(내림). 계산은 weekly_minutes를 쓴다.
    weekly_hours: weekly == null ? null : Math.floor(weekly / 60),
    weekly_rest_included: isPart ? form.weekly_rest_included : null,
    is_probation: form.is_probation,
    probation_started_at: form.is_probation ? joinedAt : null,
    probation_ends_on: probationEnd,
  };
}

/** 저장 때 보여 줄 최저임금 회색 안내(막지 않음). 기준이 없거나 비교할 수 없으면 null. */
export function minimumWageNotice(input: { isPart: boolean; hourly: number | null; monthly: number | null; weeklyMinutes: number | null; weeklyRestIncluded: boolean | null }, date = koreanDate()): string | null {
  let minimum: number;
  try { minimum = minimumWageFor(date); }
  catch (error) { if (error instanceof PayrollStandardMissingError) return null; throw error; }
  const below = input.isPart
    ? isBelowMinimumWage({ hourlyWage: input.hourly, weeklyRestIncluded: input.weeklyRestIncluded, weeklyMinutes: input.weeklyMinutes }, minimum)
    : isBelowMinimumWage({ monthlySalary: input.monthly, weeklyMinutes: input.weeklyMinutes }, minimum);
  return below ? `${date.slice(0, 4)}년 최저임금(시간당 ${minimum.toLocaleString()}원)보다 낮을 수 있어요. 저장은 되지만 조건을 다시 확인해 주세요.` : null;
}

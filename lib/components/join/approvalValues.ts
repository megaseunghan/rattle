/* design-system: DESIGN.md — 합류 승인 화면의 표시값·검증(순수 함수). */
import type { JoinOnboardingInput, JoinProbationReview } from '../../../types';
import { isBelowMinimumWage, isIsoDate, minimumWageFor, PayrollStandardMissingError } from '../../payroll';
import { buildJoinOnboarding, validateOnboardingField, type OnboardingDraft } from '../../utils/joinOnboarding';
import { bankShortName, formatKoreanDate } from '../pickers';
import { defaultProbationEnd, ratePercentOf, type ProbationMonths } from './probationValues';

export const WAGE_REQUIRED = { hourlyWage: '시급을 입력해주세요', baseSalary: '월급을 입력해주세요' } as const;

/** 관리자 화면의 급여 칸 안내. 문제없으면 ''. */
export function adminWageError(draft: OnboardingDraft): string {
  const field = draft.employmentType === 'part_time' ? 'hourlyWage' : 'baseSalary';
  try { validateOnboardingField(field, draft, 'admin'); return ''; }
  catch { return WAGE_REQUIRED[field]; }
}

/** 최종 합류 전에 남은 첫 문제(없으면 null). 급여 칸 안내는 adminWageError로 따로 보인다. */
export function adminDraftError(draft: OnboardingDraft): string | null {
  try { buildJoinOnboarding(draft, 'admin'); return null; }
  catch (error) { return error instanceof Error ? error.message : '입력한 내용을 다시 확인해 주세요.'; }
}

export function moneyText(value: string): string {
  const number = Number(value.replace(/,/g, '').trim());
  return value.trim() && Number.isFinite(number) ? `${number.toLocaleString('ko-KR')}원` : '';
}

export function accountText(bankName: string, accountNumber: string, last4?: string | null): string {
  const tail = accountNumber ? accountNumber.replace(/\D/g, '').slice(-4) : last4 ?? '';
  const bank = bankShortName(bankName);
  if (!bank && !tail) return '';
  return tail ? `${bank} ····${tail}`.trim() : bank;
}

/** 수습 줄 표시값. */
export function probationText(value: JoinProbationReview, storeRate: number | null | undefined): string {
  if (!value.is_probation || !value.probation_ends_on) return '적용 안 함';
  return `${formatKoreanDate(value.probation_ends_on, { weekday: false })}까지 · ${ratePercentOf(value.probation_rate ?? storeRate)}%`;
}

/** 관리자가 아직 수습을 정하지 않았을 때: 매장 기본 기간이 있으면 그 기간으로 적용한다. */
export function defaultProbation(joinedAt: string, storeMonths: ProbationMonths | null | undefined, storeRate: number | null | undefined): JoinProbationReview {
  if (!storeMonths || !isIsoDate(joinedAt)) return { is_probation: false, probation_ends_on: null, probation_rate: null };
  return { is_probation: true, probation_ends_on: defaultProbationEnd(joinedAt, storeMonths), probation_rate: Number(ratePercentOf(storeRate)) / 100 };
}

/** 최종 합류로 보낼 내용. 새 앱은 수습 여부를 항상 보낸다. */
export function buildApprovalReview(draft: OnboardingDraft, probation: JoinProbationReview): JoinOnboardingInput & JoinProbationReview {
  const profile = buildJoinOnboarding(draft, 'admin');
  return probation.is_probation && probation.probation_ends_on
    ? { ...profile, is_probation: true, probation_ends_on: probation.probation_ends_on, probation_rate: probation.probation_rate }
    : { ...profile, is_probation: false, probation_ends_on: null, probation_rate: null };
}

/** 최저임금 미달 회색 안내(막지 않음). 비교할 수 없으면 null. */
export function minimumWageMessage(input: {
  isPart: boolean; hourly: number | null; monthly: number | null; weeklyMinutes: number | null; weeklyRestIncluded: boolean | null;
}, date: string): string | null {
  let minimum: number;
  try { minimum = minimumWageFor(date); }
  catch (error) { if (error instanceof PayrollStandardMissingError) return null; throw error; }
  const below = input.isPart
    ? input.hourly != null && isBelowMinimumWage({ hourlyWage: input.hourly, weeklyRestIncluded: input.weeklyRestIncluded, weeklyMinutes: input.weeklyMinutes }, minimum)
    : input.monthly != null && isBelowMinimumWage({ monthlySalary: input.monthly, weeklyMinutes: input.weeklyMinutes }, minimum);
  return below ? `${date.slice(0, 4)}년 최저임금 시급 ${minimum.toLocaleString('ko-KR')}원보다 적어요. 그래도 저장할 수 있어요.` : null;
}

/** 최저임금 비교 날짜: 입사일이 오늘보다 뒤면 입사일, 아니면 오늘. */
export function wageCheckDate(joinedAt: string, today: string): string {
  return isIsoDate(joinedAt) && joinedAt > today ? joinedAt : today;
}

export function amountOf(text: string): number | null {
  const cleaned = text.replace(/,/g, '').trim();
  return /^\d+$/.test(cleaned) ? Number(cleaned) : null;
}

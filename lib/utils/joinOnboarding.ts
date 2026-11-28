import type { EmploymentType, JoinIncomeType, JoinOnboardingInput, JoinOnboardingProfile } from '../../types';
import { UserFacingError } from './error';

/** 주휴수당: 따로 받아요 / 시급에 들어 있어요 / 잘 모르겠어요(파트타이머만). */
export type JoinWeeklyRest = 'separate' | 'included' | 'unknown';

/** 직원 합류 입력과 관리자 합류 승인이 함께 쓰는 화면 상태. 금액은 입력 중 문자열로 둔다. */
export interface OnboardingDraft {
  employmentType: EmploymentType;
  /** 계약: 근로자 / 프리랜서 3.3% / 잘 모르겠어요. 아직 안 골랐으면 null */
  incomeType: JoinIncomeType | null;
  hourlyWage: string;
  weeklyRest: JoinWeeklyRest | null;
  /** 주 근무시간(분, 10분 단위) */
  weeklyMinutes: number | null;
  baseSalary: string;
  nonTaxable: string;
  joinedAt: string;
  bankName: string;
  accountNumber: string;
}

export const EMPTY_ONBOARDING_DRAFT: OnboardingDraft = {
  employmentType: 'regular', incomeType: null, hourlyWage: '', weeklyRest: null, weeklyMinutes: null,
  baseSalary: '', nonTaxable: '0', joinedAt: '', bankName: '', accountNumber: '',
};

/** applicant: 직원 신청(‘잘 모르겠어요’ 허용, 주휴 필수) / admin: 최종 합류(계약을 정해야 함, 주휴는 비워도 됨) */
export type OnboardingMode = 'applicant' | 'admin';

const MAX_WEEKLY_MINUTES = 168 * 60;

function amount(text: string, label: string, min: number, max: number) {
  const cleaned = text.replace(/,/g, '').trim();
  const value = Number(cleaned);
  if (!/^\d+$/.test(cleaned) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new UserFacingError(`${label}을 숫자로 확인해주세요.`);
  }
  return value;
}

function validateJoinedAt(joinedAt: string) {
  const parsed = new Date(`${joinedAt}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(joinedAt) || !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== joinedAt || joinedAt < '1900-01-01' || joinedAt > '2100-12-31') {
    throw new UserFacingError('입사일을 골라 주세요.');
  }
}

/** 직원의 질문별 입력과 관리자의 시트 입력에 같은 검증을 사용한다. */
export function validateOnboardingField(field: keyof OnboardingDraft, draft: OnboardingDraft, mode: OnboardingMode = 'applicant'): void {
  switch (field) {
    case 'incomeType':
      if (!draft.incomeType) throw new UserFacingError('계약을 골라 주세요.');
      if (mode === 'admin' && draft.incomeType === 'unknown') throw new UserFacingError('근로자인지 프리랜서인지 정해 주세요.');
      break;
    case 'hourlyWage': amount(draft.hourlyWage, '시급', 1, 10_000_000); break;
    case 'weeklyRest':
      if (mode === 'applicant' && !draft.weeklyRest) throw new UserFacingError('주휴수당을 골라 주세요.');
      break;
    case 'weeklyMinutes': {
      const minutes = draft.weeklyMinutes;
      if (minutes == null || !Number.isInteger(minutes) || minutes <= 0 || minutes > MAX_WEEKLY_MINUTES || minutes % 10 !== 0) {
        throw new UserFacingError('주 근무시간을 골라 주세요.');
      }
      break;
    }
    case 'baseSalary': amount(draft.baseSalary, '기본급', 1, 1_000_000_000); break;
    case 'nonTaxable': {
      const base = amount(draft.baseSalary, '기본급', 1, 1_000_000_000);
      const nonTaxable = amount(draft.nonTaxable, '비과세 금액', 0, 1_000_000_000);
      if (nonTaxable > base) throw new UserFacingError('비과세 금액은 월 급여를 넘을 수 없어요.');
      break;
    }
    case 'joinedAt': validateJoinedAt(draft.joinedAt); break;
    case 'bankName':
      if (!draft.bankName.trim() || draft.bankName.trim().length > 50) throw new UserFacingError('은행을 골라 주세요.');
      break;
    case 'accountNumber':
      if (!/^\d{6,30}$/.test(draft.accountNumber.replace(/[- ]/g, ''))) throw new UserFacingError('계좌번호를 확인해주세요.');
      break;
    case 'employmentType': break;
  }
}

/** 근무 형태에 따라 저장할 칸(질문 순서와 같다). */
export function onboardingFields(type: EmploymentType): (keyof OnboardingDraft)[] {
  return ['incomeType',
    ...(type === 'part_time' ? ['hourlyWage', 'weeklyRest', 'weeklyMinutes'] as const : ['baseSalary', 'nonTaxable'] as const),
    'joinedAt', 'bankName', 'accountNumber'];
}

function weeklyRestValue(rest: JoinWeeklyRest | null): boolean | null {
  return rest === 'included' ? true : rest === 'separate' ? false : null;
}

export function buildJoinOnboarding(draft: OnboardingDraft, mode: OnboardingMode = 'applicant'): JoinOnboardingInput {
  const partTime = draft.employmentType === 'part_time';
  onboardingFields(draft.employmentType).forEach(field => validateOnboardingField(field, draft, mode));
  const number = (value: string) => Number(value.replace(/,/g, '').trim());
  const minutes = partTime ? draft.weeklyMinutes : null;
  return {
    employment_type: draft.employmentType,
    income_type: draft.incomeType,
    hourly_wage: partTime ? number(draft.hourlyWage) : null,
    weekly_minutes: minutes,
    // 이전 서버·계산 경로 호환용 정수 시간(버림). 계산은 weekly_minutes를 쓴다.
    weekly_hours: minutes == null ? null : Math.floor(minutes / 60),
    weekly_rest_included: partTime ? weeklyRestValue(draft.weeklyRest) : null,
    base_salary: partTime ? 0 : number(draft.baseSalary),
    non_taxable: partTime ? 0 : number(draft.nonTaxable),
    joined_at: draft.joinedAt,
    bank_name: draft.bankName.trim(),
    account_number: draft.accountNumber.replace(/[- ]/g, ''),
  };
}

/** 서버의 합류 신청을 화면 상태로. 계좌번호 암호화 토큰은 비워 두고 따로 받아 채운다. */
export function draftFromProfile(profile: JoinOnboardingProfile | null | undefined): OnboardingDraft {
  if (!profile) return EMPTY_ONBOARDING_DRAFT;
  const partTime = profile.employment_type === 'part_time';
  const minutes = profile.weekly_minutes ?? (profile.weekly_hours != null ? profile.weekly_hours * 60 : null);
  const rest = profile.weekly_rest_included;
  return {
    employmentType: profile.employment_type ?? 'regular',
    // 이전 앱 신청(계약 없음)은 서버와 같이 근로자로 본다.
    incomeType: profile.income_type ?? 'employee',
    hourlyWage: profile.hourly_wage?.toString() ?? '',
    weeklyRest: !partTime ? null : rest === true ? 'included' : rest === false ? 'separate' : 'unknown',
    weeklyMinutes: partTime ? minutes : null,
    baseSalary: profile.base_salary?.toString() ?? '',
    nonTaxable: profile.non_taxable?.toString() ?? '0',
    joinedAt: profile.joined_at ?? '',
    bankName: profile.bank_name ?? '',
    accountNumber: profile.account_number?.startsWith('enc:') ? '' : profile.account_number ?? '',
  };
}

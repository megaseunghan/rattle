import type { EmploymentType, JoinOnboardingInput } from '../../types';
import { UserFacingError } from './error';

export interface OnboardingDraft {
  employmentType: EmploymentType;
  hourlyWage: string;
  weeklyHours: string;
  baseSalary: string;
  nonTaxable: string;
  joinedAt: string;
  bankName: string;
  accountNumber: string;
}

function amount(text: string, label: string, min: number, max: number) {
  const cleaned = text.replace(/,/g, '').trim();
  const value = Number(cleaned);
  if (!/^\d+$/.test(cleaned) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new UserFacingError(`${label}을 숫자로 확인해주세요.`);
  }
  return value;
}

/** 직원의 질문별 입력과 관리자의 일괄 수정에 같은 검증을 사용한다. */
export function validateOnboardingField(field: keyof OnboardingDraft, draft: OnboardingDraft): void {
  switch (field) {
    case 'hourlyWage': amount(draft.hourlyWage, '시급', 1, 10_000_000); break;
    case 'weeklyHours': amount(draft.weeklyHours, '주 근무시간', 0, 168); break;
    case 'baseSalary': amount(draft.baseSalary, '기본급', 1, 1_000_000_000); break;
    case 'nonTaxable': {
      const base = amount(draft.baseSalary, '기본급', 1, 1_000_000_000);
      const nonTaxable = amount(draft.nonTaxable, '비과세 금액', 0, 1_000_000_000);
      if (nonTaxable > base) throw new UserFacingError('비과세 금액은 월 급여를 넘을 수 없어요.');
      break;
    }
    case 'joinedAt': {
      const parsed = new Date(`${draft.joinedAt}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.joinedAt) || !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== draft.joinedAt || draft.joinedAt < '1900-01-01' || draft.joinedAt > '2100-12-31') {
        throw new UserFacingError('입사일을 YYYY-MM-DD 형식으로 확인해주세요.');
      }
      break;
    }
    case 'bankName':
      if (!draft.bankName.trim() || draft.bankName.trim().length > 50) throw new UserFacingError('은행을 입력해주세요.');
      break;
    case 'accountNumber':
      if (!/^\d{6,30}$/.test(draft.accountNumber.replace(/[- ]/g, ''))) throw new UserFacingError('계좌번호를 확인해주세요.');
      break;
  }
}

export function buildJoinOnboarding(draft: OnboardingDraft): JoinOnboardingInput {
  const partTime = draft.employmentType === 'part_time';
  const fields: (keyof OnboardingDraft)[] = [
    ...(partTime ? ['hourlyWage', 'weeklyHours'] as const : ['baseSalary', 'nonTaxable'] as const),
    'joinedAt', 'bankName', 'accountNumber',
  ];
  fields.forEach(field => validateOnboardingField(field, draft));
  const number = (value: string) => Number(value.replace(/,/g, '').trim());
  return {
    employment_type: draft.employmentType,
    hourly_wage: partTime ? number(draft.hourlyWage) : null,
    weekly_hours: partTime ? number(draft.weeklyHours) : null,
    base_salary: partTime ? 0 : number(draft.baseSalary),
    non_taxable: partTime ? 0 : number(draft.nonTaxable),
    joined_at: draft.joinedAt,
    bank_name: draft.bankName.trim(),
    account_number: draft.accountNumber.replace(/[- ]/g, ''),
  };
}

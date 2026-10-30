import type { EmploymentType } from '../../types';
import type { OnboardingDraft } from './joinOnboarding';
import { validateOnboardingField } from './joinOnboarding';
import { UserFacingError } from './error';

export interface JoinIdentity { name: string; phone: string }
export type JoinQuestion = keyof JoinIdentity | keyof OnboardingDraft;
export type JoinStep = JoinQuestion | 'review';

export function joinSteps(type: EmploymentType | null): JoinStep[] {
  return ['name', 'phone', 'employmentType',
    ...(type === 'part_time' ? ['hourlyWage', 'weeklyHours'] as const : ['baseSalary', 'nonTaxable'] as const),
    'joinedAt', 'bankName', 'accountNumber', 'review'];
}

export function validateJoinQuestion(step: JoinStep, identity: JoinIdentity, draft: OnboardingDraft, type: EmploymentType | null): void {
  switch (step) {
    case 'name':
      if (!identity.name.trim()) throw new UserFacingError('이름을 입력해주세요.');
      if (identity.name.trim().length > 100) throw new UserFacingError('이름은 100자까지 입력할 수 있어요.');
      return;
    case 'phone':
      if (!/^01[016789][0-9]{7,8}$/.test(identity.phone.replace(/[^0-9]/g, ''))) throw new UserFacingError('휴대폰 번호를 확인해주세요.');
      return;
    case 'employmentType':
      if (!type) throw new UserFacingError('근무 형태를 선택해주세요.');
      return;
    case 'review': return;
    default: validateOnboardingField(step, draft);
  }
}

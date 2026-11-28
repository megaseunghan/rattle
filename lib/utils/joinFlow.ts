import type { EmploymentType } from '../../types';
import type { OnboardingDraft } from './joinOnboarding';
import { onboardingFields, validateOnboardingField } from './joinOnboarding';
import { UserFacingError } from './error';

export interface JoinIdentity { name: string; phone: string }
export type JoinQuestion = keyof JoinIdentity | keyof OnboardingDraft;

/** 직원 합류 질문 순서(확정 시안). 근무 형태를 고르기 전에는 시급제 질문을 가정한다. 마지막 요약 단계는 없다. */
export function joinSteps(type: EmploymentType | null): JoinQuestion[] {
  return ['name', 'phone', 'employmentType', ...onboardingFields(type ?? 'part_time')];
}

export function validateJoinQuestion(step: JoinQuestion, identity: JoinIdentity, draft: OnboardingDraft, type: EmploymentType | null): void {
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
    default: validateOnboardingField(step, draft, 'applicant');
  }
}

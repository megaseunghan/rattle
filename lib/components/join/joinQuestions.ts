/* design-system: DESIGN.md 「직원 합류 입력」 — 합류 신청 질문 문구와 답한 줄 요약(순수 함수). */
import type { TextInputProps } from 'react-native';
import type { EmploymentType } from '../../../types';
import type { JoinIdentity, JoinQuestion } from '../../utils/joinFlow';
import type { OnboardingDraft } from '../../utils/joinOnboarding';
import { formatDuration, formatKoreanDate } from '../pickers';
import { choiceTitle, EMPLOYMENT_CHOICES, INCOME_CHOICES, WEEKLY_REST_CHOICES } from './ChoiceList';
import { moneyText } from './approvalValues';

export interface JoinQuestionCopy {
  title: string;
  description?: string;
  /** 화면 읽기 이름(입력칸) */
  label: string;
  placeholder?: string;
  keyboard?: TextInputProps['keyboardType'];
  maxLength?: number;
}

export const JOIN_QUESTIONS: Record<JoinQuestion, JoinQuestionCopy> = {
  name: { title: '이름을 알려 주세요', description: '관리자가 알아볼 수 있는 본인 이름이에요.', label: '이름', placeholder: '이름', maxLength: 100 },
  phone: { title: '휴대폰 번호를 알려 주세요', label: '휴대폰 번호', placeholder: '010-0000-0000', keyboard: 'phone-pad', maxLength: 13 },
  employmentType: { title: '어떤 형태로 일하나요?', label: '근무 형태' },
  incomeType: { title: '어떤 계약으로 일하나요?', description: '근로계약서에 적힌 대로 골라 주세요.', label: '계약' },
  hourlyWage: { title: '시급은 얼마인가요?', description: '세금을 떼기 전 금액이에요.', label: '시급', placeholder: '0', keyboard: 'number-pad', maxLength: 9 },
  weeklyRest: { title: '시급에 주휴수당이 들어 있나요?', label: '주휴수당' },
  weeklyMinutes: { title: '일주일에 몇 시간 일하나요?', description: '정해진 근무시간 기준이에요.', label: '주 근무시간' },
  baseSalary: { title: '월 급여는 얼마인가요?', description: '비과세를 포함한 세전 금액이에요.', label: '월 기본급', placeholder: '0', keyboard: 'number-pad', maxLength: 13 },
  nonTaxable: { title: '그중 비과세 금액은 얼마인가요?', description: '식대처럼 세금을 떼지 않는 금액이에요. 없으면 0원이에요.', label: '월 비과세 금액', placeholder: '0', keyboard: 'number-pad', maxLength: 13 },
  joinedAt: { title: '언제부터 일하나요?', label: '입사일' },
  bankName: { title: '급여 받을 은행을 골라 주세요', label: '은행' },
  accountNumber: { title: '계좌번호를 알려 주세요', description: '본인 이름으로 된 계좌예요. 앞자리 0도 그대로 적어 주세요.', label: '계좌번호', placeholder: '계좌번호', keyboard: 'number-pad', maxLength: 40 },
};

/** 신청 화면의 계약 보기: '프리랜서 3.3%'를 제목에 붙여 보여 준다. */
export const APPLICANT_INCOME_CHOICES = INCOME_CHOICES.map(choice => ({
  value: choice.value, title: choice.badge ? `${choice.title} ${choice.badge}` : choice.title, description: choice.caption,
}));
export const APPLICANT_EMPLOYMENT_CHOICES = EMPLOYMENT_CHOICES.map(choice => ({ value: choice.value, title: choice.title, description: choice.caption }));
export const APPLICANT_REST_CHOICES = WEEKLY_REST_CHOICES.map(choice => ({ value: choice.value, title: choice.title, description: choice.caption }));

export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4)}-${digits.slice(-4)}`;
}

/** 답한 질문을 한 줄로. */
export function joinAnswerText(step: JoinQuestion, identity: JoinIdentity, draft: OnboardingDraft, employment: EmploymentType | null): string {
  switch (step) {
    case 'name': return identity.name.trim();
    case 'phone': return formatPhone(identity.phone);
    case 'employmentType': return choiceTitle(EMPLOYMENT_CHOICES, employment);
    case 'incomeType': return choiceTitle(INCOME_CHOICES, draft.incomeType);
    case 'weeklyRest': return choiceTitle(WEEKLY_REST_CHOICES, draft.weeklyRest);
    case 'weeklyMinutes': return formatDuration(draft.weeklyMinutes);
    case 'hourlyWage': return moneyText(draft.hourlyWage);
    case 'baseSalary': return moneyText(draft.baseSalary);
    case 'nonTaxable': return moneyText(draft.nonTaxable || '0');
    case 'joinedAt': return draft.joinedAt ? formatKoreanDate(draft.joinedAt) : '';
    case 'bankName': return draft.bankName;
    case 'accountNumber': return draft.accountNumber;
    default: return '';
  }
}

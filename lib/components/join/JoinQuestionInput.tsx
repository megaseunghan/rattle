/* design-system: DESIGN.md 「직원 합류 입력」 — 활성 질문의 입력(밑줄 입력·선택지·휠·은행 버튼). */
import { StyleSheet, Text } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { Type } from '../../../constants/designTokens';
import type { EmploymentType } from '../../../types';
import type { JoinIdentity, JoinQuestion } from '../../utils/joinFlow';
import type { OnboardingDraft } from '../../utils/joinOnboarding';
import { koreanDate } from '../../utils/regularWages';
import { ChoiceList, UnderlineInput } from '../question-flow';
import { BankGrid, DateWheel, DurationWheel, formatDuration, formatKoreanDate } from '../pickers';
import { formatMoneyInput } from './UnderlineInput';
import { APPLICANT_EMPLOYMENT_CHOICES, APPLICANT_INCOME_CHOICES, APPLICANT_REST_CHOICES, formatPhone, JOIN_QUESTIONS } from './joinQuestions';

export interface JoinQuestionInputProps {
  step: JoinQuestion;
  identity: JoinIdentity;
  draft: OnboardingDraft;
  employment: EmploymentType | null;
  disabled: boolean;
  onIdentity: (patch: Partial<JoinIdentity>) => void;
  onDraft: (patch: Partial<OnboardingDraft>) => void;
  onEmployment: (type: EmploymentType) => void;
}

const MONEY_FIELDS = new Set<JoinQuestion>(['hourlyWage', 'baseSalary', 'nonTaxable']);

export function JoinQuestionInput({ step, identity, draft, employment, disabled, onIdentity, onDraft, onEmployment }: JoinQuestionInputProps) {
  const copy = JOIN_QUESTIONS[step];
  switch (step) {
    case 'employmentType':
      return <ChoiceList label={copy.label} options={APPLICANT_EMPLOYMENT_CHOICES} value={employment} onChange={onEmployment} disabled={disabled} />;
    case 'incomeType':
      return <ChoiceList label={copy.label} options={APPLICANT_INCOME_CHOICES} value={draft.incomeType} onChange={incomeType => onDraft({ incomeType })} disabled={disabled} />;
    case 'weeklyRest':
      return <ChoiceList label={copy.label} options={APPLICANT_REST_CHOICES} value={draft.weeklyRest} onChange={weeklyRest => onDraft({ weeklyRest })} disabled={disabled} />;
    case 'weeklyMinutes':
      return <DurationWheel value={draft.weeklyMinutes} onChange={weeklyMinutes => onDraft({ weeklyMinutes })} disabled={disabled}
        caption={draft.weeklyMinutes ? `일주일에 ${formatDuration(draft.weeklyMinutes)} 일해요.` : undefined} />;
    case 'joinedAt':
      return <DateWheel value={draft.joinedAt} fallback={koreanDate()} onChange={joinedAt => onDraft({ joinedAt })} disabled={disabled}
        caption={draft.joinedAt ? `${formatKoreanDate(draft.joinedAt)}부터 일해요.` : undefined} />;
    case 'bankName':
      return <BankGrid value={draft.bankName} onChange={bankName => onDraft({ bankName })} disabled={disabled} />;
    case 'name':
    case 'phone':
      return <UnderlineInput label={copy.label} value={step === 'phone' ? formatPhone(identity.phone) : identity.name}
        onChangeText={text => onIdentity(step === 'phone' ? { phone: text.replace(/\D/g, '').slice(0, 11) } : { name: text })}
        placeholder={copy.placeholder} keyboardType={copy.keyboard} maxLength={copy.maxLength} editable={!disabled}
        autoCorrect={false} numeric={step === 'phone'} textContentType={step === 'phone' ? 'telephoneNumber' : 'name'} />;
    default: {
      const field = step as keyof OnboardingDraft;
      const money = MONEY_FIELDS.has(step);
      const value = String(draft[field] ?? '');
      return <UnderlineInput label={copy.label} value={value} numeric placeholder={copy.placeholder} keyboardType={copy.keyboard}
        maxLength={copy.maxLength} editable={!disabled} autoCorrect={false}
        suffix={money ? <Text style={styles.unit}>원</Text> : undefined}
        onChangeText={text => onDraft({ [field]: money ? formatMoneyInput(text) : text.replace(/[^\d-]/g, '') } as Partial<OnboardingDraft>)} />;
    }
  }
}

const styles = StyleSheet.create({
  unit: { fontFamily: Fonts.wantedMedium, fontSize: Type.lg, color: Colors.gray600, marginLeft: 6 },
});

/* design-system: DESIGN.md — 합류 승인의 항목별 시트 묶음(근무 형태·시급·월 급여·주휴수당·주 근무시간·입사일·계약·수습·계좌). */
import type { JoinProbationReview } from '../../../types';
import type { OnboardingDraft } from '../../utils/joinOnboarding';
import { koreanDate } from '../../utils/regularWages';
import { ChoiceSheet, AccountSheet, DateSheet, DurationSheet, TextSheet } from './sheets';
import { EMPLOYMENT_CHOICES, INCOME_CHOICES, WEEKLY_REST_CHOICES } from './ChoiceList';
import { ProbationSheet, type ProbationResult } from './ProbationSheet';
import { amountOf } from './approvalValues';
import { initialProbationDraft, type ProbationMonths } from './probationValues';

export type ApprovalSheetKey = 'emp' | 'wage' | 'salary' | 'wk' | 'hours' | 'joined' | 'inc' | 'prob' | 'acct';

export interface ApprovalSheetsProps {
  sheet: ApprovalSheetKey | null;
  draft: OnboardingDraft;
  probation: JoinProbationReview;
  storeMonths: ProbationMonths | null | undefined;
  storeRate: number | null | undefined;
  onDraft: (patch: Partial<OnboardingDraft>, touched?: 'incomeType' | 'weeklyRest') => void;
  onProbation: (value: ProbationResult) => void;
  onClose: () => void;
}

const DECIDED_INCOME = INCOME_CHOICES.filter(choice => choice.value !== 'unknown');
const DECIDED_REST = WEEKLY_REST_CHOICES.filter(choice => choice.value !== 'unknown');

export function ApprovalSheets({ sheet, draft, probation, storeMonths, storeRate, onDraft, onProbation, onClose }: ApprovalSheetsProps) {
  const part = draft.employmentType === 'part_time';
  const done = (patch: Partial<OnboardingDraft>, touched?: 'incomeType' | 'weeklyRest') => { onDraft(patch, touched); onClose(); };
  return <>
    <ChoiceSheet visible={sheet === 'emp'} onClose={onClose} title="근무 형태" options={EMPLOYMENT_CHOICES}
      selected={draft.employmentType} onPick={employmentType => done({ employmentType })} />
    <TextSheet visible={sheet === 'wage'} onClose={onClose} title="시급"
      fields={[{ key: 'wage', label: '시급', value: draft.hourlyWage, money: true }]}
      validate={values => (amountOf(values.wage) ?? 0) > 0 ? null : '시급을 입력해주세요'}
      onConfirm={values => done({ hourlyWage: values.wage })} />
    <TextSheet visible={sheet === 'salary'} onClose={onClose} title="월 급여"
      fields={[{ key: 'base', label: '월 기본급', value: draft.baseSalary, money: true },
        { key: 'nonTax', label: '월 비과세 금액', caption: '그중 비과세', value: draft.nonTaxable, money: true }]}
      validate={values => {
        const base = amountOf(values.base); const nonTax = amountOf(values.nonTax || '0');
        if (!base) return '월급을 입력해주세요';
        return nonTax == null || nonTax > base ? '비과세 금액은 월 급여를 넘을 수 없어요.' : null;
      }}
      onConfirm={values => done({ baseSalary: values.base, nonTaxable: values.nonTax || '0' })} />
    <ChoiceSheet visible={sheet === 'wk'} onClose={onClose} title="시급에 주휴수당이 들어 있나요?" options={DECIDED_REST}
      selected={draft.weeklyRest === 'unknown' ? null : draft.weeklyRest} onPick={weeklyRest => done({ weeklyRest }, 'weeklyRest')} />
    <DurationSheet visible={sheet === 'hours'} onClose={onClose} value={draft.weeklyMinutes} onConfirm={weeklyMinutes => done({ weeklyMinutes })} />
    <DateSheet visible={sheet === 'joined'} onClose={onClose} title="입사일" subtitle="수습 기간은 이날부터 세요."
      value={draft.joinedAt} fallback={koreanDate()} onConfirm={joinedAt => done({ joinedAt })} />
    <ChoiceSheet visible={sheet === 'inc'} onClose={onClose} title="어떤 계약으로 일하나요?" subtitle="근로계약서에 적힌 대로 골라 주세요."
      options={DECIDED_INCOME} selected={draft.incomeType === 'unknown' ? null : draft.incomeType}
      onPick={incomeType => done({ incomeType }, 'incomeType')} />
    <ProbationSheet visible={sheet === 'prob'} onClose={onClose} joinedAt={draft.joinedAt} storeMonths={storeMonths} storeRate={storeRate}
      initial={initialProbationDraft({ isProbation: probation.is_probation, endsOn: probation.probation_ends_on, rate: probation.probation_rate,
        joinedAt: draft.joinedAt, storeMonths, storeRate })}
      wage={{ isPart: part, hourlyWage: part ? amountOf(draft.hourlyWage) : null, monthlySalary: part ? null : amountOf(draft.baseSalary),
        weeklyMinutes: part ? draft.weeklyMinutes : null, weeklyRestIncluded: draft.weeklyRest === 'included' ? true : draft.weeklyRest === 'separate' ? false : null }}
      onConfirm={value => { onProbation(value); onClose(); }} />
    <AccountSheet visible={sheet === 'acct'} onClose={onClose} bankName={draft.bankName} accountNumber={draft.accountNumber}
      onConfirm={({ bankName, accountNumber }) => done({ bankName, accountNumber })} />
  </>;
}

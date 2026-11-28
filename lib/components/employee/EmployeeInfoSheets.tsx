/* design-system: DESIGN.md 「직원 정보 수정(S05)」 — 항목별 시트 묶음. 합류 승인 시트(수습·계좌·휠)를 그대로 쓴다. */
import type { Employee } from '../../../types';
import { koreanDate } from '../../utils/regularWages';
import { AccountSheet, ChoiceSheet, DateSheet, DurationSheet, TextSheet } from '../join/sheets';
import { INCOME_CHOICES, WEEKLY_REST_CHOICES } from '../join/ChoiceList';
import { ProbationSheet } from '../join/ProbationSheet';
import { initialProbationDraft } from '../join/probationValues';
import { formatPhone } from '../join/joinQuestions';
import type { EmployeeStoreDefaults } from './EmployeeInfoModal';
import { DependentsSheet, WageChangeSheet, type WageChangeValue } from './EmployeeSheets';
import { accountPatch, joinedAtPatch, probationPatch, weeklyMinutesOf, weeklyMinutesPatch, type EmployeePatch } from './employeeInfoValues';

export type EmployeeSheetKey = 'name' | 'phone' | 'wage' | 'rest' | 'hours' | 'joined' | 'income' | 'dependents' | 'probation' | 'account';

export interface EmployeeInfoSheetsProps {
  sheet: EmployeeSheetKey | null;
  employee: Employee;
  store?: EmployeeStoreDefaults | null;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: EmployeePatch) => void;
  onChangeWage: (value: WageChangeValue) => void;
}

/** 소득 구분은 근로자 / 프리랜서 3.3%만 고른다. */
const INCOME_OPTIONS = INCOME_CHOICES.filter(choice => choice.value !== 'unknown') as readonly { value: 'employee' | 'freelancer'; title: string; caption?: string; badge?: string }[];
const REST_OPTIONS = WEEKLY_REST_CHOICES.filter(choice => choice.value !== 'unknown') as readonly { value: 'separate' | 'included'; title: string; caption?: string }[];

export function EmployeeInfoSheets({ sheet, employee, store, busy, onClose, onSave, onChangeWage }: EmployeeInfoSheetsProps) {
  const part = employee.employment_type === 'part_time';
  const joinedAt = employee.joined_at ?? '';
  return <>
    <TextSheet visible={sheet === 'name'} onClose={onClose} busy={busy} title="이름"
      fields={[{ key: 'name', label: '이름', value: employee.name, maxLength: 100 }]}
      validate={values => values.name.trim() ? null : '이름을 입력해주세요.'} onConfirm={values => onSave({ name: values.name.trim() })} />
    <TextSheet visible={sheet === 'phone'} onClose={onClose} busy={busy} title="휴대폰 번호"
      fields={[{ key: 'phone', label: '휴대폰 번호', value: formatPhone(employee.phone ?? ''), keyboardType: 'phone-pad', maxLength: 13, placeholder: '010-0000-0000' }]}
      validate={values => !values.phone.trim() || /^01[016789]\d{7,8}$/.test(values.phone.replace(/\D/g, '')) ? null : '휴대폰 번호를 확인해주세요.'}
      onConfirm={values => onSave({ phone: values.phone.replace(/\D/g, '') || null })} />
    <WageChangeSheet visible={sheet === 'wage'} onClose={onClose} busy={busy} isPart={part}
      current={Number(part ? employee.hourly_wage ?? 0 : employee.base_salary)} closeDay={store?.payroll_close_day} joinedAt={employee.joined_at}
      onConfirm={onChangeWage} />
    <ChoiceSheet visible={sheet === 'rest'} onClose={onClose} busy={busy} title="시급에 주휴수당이 들어 있나요?" options={REST_OPTIONS}
      selected={employee.weekly_rest_included == null ? null : employee.weekly_rest_included ? 'included' : 'separate'}
      onPick={value => onSave({ weekly_rest_included: value === 'included' })} />
    <DurationSheet visible={sheet === 'hours'} onClose={onClose} busy={busy} value={weeklyMinutesOf(employee)} onConfirm={minutes => onSave(weeklyMinutesPatch(minutes))} />
    <DateSheet visible={sheet === 'joined'} onClose={onClose} busy={busy} title="입사일" subtitle="수습 기간은 이날부터 세요."
      value={joinedAt} fallback={koreanDate()} onConfirm={date => onSave(joinedAtPatch(employee, date))} />
    <ChoiceSheet visible={sheet === 'income'} onClose={onClose} busy={busy} title="소득 구분" subtitle="근로계약서에 적힌 대로 골라 주세요."
      options={INCOME_OPTIONS} selected={employee.income_type === 'freelancer' ? 'freelancer' : 'employee'} onPick={income_type => onSave({ income_type })} />
    <DependentsSheet visible={sheet === 'dependents'} onClose={onClose} busy={busy} value={employee.dependents} onConfirm={dependents => onSave({ dependents })} />
    <ProbationSheet visible={sheet === 'probation'} onClose={onClose} busy={busy} joinedAt={joinedAt}
      storeMonths={store?.default_probation_months} storeRate={store?.default_probation_rate}
      initial={initialProbationDraft({ isProbation: employee.is_probation, endsOn: employee.probation_ends_on, rate: employee.probation_rate,
        joinedAt, storeMonths: store?.default_probation_months, storeRate: store?.default_probation_rate })}
      wage={{ isPart: part, hourlyWage: part ? employee.hourly_wage : null, monthlySalary: part ? null : employee.base_salary,
        weeklyMinutes: weeklyMinutesOf(employee), weeklyRestIncluded: employee.weekly_rest_included }}
      onConfirm={value => onSave(probationPatch(employee.joined_at, value))} />
    <AccountSheet visible={sheet === 'account'} onClose={onClose} busy={busy} bankName={employee.bank_name ?? ''} accountNumber=""
      currentLast4={employee.account_last4 ?? null} onConfirm={({ bankName, accountNumber }) => onSave(accountPatch(bankName, accountNumber))} />
  </>;
}

import type { Employee } from '../../../types';
import {
  accountPatch, clampDependents, joinedAtPatch, probationPatch, showsDependents, weeklyMinutesPatch,
} from '../../../lib/components/employee/employeeInfoValues';
import { accountText, buildApprovalReview, defaultProbation, minimumWageMessage, probationText, wageCheckDate } from '../../../lib/components/join/approvalValues';
import { formatPhone, joinAnswerText } from '../../../lib/components/join/joinQuestions';
import { EMPTY_ONBOARDING_DRAFT } from '../../../lib/utils/joinOnboarding';

const base = { employment_type: 'regular', income_type: 'employee', weekly_minutes: null, weekly_hours: null, is_probation: false, probation_ends_on: null } as unknown as Employee;

describe('직원 정보 저장 내용', () => {
  it('부양가족은 프리랜서가 아니고 정규직이거나 주 15시간 이상일 때만 보인다', () => {
    expect(showsDependents(base)).toBe(true);
    expect(showsDependents({ ...base, income_type: 'freelancer' })).toBe(false);
    expect(showsDependents({ ...base, employment_type: 'part_time', weekly_minutes: 890 })).toBe(false);
    expect(showsDependents({ ...base, employment_type: 'part_time', weekly_minutes: 900 })).toBe(true);
    expect(showsDependents({ ...base, employment_type: 'part_time', weekly_hours: 15 })).toBe(true);
  });
  it('부양가족은 1~11명으로 맞춘다', () => {
    expect([clampDependents(0), clampDependents(5), clampDependents(12)]).toEqual([1, 5, 11]);
  });
  it('주 근무시간은 분과 호환용 정수 시간(내림)을 같이 보낸다', () => {
    expect(weeklyMinutesPatch(1230)).toEqual({ weekly_minutes: 1230, weekly_hours: 20 });
  });
  it('수습 중 입사일을 바꾸면 시작일을 옮기고 마지막 날을 새 3개월 안으로 맞춘다', () => {
    expect(joinedAtPatch(base, '2026-12-01')).toEqual({ joined_at: '2026-12-01' });
    const probation = { ...base, is_probation: true, probation_ends_on: '2027-03-31' };
    expect(joinedAtPatch(probation, '2026-12-01')).toEqual({ joined_at: '2026-12-01', probation_started_at: '2026-12-01', probation_ends_on: '2027-02-28' });
    expect(joinedAtPatch({ ...probation, probation_ends_on: '2026-11-30' }, '2026-12-01').probation_ends_on).toBe('2026-12-01');
  });
  it('수습을 끄면 기간·비율을 비우고, 켜면 입사일부터 시작한다', () => {
    expect(probationPatch('2026-12-01', { is_probation: true, probation_ends_on: '2026-12-31', probation_rate: 0.9 }))
      .toEqual({ is_probation: true, probation_started_at: '2026-12-01', probation_ends_on: '2026-12-31', probation_rate: 0.9 });
    expect(probationPatch('2026-12-01', { is_probation: false, probation_ends_on: null, probation_rate: null }))
      .toEqual({ is_probation: false, probation_started_at: null, probation_ends_on: null, probation_rate: null });
    expect(probationPatch(null, { is_probation: true, probation_ends_on: '2026-12-31', probation_rate: 0.9 }).is_probation).toBe(false);
  });
  it('계좌번호를 비우면 지금 번호를 그대로 둔다', () => {
    expect(accountPatch('국민은행', '')).toEqual({ bank_name: '국민은행' });
    expect(accountPatch('국민은행', '123456')).toEqual({ bank_name: '국민은행', account_number: '123456' });
  });
});

describe('합류 승인 표시값', () => {
  it('계좌는 짧은 은행 이름과 끝 4자리로 보인다', () => {
    expect(accountText('국민은행', '123456123456')).toBe('국민 ····3456');
    expect(accountText('토스뱅크', '', '9876')).toBe('토스뱅크 ····9876');
    expect(accountText('', '')).toBe('');
  });
  it('매장 기본 수습 기간이 있으면 그 기간과 비율로 적용한다', () => {
    expect(defaultProbation('2026-12-01', 2, 0.85)).toEqual({ is_probation: true, probation_ends_on: '2027-01-31', probation_rate: 0.85 });
    expect(defaultProbation('2026-12-01', null, 0.85).is_probation).toBe(false);
    expect(defaultProbation('', 3, 0.9).is_probation).toBe(false);
    expect(probationText({ is_probation: true, probation_ends_on: '2027-01-31', probation_rate: 0.85 }, 0.9)).toBe('2027년 1월 31일까지 · 85%');
  });
  it('최종 합류 내용에는 수습 여부를 항상 담는다', () => {
    const draft = { ...EMPTY_ONBOARDING_DRAFT, incomeType: 'employee' as const, baseSalary: '3000000', joinedAt: '2026-12-01', bankName: '국민은행', accountNumber: '123456123456' };
    expect(buildApprovalReview(draft, { is_probation: false, probation_ends_on: null, probation_rate: null })).toMatchObject({ is_probation: false, probation_ends_on: null, probation_rate: null });
    expect(buildApprovalReview(draft, { is_probation: true, probation_ends_on: '2026-12-31', probation_rate: 0.9 })).toMatchObject({ is_probation: true, probation_ends_on: '2026-12-31', probation_rate: 0.9 });
    expect(() => buildApprovalReview({ ...draft, incomeType: 'unknown' }, { is_probation: false, probation_ends_on: null, probation_rate: null })).toThrow('근로자인지 프리랜서인지 정해 주세요.');
  });
  it('최저임금 비교일은 입사일이 뒤면 입사일, 아니면 오늘이다', () => {
    expect(wageCheckDate('2027-01-02', '2026-11-28')).toBe('2027-01-02');
    expect(wageCheckDate('2026-01-02', '2026-11-28')).toBe('2026-11-28');
    expect(wageCheckDate('', '2026-11-28')).toBe('2026-11-28');
  });
  it('최저임금보다 적은 시급만 안내하고 기준이 없는 해는 안내하지 않는다', () => {
    const part = { isPart: true, monthly: null, weeklyMinutes: 1200, weeklyRestIncluded: false };
    expect(minimumWageMessage({ ...part, hourly: 9000 }, '2026-11-28')).toMatch(/^2026년 최저임금 시급 .+원보다 적어요\. 그래도 저장할 수 있어요\.$/);
    expect(minimumWageMessage({ ...part, hourly: 20000 }, '2026-11-28')).toBeNull();
    expect(minimumWageMessage({ ...part, hourly: 9000 }, '1999-01-01')).toBeNull();
  });
});

describe('합류 신청 답 요약', () => {
  it('휴대폰 번호를 하이픈으로 나눠 보여 준다', () => {
    expect(formatPhone('01012345678')).toBe('010-1234-5678');
    expect(formatPhone('0101234567')).toBe('010-123-4567');
    expect(formatPhone('010')).toBe('010');
  });
  it('답한 질문을 한 줄로 요약한다', () => {
    const draft = { ...EMPTY_ONBOARDING_DRAFT, incomeType: 'freelancer' as const, weeklyMinutes: 1230, hourlyWage: '13,000', joinedAt: '2026-12-01' };
    const identity = { name: ' 신입 ', phone: '01012345678' };
    expect(joinAnswerText('name', identity, draft, null)).toBe('신입');
    expect(joinAnswerText('employmentType', identity, draft, 'part_time')).toBe('파트타이머');
    expect(joinAnswerText('incomeType', identity, draft, 'part_time')).toBe('프리랜서 3.3%');
    expect(joinAnswerText('weeklyMinutes', identity, draft, 'part_time')).toBe('20시간 30분');
    expect(joinAnswerText('hourlyWage', identity, draft, 'part_time')).toBe('13,000원');
    expect(joinAnswerText('joinedAt', identity, draft, 'part_time')).toBe('2026년 12월 1일(화)');
  });
});

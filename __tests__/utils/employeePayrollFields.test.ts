import { buildPayrollFieldsPayload, EMPTY_PAYROLL_FIELDS, minimumWageNotice, parseWeeklyMinutes, probationEndFor } from '../../lib/utils/employeePayrollFields';

describe('직원 급여 계산 입력', () => {
  it('주 근무시간은 시간+분(10분 단위)으로 받고 비면 null', () => {
    expect(parseWeeklyMinutes('', '')).toBeNull();
    expect(parseWeeklyMinutes('14', '50')).toBe(890);
    expect(() => parseWeeklyMinutes('14', '55')).toThrow('10분 단위');
    expect(() => parseWeeklyMinutes('169', '0')).toThrow('168시간');
  });
  it('수습은 입사일 이후, 3개월 이내만 받는다', () => {
    const form = { ...EMPTY_PAYROLL_FIELDS, is_probation: true, probation_ends_on: '2026-04-30' };
    expect(buildPayrollFieldsPayload(form, false, '2026-03-01')).toMatchObject({ is_probation: true, probation_started_at: '2026-03-01', probation_ends_on: '2026-04-30' });
    expect(() => buildPayrollFieldsPayload({ ...form, probation_ends_on: '2026-06-15' }, false, '2026-03-01')).toThrow('3개월');
    expect(() => buildPayrollFieldsPayload(form, false, null)).toThrow('입사일');
    expect(probationEndFor('2026-03-01', 2)).toBe('2026-04-30');
  });
  it('정규직은 주 근무시간·주휴 값을 저장하지 않는다', () => {
    expect(buildPayrollFieldsPayload({ ...EMPTY_PAYROLL_FIELDS, weekly_hours: '20', weekly_rest_included: true }, false, '2026-01-01'))
      .toMatchObject({ weekly_minutes: null, weekly_rest_included: null, is_probation: false, probation_ends_on: null });
  });
  it('최저임금 미달이면 회색 안내 문구만 돌려준다', () => {
    expect(minimumWageNotice({ isPart: true, hourly: 10_000, monthly: null, weeklyMinutes: 1200, weeklyRestIncluded: false }, '2026-11-27')).toContain('10,320원');
    expect(minimumWageNotice({ isPart: true, hourly: 10_320, monthly: null, weeklyMinutes: 1200, weeklyRestIncluded: false }, '2026-11-27')).toBeNull();
    expect(minimumWageNotice({ isPart: false, hourly: null, monthly: 2_000_000, weeklyMinutes: null, weeklyRestIncluded: null }, '2027-02-01')).toContain('10,700원');
  });
});

import { nextPayPeriodStart, wageChangeDate } from '../../../lib/components/employee/wageChange';

describe('다음 급여 기간 시작일', () => {
  it('마감일이 없으면 다음 달 1일', () => {
    expect(nextPayPeriodStart('2026-11-27', null)).toBe('2026-12-01');
    expect(nextPayPeriodStart('2026-12-31', undefined)).toBe('2027-01-01');
  });
  it('말일 마감(0)이면 다음 달 1일', () => {
    expect(nextPayPeriodStart('2026-11-27', 0)).toBe('2026-12-01');
  });
  it('마감일이 아직 안 지났으면 이번 달 마감 다음 날', () => {
    expect(nextPayPeriodStart('2026-11-10', 25)).toBe('2026-11-26');
    expect(nextPayPeriodStart('2026-11-25', 25)).toBe('2026-11-26');
  });
  it('마감일이 지났으면 다음 달 마감 다음 날', () => {
    expect(nextPayPeriodStart('2026-11-27', 25)).toBe('2026-12-26');
    expect(nextPayPeriodStart('2026-12-27', 25)).toBe('2027-01-26');
  });
  it('그달에 없는 마감일은 그달 말일로 본다', () => {
    expect(nextPayPeriodStart('2027-02-10', 31)).toBe('2027-03-01');
    // 1월 30일 마감이 지났으므로 2월 마감(28일) 다음 날
    expect(nextPayPeriodStart('2027-01-31', 30)).toBe('2027-03-01');
  });
});

describe('바꾼 급여 적용일', () => {
  it('오늘부터 / 다음 급여 기간부터', () => {
    expect(wageChangeDate('today', '2026-11-27', null, '2026-01-01')).toBe('2026-11-27');
    expect(wageChangeDate('next', '2026-11-27', null, '2026-01-01')).toBe('2026-12-01');
  });
  it('입사 전이면 입사일부터', () => {
    expect(wageChangeDate('today', '2026-11-27', null, '2026-12-10')).toBe('2026-12-10');
  });
});

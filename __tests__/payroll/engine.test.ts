import {
  addMonthsInclusiveEnd, comparableHourly, dailyWorkerPay, deductionMode, employeeInsurance, employerBurden,
  estimateWeeklyRest, freelancerWithholding, insuranceRatesFor, isBelowMinimumWage, isProbationOn,
  monthProbationFactor, PayrollStandardMissingError, premium, probationEndDate, type RateTables,
  dailyAssessedTax, dailyPaymentPay, monthWeeklyRest,
} from '../../lib/payroll';

const tables: RateTables = {
  insurance: [{ version: 'T-v1', from: '2026-01-01', to: '2026-12-31', pensionEmployee: 0.0475,
    healthEmployee: 0.03595, longTermCareOfHealth: 0.1314, employmentEmployee: 0.009, sources: [] }],
  pensionBounds: [
    { from: '2025-07-01', to: '2026-06-30', min: 400_000, max: 6_370_000, sources: [] },
    { from: '2026-07-01', to: '2027-06-30', min: 410_000, max: 6_590_000, sources: [] },
  ],
  minimumWage: [{ from: '2026-01-01', to: '2026-12-31', hourly: 10_320, sources: [] }],
  employerExtra: [],
};

describe('수습', () => {
  const base = { is_probation: true, probation_started_at: null, joined_at: '2026-03-15', probation_ends_on: '2026-05-14' };
  it('표시한 직원만, 대상 날짜 기준으로 판단한다', () => {
    expect(isProbationOn(base, '2026-03-15')).toBe(true);
    expect(isProbationOn(base, '2026-05-14')).toBe(true);
    expect(isProbationOn(base, '2026-05-15')).toBe(false);
    expect(isProbationOn({ ...base, is_probation: false }, '2026-04-01')).toBe(false);
    expect(isProbationOn({ ...base, probation_ends_on: null }, '2026-04-01')).toBe(false);
  });
  it('월 계수는 수습일 비율로 가중 평균한다', () => {
    expect(monthProbationFactor(base, '2026-04')).toBe(0.9);
    expect(monthProbationFactor(base, '2026-06')).toBe(1);
    // 5월: 14일 수습, 17일 정상
    expect(monthProbationFactor(base, '2026-05')).toBeCloseTo((14 * 0.9 + 17) / 31, 12);
  });
  it('기간 끝 날짜: n개월은 전날까지, 일 단위는 시작일 포함', () => {
    expect(addMonthsInclusiveEnd('2026-03-15', 1)).toBe('2026-04-14');
    expect(addMonthsInclusiveEnd('2026-01-31', 1)).toBe('2026-02-28'); // 같은 날이 없으면 그 달 말일(민법 160조③)
    expect(probationEndDate('2026-03-01', { kind: 'months', months: 3 })).toBe('2026-05-31');
    expect(probationEndDate('2026-03-01', { kind: 'days', days: 61 })).toBe('2026-04-30');
    expect(probationEndDate('2026-03-01', { kind: 'none' })).toBeNull();
    expect(() => probationEndDate('2026-03-01', { kind: 'days', days: 91 })).toThrow();
  });
});

describe('소득 구분', () => {
  it('3.3%는 프리랜서로 정한 경우뿐이고, 근무시간이 비면 입력을 안내한다', () => {
    expect(deductionMode({ employment_type: 'part_time', weekly_minutes: null })).toBe('needs_hours');
    expect(deductionMode({ employment_type: 'part_time', weekly_minutes: 899 })).toBe('uninsured_employee');
    expect(deductionMode({ employment_type: 'part_time', weekly_minutes: 900 })).toBe('insured');
    expect(deductionMode({ employment_type: 'regular', weekly_minutes: null })).toBe('insured');
    expect(deductionMode({ employment_type: 'part_time', income_type: 'freelancer', weekly_minutes: 2400 })).toBe('freelancer');
  });
});

describe('4대보험', () => {
  it('국민연금 상·하한은 대상 월이 속한 기간 값을 쓴다', () => {
    expect(insuranceRatesFor('2026-06', tables).pensionBounds.max).toBe(6_370_000);
    expect(insuranceRatesFor('2026-07', tables).pensionBounds.max).toBe(6_590_000);
  });
  it('기준이 없는 달은 계산을 막는다', () => {
    expect(() => insuranceRatesFor('2027-01', tables)).toThrow(PayrollStandardMissingError);
  });
  it('장기요양은 건강보험료 × 비율로 계산한다', () => {
    const { rates, pensionBounds } = insuranceRatesFor('2026-03', tables);
    const amounts = employeeInsurance(2_800_000, rates, pensionBounds);
    expect(amounts.health_insurance).toBe(100_660);
    expect(amounts.long_term_care).toBe(premium(100_660, 0.1314));
    expect(amounts.long_term_care).toBe(13_220);
    expect(amounts.national_pension).toBe(133_000);
    expect(amounts.employment_insurance).toBe(25_200);
  });
  it('하한 미만 소득은 하한으로 국민연금을 계산한다', () => {
    const { rates, pensionBounds } = insuranceRatesFor('2026-03', tables);
    expect(employeeInsurance(300_000, rates, pensionBounds).national_pension).toBe(premium(400_000, 0.0475));
  });
  it('부동소수 오차로 10원을 더 깎지 않는다', () => {
    expect(premium(3_000_000, 0.03595)).toBe(107_850);
  });
  it('사업주 부담: 산재 업종이 없으면 null로 남긴다', () => {
    const share = { national_pension: 100, health_insurance: 100, long_term_care: 10, employment_insurance: 50 };
    const stability = { under_150: 0.0025, priority_150_plus: 0.0045, from_150_to_999: 0.0065, over_1000: 0.0085 };
    const none = employerBurden(share, 1_000_000, stability, 'under_150', null);
    expect(none.industrial_accident).toBeNull();
    expect(none.total_known).toBe(260 + 2_500);
    expect(employerBurden(share, 1_000_000, stability, 'under_150', 0.009).industrial_accident).toBe(9_000);
  });
  it('3.3%는 소득세 3%와 지방소득세 10%로 나눈다', () => {
    expect(freelancerWithholding(1_000_000)).toEqual({ income_tax: 30_000, local_income_tax: 3_000 });
  });
});

describe('일용근로자', () => {
  it('일 15만 원 공제, 6%, 55% 감면, 1,000원 미만 미징수', () => {
    expect(dailyWorkerPay(150_000, 0.009)).toMatchObject({ income_tax: 0, local_income_tax: 0, employment_insurance: 1_350 });
    // (187,000-150,000)×2.7% = 999 → 소액부징수
    expect(dailyWorkerPay(187_000, 0.009).income_tax).toBe(0);
    // (200,000-150,000)×2.7% = 1,350 → 1,350
    expect(dailyWorkerPay(200_000, 0.009)).toMatchObject({ income_tax: 1_350, local_income_tax: 130, net_pay: 200_000 - 1_350 - 130 - 1_800 });
  });
  it('잘못된 금액은 거절한다', () => {
    expect(() => dailyWorkerPay(-1, 0.009)).toThrow();
    expect(() => dailyWorkerPay(1.5, 0.009)).toThrow();
  });
});

describe('최저임금·주휴', () => {
  it('주휴 포함 시급은 주휴시간을 빼고 비교한다', () => {
    // 주 40시간, 주휴 포함 12,384원 → 12,384×40/48 = 10,320
    expect(comparableHourly({ hourlyWage: 12_384, weeklyRestIncluded: true, weeklyMinutes: 2400 })).toBeCloseTo(10_320);
    expect(isBelowMinimumWage({ hourlyWage: 12_384, weeklyRestIncluded: true, weeklyMinutes: 2400 }, 10_320)).toBe(false);
    expect(isBelowMinimumWage({ hourlyWage: 12_000, weeklyRestIncluded: true, weeklyMinutes: 2400 }, 10_320)).toBe(true);
    expect(isBelowMinimumWage({ hourlyWage: 10_320, weeklyRestIncluded: false }, 10_320)).toBe(false);
  });
  it('월급제는 209시간 기준으로 비교한다', () => {
    expect(isBelowMinimumWage({ monthlySalary: 2_156_880 }, 10_320)).toBe(false);
    expect(isBelowMinimumWage({ monthlySalary: 2_000_000 }, 10_320)).toBe(true);
  });
  it('주 15시간 이상인 주만 예상 주휴수당을 계산한다', () => {
    const days = [
      { date: '2026-11-02', minutes: 480 }, { date: '2026-11-03', minutes: 480 }, // 월·화 16h
      { date: '2026-11-09', minutes: 600 }, // 다음 주 10h
    ];
    expect(estimateWeeklyRest(days, 10_320)).toEqual([
      { week_start: '2026-11-02', worked_minutes: 960, rest_minutes: 192, amount: 33_024 },
    ]);
  });
});

describe('기본 기간표(고시 확인값)', () => {
  it('2026년 7월부터 국민연금 상·하한이 41만/659만 원이다', () => {
    expect(insuranceRatesFor('2026-06').pensionBounds).toMatchObject({ min: 400_000, max: 6_370_000 });
    expect(insuranceRatesFor('2026-07').pensionBounds).toMatchObject({ min: 410_000, max: 6_590_000 });
  });
  it('2027년은 건강·장기요양·고용보험 요율이 공포되기 전이라 계산을 막는다', () => {
    expect(() => insuranceRatesFor('2027-01')).toThrow(PayrollStandardMissingError);
    try { insuranceRatesFor('2027-01'); } catch (error) { expect((error as PayrollStandardMissingError).item).toBe('health_insurance'); }
  });
});

describe('검토 반영(2026-11-27)', () => {
  it('일용 소득세 1,000원 미만 미징수는 지급 묶음 합계로 판단한다', () => {
    const day = { gross: 187_000, day_income_tax: dailyAssessedTax(187_000), employment_insurance: 1_680 };
    expect(day.day_income_tax).toBe(999);
    expect(dailyPaymentPay([day])).toMatchObject({ income_tax: 0, local_income_tax: 0 });
    expect(dailyPaymentPay(Array(5).fill(day))).toMatchObject({ gross: 935_000, income_tax: 4_990, local_income_tax: 490, employment_insurance: 8_400, net_pay: 921_120 });
  });
  it('국민연금 기준소득월액은 천원 미만을 버린다', () => {
    const { rates, pensionBounds } = insuranceRatesFor('2026-10');
    expect(employeeInsurance(2_345_678, rates, pensionBounds).national_pension).toBe(111_380);
  });
  it('달을 넘는 주는 주휴 계산에서 빼고 따로 센다', () => {
    const days = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']
      .map(date => ({ date, minutes: 420, hourlyWage: 10_320 }));
    expect(monthWeeklyRest(days.filter(d => d.date >= '2026-10-01'), '2026-10')).toEqual({ amount: Math.round(420 * 10_320 / 60), partialWeeks: 1 });
  });
});

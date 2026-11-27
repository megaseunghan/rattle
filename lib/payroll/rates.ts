/**
 * 법정 요율·상하한·최저임금 기간표.
 * 고시 원문으로 확인한 값만 넣는다. 기간표에 없는 달은 계산을 막는다('확인 필요').
 * 값을 바꾸면 계산 버전(version)도 새로 정하고, 이미 작성된 월 명세는 다시 계산하지 않는다.
 */
export interface InsuranceRatePeriod {
  version: string;           // payroll.calculation_version 으로 저장
  from: string;              // 적용 시작일(포함)
  to: string;                // 적용 종료일(포함)
  pensionEmployee: number;   // 국민연금 근로자분(사업주분 같음)
  /** 건강보험 근로자분(사업주분 같음). null = 시행령 공포 전 → 계산을 막는다. */
  healthEmployee: number | null;
  /** 장기요양 = 건강보험료 × 이 비율. null = 시행령 공포 전 → 계산을 막는다. */
  longTermCareOfHealth: number | null;
  /** 고용보험 실업급여 근로자분(사업주분 같음). null = 고시 미확인 → 계산을 막는다. */
  employmentEmployee: number | null;
  sources: string[];
}

export interface PensionBoundPeriod { from: string; to: string; min: number; max: number; sources: string[] }
export interface MinimumWagePeriod { from: string; to: string; hourly: number; sources: string[] }

/** 고용안정·직업능력개발사업 사업주 요율(규모별). */
export type EmployerSizeBand = 'under_150' | 'priority_150_plus' | 'from_150_to_999' | 'over_1000';

export interface EmployerExtraPeriod {
  from: string; to: string;
  employmentStability: Record<EmployerSizeBand, number>;
  sources: string[];
}

export interface RateTables {
  insurance: InsuranceRatePeriod[];
  pensionBounds: PensionBoundPeriod[];
  minimumWage: MinimumWagePeriod[];
  employerExtra: EmployerExtraPeriod[];
}

const NPS = 'https://www.nps.or.kr/pnsinfo/ntpsklg/getOHAF0038M0.do';
const NHIS_2026 = 'https://www.nhis.or.kr/renewal_popup/poster/20260204_poster_longdesc_1.html';
const EI_DECREE = '고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률 시행령 제12조';

/** 2026-11-27 고시·법령 원문 확인(세무사·노무사 확인 아님). */
export const RATE_TABLES: RateTables = {
  insurance: [
    {
      version: '2026-v2', from: '2026-01-01', to: '2026-12-31',
      pensionEmployee: 0.0475, healthEmployee: 0.03595, longTermCareOfHealth: 0.1314, employmentEmployee: 0.009,
      sources: ['국민연금법 부칙(2026년 1천분의 95)', NHIS_2026, '장기요양 소득 대비 0.9448% ÷ 건강 7.19%', EI_DECREE],
    },
    {
      // 2026-11-27 기준 공포 전이라 비워 둔다: 고용보험 실업급여(정부안 1.0%), 건강보험(7.19% 동결 결정),
      // 장기요양(건강보험료 대비 13.90% 의결). 시행령 공포를 확인하면 값과 출처를 넣는다.
      version: '2027-v1', from: '2027-01-01', to: '2027-12-31',
      pensionEmployee: 0.05, healthEmployee: null, longTermCareOfHealth: null, employmentEmployee: null,
      sources: ['국민연금법 부칙(2027년 1천분의 100)', 'https://www.korea.kr/policy/civilView.do?newsId=156780681',
        'https://www.korea.kr/news/policyNewsView.do?newsId=148974757'],
    },
  ],
  pensionBounds: [
    { from: '2024-07-01', to: '2025-06-30', min: 390_000, max: 6_170_000, sources: [NPS] },
    { from: '2025-07-01', to: '2026-06-30', min: 400_000, max: 6_370_000, sources: [NPS] },
    { from: '2026-07-01', to: '2027-06-30', min: 410_000, max: 6_590_000, sources: [NPS] },
  ],
  minimumWage: [
    { from: '2026-01-01', to: '2026-12-31', hourly: 10_320, sources: ['최저임금위원회 2026년 적용 최저임금'] },
    { from: '2027-01-01', to: '2027-12-31', hourly: 10_700, sources: ['https://www.minimumwage.go.kr/minWage/policy/decisionMain.do'] },
  ],
  employerExtra: [
    // 서버 public.employer_insurance_rates와 같은 기간·값(150인 미만 1만분의 25, 2019년 이후 같음).
    { from: '2019-01-01', to: '2026-12-31', sources: [EI_DECREE, 'https://www.comwel.or.kr/comwel/paym/insu/chek3.jsp'],
      employmentStability: { under_150: 0.0025, priority_150_plus: 0.0045, from_150_to_999: 0.0065, over_1000: 0.0085 } },
  ],
};

export class PayrollStandardMissingError extends Error {
  constructor(readonly item: string, readonly date: string) {
    super(`PAYROLL_STANDARD_MISSING:${item}:${date}`);
  }
}

function pick<T extends { from: string; to: string }>(rows: T[], date: string, item: string): T {
  const row = rows.find(r => r.from <= date && date <= r.to);
  if (!row) throw new PayrollStandardMissingError(item, date);
  return row;
}

/** 대상 월 1일 기준으로 적용할 기준을 고른다(국민연금 상하한은 7월 기준으로 바뀐다). */
export type ConfirmedInsuranceRates = InsuranceRatePeriod & { employmentEmployee: number; healthEmployee: number; longTermCareOfHealth: number };

export function insuranceRatesFor(yearMonth: string, tables: RateTables = RATE_TABLES): { rates: ConfirmedInsuranceRates; pensionBounds: PensionBoundPeriod } {
  const date = `${yearMonth}-01`;
  const rates = pick(tables.insurance, date, 'insurance');
  if (rates.healthEmployee == null) throw new PayrollStandardMissingError('health_insurance', date);
  if (rates.longTermCareOfHealth == null) throw new PayrollStandardMissingError('long_term_care', date);
  if (rates.employmentEmployee == null) throw new PayrollStandardMissingError('employment_insurance', date);
  return {
    rates: rates as ConfirmedInsuranceRates,
    pensionBounds: pick(tables.pensionBounds, date, 'pension_bounds'),
  };
}

/** 일용근로자처럼 고용보험만 떼는 경우: 고용보험 요율만 확인한다. */
export function employmentRateFor(yearMonth: string, tables: RateTables = RATE_TABLES): { rate: number; version: string } {
  const date = `${yearMonth}-01`;
  const row = pick(tables.insurance, date, 'insurance');
  if (row.employmentEmployee == null) throw new PayrollStandardMissingError('employment_insurance', date);
  return { rate: row.employmentEmployee, version: row.version };
}

export function minimumWageFor(date: string, tables: RateTables = RATE_TABLES): number {
  return pick(tables.minimumWage, date, 'minimum_wage').hourly;
}

export function employerExtraFor(yearMonth: string, tables: RateTables = RATE_TABLES): EmployerExtraPeriod {
  return pick(tables.employerExtra, `${yearMonth}-01`, 'employer_extra');
}

/** 화면 안내 문구: 어떤 기준이 없어 계산을 막았는지. */
export function missingStandardMessage(error: PayrollStandardMissingError): string {
  const year = error.date.slice(0, 4);
  const label: Record<string, string> = {
    insurance: '4대보험 요율', employment_insurance: '고용보험 요율', health_insurance: '건강보험 요율', long_term_care: '장기요양보험 요율', pension_bounds: '국민연금 상·하한', minimum_wage: '최저임금', employer_extra: '사업주 부담 요율',
  };
  return `${year}년 ${label[error.item] ?? '급여 계산 기준'}을 아직 확인하지 못해 계산할 수 없어요. 앱을 업데이트한 뒤 다시 시도해 주세요.`;
}

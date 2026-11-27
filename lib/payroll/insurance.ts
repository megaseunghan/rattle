import { floorTo } from './period';
import type { ConfirmedInsuranceRates, EmployerSizeBand, PensionBoundPeriod } from './rates';

/** 부동소수 오차(107849.99999…)로 10원이 더 깎이지 않게 소수 넷째 자리에서 정리한 뒤 10원 미만을 버린다. */
export function premium(base: number, rate: number): number {
  // 요율을 백만분율 정수로 바꿔 정수 곱셈 후 10원 미만을 버린다(부동소수 올림 방지).
  const ppm = Math.round(rate * 1_000_000);
  return Math.floor((Math.round(base) * ppm) / 10_000_000) * 10;
}

export interface InsuranceAmounts {
  national_pension: number;
  health_insurance: number;
  long_term_care: number;
  employment_insurance: number;
}

/** 근로자분 4대보험. 장기요양은 건강보험료 기준 법정 산식. */
export function employeeInsurance(taxableBase: number, rates: ConfirmedInsuranceRates, bounds: PensionBoundPeriod): InsuranceAmounts {
  if (taxableBase <= 0) return { national_pension: 0, health_insurance: 0, long_term_care: 0, employment_insurance: 0 };
  // 기준소득월액: 천원 미만 버림(국민연금법 시행령 5조) 후 상·하한 적용.
  const pensionBase = Math.min(Math.max(Math.floor(taxableBase / 1000) * 1000, bounds.min), bounds.max);
  const health = premium(taxableBase, rates.healthEmployee);
  return {
    national_pension: premium(pensionBase, rates.pensionEmployee),
    health_insurance: health,
    long_term_care: premium(health, rates.longTermCareOfHealth),
    employment_insurance: premium(taxableBase, rates.employmentEmployee),
  };
}

export interface EmployerBurden extends InsuranceAmounts {
  employment_stability: number;
  /** 산재보험. 업종을 고르지 않았으면 null('산재보험 미포함'). */
  industrial_accident: number | null;
  total_known: number;
}

/** 사업주 부담 4대보험(예상). 국민연금·건강·장기요양·실업급여는 근로자분과 같다. */
export function employerBurden(
  employeeShare: InsuranceAmounts, taxableBase: number,
  stability: Record<EmployerSizeBand, number>, sizeBand: EmployerSizeBand,
  industrialAccidentRate: number | null,
): EmployerBurden {
  const employment_stability = taxableBase > 0 ? premium(taxableBase, stability[sizeBand]) : 0;
  const industrial_accident = industrialAccidentRate == null ? null : (taxableBase > 0 ? premium(taxableBase, industrialAccidentRate) : 0);
  const base = employeeShare.national_pension + employeeShare.health_insurance + employeeShare.long_term_care + employeeShare.employment_insurance;
  return { ...employeeShare, employment_stability, industrial_accident, total_known: base + employment_stability + (industrial_accident ?? 0) };
}

/** 사업소득 3.3%(소득세 3% + 지방소득세 0.3%). 각각 10원 미만 버림. */
export function freelancerWithholding(gross: number): { income_tax: number; local_income_tax: number } {
  const incomeTax = premium(gross, 0.03);
  return { income_tax: incomeTax, local_income_tax: floorTo(incomeTax * 0.1, 10) };
}

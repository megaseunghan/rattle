import { premium } from './insurance';
import { employerExtraFor, PayrollStandardMissingError, type EmployerSizeBand, type RateTables, RATE_TABLES } from './rates';

export interface EmployerEstimatePayroll {
  gross: number; taxable_base: number; withholding_tax?: number;
  national_pension: number; health_insurance: number; long_term_care: number; employment_insurance: number;
}
export interface EmployerEstimateDaily { gross: number; employment_insurance: number }

/** 산재보험 합산 요율(업종 요율 + 출퇴근재해 + 임금채권부담금 + 확인된 석면분담금). 업종을 고르지 않았으면 null. */
export interface IndustrialAccidentRate { rate: number; commute_rate: number; wage_claim_rate: number; asbestos_rate: number | null }
export function industrialAccidentTotalRate(row: IndustrialAccidentRate | null): number | null {
  if (!row) return null;
  return row.rate + row.commute_rate + row.wage_claim_rate + (row.asbestos_rate ?? 0);
}

export interface EmployerInsuranceEstimate {
  /** 사업주 부담 4대보험(예상). 기준이 없으면 null. */
  amount: number | null;
  industrialAccidentIncluded: boolean;
}

/**
 * 작성한 월 급여 명세와 일용근로자 기록 기준의 사업주 부담 예상액.
 * 국민연금·건강·장기요양·실업급여는 근로자분과 같고, 고용안정·직업능력개발과 산재는 사업주만 낸다.
 */
export function estimateEmployerInsurance(
  payrolls: EmployerEstimatePayroll[], daily: EmployerEstimateDaily[], yearMonth: string,
  industrialAccidentRate: number | null, sizeBand: EmployerSizeBand = 'under_150', tables: RateTables = RATE_TABLES,
): EmployerInsuranceEstimate {
  let stabilityRate: number;
  try { stabilityRate = employerExtraFor(yearMonth, tables).employmentStability[sizeBand]; }
  catch (error) {
    // 부담할 명세·기록이 없으면 0원, 있는데 요율이 없으면 확인 필요(서버 손익 함수와 같은 판단).
    if (error instanceof PayrollStandardMissingError) {
      const hasRows = payrolls.some(p => !(Number(p.withholding_tax ?? 0) > 0)) || daily.length > 0;
      return { amount: hasRows ? null : 0, industrialAccidentIncluded: false };
    }
    throw error;
  }
  let total = 0;
  for (const p of payrolls) {
    // 3.3% 프리랜서(사업소득)는 4대보험·산재 대상이 아니다.
    if (Number(p.withholding_tax ?? 0) > 0) continue;
    const share = Number(p.national_pension) + Number(p.health_insurance) + Number(p.long_term_care) + Number(p.employment_insurance);
    const wageBase = Number(p.taxable_base) > 0 ? Number(p.taxable_base) : Number(p.gross);
    total += share;
    if (Number(p.employment_insurance) > 0) total += premium(Number(p.taxable_base), stabilityRate);
    if (industrialAccidentRate != null) total += premium(wageBase, industrialAccidentRate);
  }
  for (const d of daily) {
    total += Number(d.employment_insurance);
    if (Number(d.employment_insurance) > 0) total += premium(Number(d.gross), stabilityRate);
    if (industrialAccidentRate != null) total += premium(Number(d.gross), industrialAccidentRate);
  }
  return { amount: total, industrialAccidentIncluded: industrialAccidentRate != null };
}

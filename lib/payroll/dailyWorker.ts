import { floorTo } from './period';
import { premium } from './insurance';

/**
 * 일용근로자 원천징수(소득세법 47조② 근로소득공제, 129조①4호 6%, 59조③ 근로소득세액공제 55%, 86조 소액부징수).
 * 소액부징수(1,000원 미만)는 하루가 아니라 '지급금액' 기준으로 판단한다(국세청 일용근로소득 원천징수 안내).
 * 그래서 하루치 산출세액은 기록에 보관하고, 미징수·10원 미만 버림(국고금 관리법 47조)은 지급 묶음에서 정한다.
 * 값은 고시·법령 원문으로 확인한 뒤 바꾼다(세무사 확인 전).
 */
export const DAILY_WORKER_DEDUCTION = 150_000;
export const DAILY_WORKER_TAX_RATE = 0.06;
export const DAILY_WORKER_TAX_CREDIT = 0.55;
export const SMALL_AMOUNT_EXEMPT_BELOW = 1_000;

export interface DailyWorkerPay {
  gross: number;
  income_tax: number;
  local_income_tax: number;
  employment_insurance: number;
  net_pay: number;
}

/** 하루치 산출세액(원 미만 버림, 미징수 판단 전). 부동소수 오차(1349.999…)를 정리한 뒤 버린다. */
export function dailyAssessedTax(gross: number): number {
  if (!Number.isSafeInteger(gross) || gross < 0) throw new Error('INVALID_DAILY_GROSS');
  const taxBase = Math.max(0, gross - DAILY_WORKER_DEDUCTION);
  const assessed = Math.round(taxBase * DAILY_WORKER_TAX_RATE * 10000) / 10000;
  return Math.floor(Math.round((assessed - assessed * DAILY_WORKER_TAX_CREDIT) * 10000) / 10000);
}

/** 지급 묶음의 소득세·지방소득세: 하루치 산출세액 합이 1,000원 미만이면 0, 아니면 10원 미만 버림. */
export function dailyPaymentTax(dayTaxes: number[]): { income_tax: number; local_income_tax: number } {
  const total = dayTaxes.reduce((sum, tax) => sum + tax, 0);
  const incomeTax = total < SMALL_AMOUNT_EXEMPT_BELOW ? 0 : floorTo(total, 10);
  return { income_tax: incomeTax, local_income_tax: incomeTax === 0 ? 0 : floorTo(incomeTax * 0.1, 10) };
}

export interface DailyPaymentEntry { gross: number; day_income_tax: number; employment_insurance: number }

/** 지급 묶음 공제와 실지급액. 고용보험은 각 근무일 기준 요율로 계산한 하루치 합이다. */
export function dailyPaymentPay(entries: DailyPaymentEntry[]): DailyWorkerPay {
  const gross = entries.reduce((sum, e) => sum + e.gross, 0);
  const employment = entries.reduce((sum, e) => sum + e.employment_insurance, 0);
  const tax = dailyPaymentTax(entries.map(e => e.day_income_tax));
  return { gross, ...tax, employment_insurance: employment, net_pay: gross - tax.income_tax - tax.local_income_tax - employment };
}

/** 하루치만 따로 줄 때의 공제. 국민연금·건강보험은 가입 기준(월 8일·60시간 등) 판단이 필요해 계산하지 않는다(화면에 '확인 필요'). */
export function dailyWorkerPay(gross: number, employmentEmployeeRate: number): DailyWorkerPay {
  return dailyPaymentPay([{ gross, day_income_tax: dailyAssessedTax(gross), employment_insurance: premium(gross, employmentEmployeeRate) }]);
}

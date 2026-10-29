import type { EmploymentType, FinancialShareScope } from '../../types';

export const FINANCIAL_SHARE_OPTIONS: { value: FinancialShareScope; title: string; description: string }[] = [
  { value: 'regular_only', title: '직원에게만 공유', description: '승인된 월급제 직원에게 보여줘요.' },
  { value: 'all_staff', title: '직원과 파트타이머에게 공유', description: '직원·파트타이머 모두에게 보여줘요.' },
  { value: 'none', title: '공유하지 않기', description: '구성원은 업무와 본인 급여만 확인해요.' },
];

export function allowsFinancialSharing(scope: FinancialShareScope | undefined, employment: EmploymentType | null | undefined): boolean {
  return !!employment && (scope === 'all_staff' || (scope === 'regular_only' && employment === 'regular'));
}

export function isFinancialRoute(path: string): boolean {
  return /^\/(pos|purchases|expenses|profit-loss)(\/|$)/.test(path);
}

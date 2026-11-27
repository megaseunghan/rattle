import type { Employee, IncomeType } from '../../types';

export type { IncomeType };
/** 주 15시간(900분) 이상이면 4대보험 대상 근로자로 본다. */
export const INSURED_WEEKLY_MINUTES = 15 * 60;

export type DeductionMode =
  | 'insured'            // 근로자, 4대보험 + 간이세액표
  | 'uninsured_employee' // 근로자, 주 15시간 미만: 4대보험 없이 간이세액표만
  | 'freelancer'         // 사업소득 3.3%
  | 'needs_hours';       // 파트타이머인데 주 근무시간이 비어 있음: 공제하지 않고 입력을 안내

export type IncomeEmployee = Pick<Employee, 'employment_type'> & {
  income_type?: IncomeType | null;
  weekly_minutes?: number | null;
};

/** 근무시간으로 3.3%를 자동 결정하지 않는다. 3.3%는 사장님이 프리랜서로 정한 경우뿐이다. */
export function deductionMode(employee: IncomeEmployee): DeductionMode {
  if (employee.income_type === 'freelancer') return 'freelancer';
  if (employee.employment_type === 'regular') return 'insured';
  if (employee.weekly_minutes == null) return 'needs_hours';
  return employee.weekly_minutes >= INSURED_WEEKLY_MINUTES ? 'insured' : 'uninsured_employee';
}

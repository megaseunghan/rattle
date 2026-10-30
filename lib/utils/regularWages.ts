import type { Employee, Payroll, WageHistory } from '../../types';

/** The stored timeline is a calculation snapshot, never a join to today's employee conditions. */
export interface RegularWageSnapshot {
  version: 1;
  year_month: string;
  employment_start: string | null;
  days: { date: string; base_salary: number; non_taxable: number; factor: number }[];
}
type WageEmployee = Pick<Employee, 'id' | 'store_id' | 'joined_at' | 'created_at' | 'base_salary' | 'hourly_wage' | 'non_taxable'>;
export function koreanDate(date = new Date()): string {
  return new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}
export function initialWageDate(employee: WageEmployee): string {
  if (employee.joined_at) return employee.joined_at;
  const created = new Date(employee.created_at);
  if (!Number.isFinite(created.getTime())) throw new Error('MISSING_EMPLOYMENT_DATE');
  return koreanDate(created);
}
export function sortWages(history: WageHistory[]): WageHistory[] {
  return [...history].sort((a, b) => a.effective_date.localeCompare(b.effective_date)
    || (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id));
}
/** Latest version per effective date wins. The first known rate starts at hire, not data-entry day. */
export function normalizeWageHistory(employee: WageEmployee, history: WageHistory[]): WageHistory[] {
  const byDate = new Map<string, WageHistory>();
  for (const row of sortWages(history)) byDate.set(row.effective_date, row);
  const sorted = [...byDate.values()];
  const start = initialWageDate(employee);
  if (sorted[0] && sorted[0].effective_date <= start) return sorted;
  const first = sorted[0];
  return [{ id: `baseline:${employee.id}`, employee_id: employee.id, store_id: employee.store_id,
    effective_date: start, base_salary: first ? first.base_salary : employee.base_salary,
    hourly_wage: first ? first.hourly_wage : employee.hourly_wage,
    non_taxable: first ? first.non_taxable : employee.non_taxable,
    memo: '입사일 기준 최초 급여', created_at: employee.created_at }, ...sorted];
}
export function buildRegularWageSnapshot(employee: WageEmployee, history: WageHistory[], yearMonth: string, factor = 1): RegularWageSnapshot {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth) || !Number.isFinite(factor) || factor < 0) throw new Error('INVALID_WAGE_PERIOD');
  const [year, month] = yearMonth.split('-').map(Number);
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = initialWageDate(employee);
  const rates = normalizeWageHistory(employee, history);
  const days: RegularWageSnapshot['days'] = [];
  for (let day = 1; day <= count; day++) {
    const date = `${yearMonth}-${String(day).padStart(2, '0')}`;
    if (date < start) continue;
    const rate = rates.filter(row => row.effective_date <= date).at(-1);
    if (!rate || rate.base_salary == null || rate.non_taxable == null || !Number.isFinite(Number(rate.base_salary)) || !Number.isFinite(Number(rate.non_taxable)) || Number(rate.base_salary) < 0 || Number(rate.non_taxable) < 0) throw new Error('INVALID_WAGE_RATE');
    days.push({ date, base_salary: Number(rate.base_salary), non_taxable: Number(rate.non_taxable), factor });
  }
  return { version: 1, year_month: yearMonth, employment_start: start, days };
}
export function regularSnapshotGross(snapshot: RegularWageSnapshot, through?: string): number {
  const [year, month] = snapshot.year_month.split('-').map(Number);
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.round(snapshot.days.reduce((sum, day) => sum + (!through || day.date <= through ? day.base_salary * day.factor / count : 0), 0));
}
/** Existing monthly slips are preserved. Legacy current-month slips use a clearly labelled day estimate. */
export function accruedRegularPayroll(employee: WageEmployee | undefined, history: WageHistory[], payroll: (Payroll & { regular_wage_snapshot?: RegularWageSnapshot | null }) | undefined,
  yearMonth: string, asOf: Date, factor = 1): number {
  const through = koreanDate(asOf);
  if (through.slice(0, 7) < yearMonth) return 0;
  if (payroll && through.slice(0, 7) > yearMonth) return Number(payroll.gross);
  if (payroll?.regular_wage_snapshot) return regularSnapshotGross(payroll.regular_wage_snapshot, through);
  if (payroll) {
    const [year, month] = yearMonth.split('-').map(Number);
    const monthEnd = `${yearMonth}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`;
    const start = [yearMonth + '-01', employee ? initialWageDate(employee) : yearMonth + '-01'].sort().at(-1)!;
    if (start > monthEnd || through < start) return 0;
    const fullDays = Math.round((Date.parse(monthEnd) - Date.parse(start)) / 86400000) + 1;
    const elapsed = Math.min(fullDays, Math.round((Date.parse(through) - Date.parse(start)) / 86400000) + 1);
    return Math.round(Number(payroll.gross) * elapsed / fullDays);
  }
  if (!employee) throw new Error('MISSING_EMPLOYEE');
  return regularSnapshotGross(buildRegularWageSnapshot(employee, history, yearMonth, factor), through);
}

/** Non-taxable allowance uses the saved monthly conditions, prorated for employed calendar days. */
export function regularSnapshotNonTaxable(snapshot: RegularWageSnapshot): number {
  const [year, month] = snapshot.year_month.split('-').map(Number);
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.round(snapshot.days.reduce((sum, day) => sum + day.non_taxable / count, 0));
}

/** A historical hourly slip must not also accrue as salary after an employment-type change. */
export function regularEmployeesForAccrual(employees: Employee[], hourlyPayrolls: Payroll[]): Employee[] {
  const hourlyIds = new Set(hourlyPayrolls.map(payroll => payroll.employee_id));
  return employees.filter(employee => employee.employment_type !== 'part_time' && !hourlyIds.has(employee.id));
}

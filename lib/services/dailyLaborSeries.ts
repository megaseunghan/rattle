import type { DailyWorkRecord, DailyWorkSnapshot, Employee, Payroll, WageHistory } from '../../types';
import type { RegularWageSnapshot } from '../utils/regularWages';
import { koreanDate, sortWages } from '../utils/regularWages';
import { supabase } from '../supabase';

export type LaborGap = 'legacy_monthly' | 'missing_wage' | 'employment_history' | 'missing_work' | 'invalid_snapshot';
export interface LaborSources {
  employees: Pick<Employee, 'id' | 'store_id' | 'joined_at' | 'is_active' | 'employment_type' | 'is_resigned_during_probation'>[];
  payrolls: Payroll[];
  dailyWork: Pick<DailyWorkRecord, 'id' | 'store_id' | 'employee_id' | 'work_date' | 'revision' | 'status'>[];
  wages: WageHistory[];
  monthlyLaborCost?: number | null;
}
export interface DailyLaborDay {
  date: string;
  amount: number | null;
  cumulative: number | null;
  gaps: LaborGap[];
  workStates: ('missing' | 'pending' | 'rejected' | 'approved_unapplied' | 'applied' | 'applied_changed')[];
}
const validAmount = (n: unknown) => n != null && Number.isFinite(Number(n)) && Number(n) >= 0;
// Exact decimal arithmetic matches PostgreSQL numeric at half-won boundaries.
function fraction(value: number): [bigint, bigint] {
  const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
  const [whole, decimal = ''] = mantissa.split('.');
  const scale = decimal.length - Number(exponent);
  const digits = BigInt(whole + decimal);
  return scale >= 0 ? [digits, 10n ** BigInt(scale)] : [digits * 10n ** BigInt(-scale), 1n];
}
function dates(month: string): string[] {
  if (!/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('INVALID_LABOR_PERIOD');
  const [y, m] = month.split('-').map(Number);
  return Array.from({ length: new Date(Date.UTC(y, m, 0)).getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}
/** Calendar dates in Korea, not POS closing-time buckets. No shared-member source reads.
 * Regular rounding uses differences of rounded cumulative accrual: every prefix matches
 * regular_snapshot_gross and the full month matches the saved snapshot gross.
 */
export function buildDailyLaborSeries(storeId: string, month: string, through: number, sources: LaborSources, asOf = new Date()) {
  const calendar = dates(month);
  if (!Number.isInteger(through) || through < 1 || through > calendar.length || !Number.isFinite(asOf.getTime())) throw new Error('INVALID_LABOR_PERIOD');
  const scopeRows = [...sources.employees, ...sources.payrolls, ...sources.dailyWork, ...sources.wages];
  if (scopeRows.some(row => row.store_id !== storeId) || sources.payrolls.some(p => p.year_month !== month)
    || sources.dailyWork.some(d => !calendar.includes(d.work_date))) throw new Error('LABOR_SCOPE_MISMATCH');
  const unique = (keys: string[]) => new Set(keys).size === keys.length;
  if (!unique(sources.payrolls.map(p => p.employee_id)) || !unique(sources.employees.map(e => e.id))
    || !unique(sources.dailyWork.map(d => `${d.employee_id}:${d.work_date}`))) throw new Error('DUPLICATE_LABOR_SOURCE');
  const days: DailyLaborDay[] = calendar.map(date => ({ date, amount: 0, cumulative: 0, gaps: [], workStates: [] }));
  const gap = (indices: number[], reason: LaborGap) => indices.forEach(i => { days[i].amount = null; if (!days[i].gaps.includes(reason)) days[i].gaps.push(reason); });
  const add = (i: number, amount: number) => { if (days[i].amount !== null) days[i].amount! += amount; };
  const all = calendar.map((_, i) => i);
  const ids = new Set([...sources.employees.map(e => e.id), ...sources.payrolls.map(p => p.employee_id), ...sources.dailyWork.map(d => d.employee_id)]);
  for (const id of ids) {
    const employee = sources.employees.find(e => e.id === id);
    const payroll = sources.payrolls.find(p => p.employee_id === id);
    const rows = sources.dailyWork.filter(d => d.employee_id === id);
    if (payroll?.regular_wage_snapshot && payroll.daily_work_snapshot != null) { gap(all, 'invalid_snapshot'); continue; }
    let regular: RegularWageSnapshot | null = payroll?.regular_wage_snapshot ?? null;
    const hourly = payroll?.daily_work_snapshot != null || payroll?.applied_hourly_wage != null || payroll?.work_source === 'legacy_attendance' || (!payroll?.regular_wage_snapshot && employee?.employment_type === 'part_time');
    if (payroll && !regular && payroll.daily_work_snapshot == null) { gap(all, 'legacy_monthly'); continue; }
    if (!payroll && !hourly) {
      // Inactive status has no effective termination date. Never invent a past end date.
      if (!employee?.joined_at || !employee.is_active) { gap(all, 'employment_history'); continue; }
      const history = sortWages(sources.wages.filter(w => w.employee_id === id));
      const factor = employee.is_resigned_during_probation ? 0.8 : asOf.getTime() < Date.parse(`${employee.joined_at}T00:00:00Z`) + 61 * 86400000 ? 0.9 : 1;
      regular = { version: 1, year_month: month, employment_start: employee.joined_at, days: [] };
      for (const date of calendar) {
        if (date < employee.joined_at || date > koreanDate(asOf)) continue;
        const rate = history.filter(w => w.effective_date <= date).at(-1);
        if (!rate || !validAmount(rate.base_salary)) { gap([calendar.indexOf(date)], 'missing_wage'); continue; }
        regular.days.push({ date, base_salary: Number(rate.base_salary), non_taxable: Number(rate.non_taxable), factor });
      }
    }
    if (regular) {
      const entries = regular.days;
      if (regular.version !== 1 || regular.year_month !== month || !unique(entries.map(d => d.date)) || entries.some(d => !calendar.includes(d.date) || !validAmount(d.base_salary) || !validAmount(d.factor))) { gap(all, 'invalid_snapshot'); continue; }
      let numerator = 0n, denominator = 1n, rounded = 0;
      for (const date of calendar) {
        const row = entries.find(d => d.date === date);
        if (row) {
          const [salary, salaryScale] = fraction(Number(row.base_salary));
          const [factor, factorScale] = fraction(Number(row.factor));
          const scale = salaryScale * factorScale * BigInt(calendar.length);
          numerator = numerator * scale + salary * factor * denominator;
          denominator *= scale;
        }
        const next = Number((2n * numerator + denominator) / (2n * denominator));
        add(calendar.indexOf(date), next - rounded); rounded = next;
      }
      if (payroll && rounded !== Number(payroll.gross)) gap(all, 'invalid_snapshot');
      continue;
    }
    const snapshot = payroll?.daily_work_snapshot ?? [];
    if (!unique(snapshot.map(d => d.work_date)) || snapshot.some(d => !calendar.includes(d.work_date) || d.status !== 'approved' || d.worked_minutes == null || !Number.isInteger(Number(d.worked_minutes)) || Number(d.worked_minutes) < 0 || Number(d.worked_minutes) > 1440 || !validAmount(d.applied_hourly_wage) || Number(d.gross) !== Math.round(Number(d.worked_minutes) * Number(d.applied_hourly_wage) / 60))
      || (payroll && snapshot.reduce((sum, d) => sum + Number(d.gross), 0) !== Number(payroll.gross))) { gap(all, 'invalid_snapshot'); continue; }
    calendar.forEach((date, i) => {
      const saved: DailyWorkSnapshot | undefined = snapshot.find(d => d.work_date === date);
      const current = rows.find(d => d.work_date === date);
      if (saved) {
        add(i, Number(saved.gross));
        days[i].workStates.push(current && (current.id !== saved.id || current.revision !== saved.revision) ? 'applied_changed' : 'applied');
      } else if (employee?.joined_at && date < employee.joined_at) {
        // Confirmed pre-employment dates are zero; absent work dates otherwise are unknown.
      } else {
        gap([i], 'missing_work');
        days[i].workStates.push(!current ? 'missing' : current.status === 'approved' ? 'approved_unapplied' : current.status);
      }
    });
  }
  let cumulative: number | null = 0;
  for (const day of days) { cumulative = cumulative === null || day.amount === null ? null : cumulative + day.amount; day.cumulative = cumulative; }
  const selected = days.slice(0, through);
  return { storeId, month, through: calendar[through - 1], days: selected, total: selected.at(-1)!.cumulative,
    availability: selected.some(d => d.amount === null) ? 'incomplete' as const : 'complete' as const,
    reconciliation: { monthlyLaborCost: sources.monthlyLaborCost == null ? null : Number(sources.monthlyLaborCost),
      difference: selected.at(-1)!.cumulative == null || sources.monthlyLaborCost == null ? null : selected.at(-1)!.cumulative! - Number(sources.monthlyLaborCost),
      reasons: selected.some(d => d.amount === null) ? ['incomplete_daily_coverage'] : through < calendar.length ? ['daily_cutoff_vs_monthly_summary'] : ['monthly_summary_may_use_as_of_accrual_or_full_hourly_payroll'],
    },
    savedMonthlyGross: sources.payrolls.reduce((sum, p) => sum + Number(p.gross), 0),
    basis: 'Korean calendar date; saved payroll snapshots; unposted work excluded; no legacy allocation' as const };
}
/** Stateless, one atomic server read. Caller owns scope-keyed cancellation/cache; errors never fall back. */
export async function getDailyLaborSeries(storeId: string, month: string, through: number, asOf = new Date()) {
  const calendar = dates(month);
  if (!Number.isInteger(through) || through < 1 || through > calendar.length) throw new Error('INVALID_LABOR_PERIOD');
  const { data, error } = await supabase.rpc('get_daily_labor_sources', { p_store_id: storeId, p_year_month: month });
  if (error) throw error;
  if (!data) throw new Error('MISSING_LABOR_SOURCE');
  return buildDailyLaborSeries(storeId, month, through, data as LaborSources, asOf);
}

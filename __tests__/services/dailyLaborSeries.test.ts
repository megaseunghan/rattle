import { buildDailyLaborSeries, getDailyLaborSeries, LaborSources } from '../../lib/services/dailyLaborSeries';
import { supabase } from '../../lib/supabase';
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
const now = new Date('2026-11-30T15:00:00Z');
const source = (patch: Partial<LaborSources> = {}): LaborSources => ({ employees: [], payrolls: [], dailyWork: [], wages: [], ...patch });
const employee = (patch = {}) => ({ id: 'e', store_id: 's', joined_at: '2026-01-01', employment_type: 'regular', is_active: true, ...patch } as any);
const payroll = (patch = {}) => ({ id: 'p', store_id: 's', employee_id: 'e', year_month: '2026-11', gross: 100, ...patch } as any);
const run = (s: LaborSources, through = 30) => buildDailyLaborSeries('s', '2026-11', through, s, now);
const regular = (salary = 100) => ({ version: 1, year_month: '2026-11', employment_start: '2026-01-01', days: Array.from({ length: 30 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, base_salary: salary, non_taxable: 0, factor: 1 })) });
const day = (patch = {}) => ({ id: 'd', revision: 2, work_date: '2026-11-01', worked_minutes: 1, applied_hourly_wage: 10000, gross: 167, status: 'approved', ...patch });
test('regular snapshot rounded prefixes and monthly sum remain authoritative after departure/current wage changes', () => {
 const s = source({ employees: [employee({ is_active: false, base_salary: 999999 })], payrolls: [payroll({ regular_wage_snapshot: regular() })] });
 expect(run(s).total).toBe(100); expect(run(s, 1).total).toBe(3); expect(run(s, 2).total).toBe(7);
});
test('mid-month conditions and probation use saved daily values', () => {
 const snap = regular(3000); snap.days = snap.days.slice(10).map((d, i) => ({ ...d, base_salary: i < 5 ? 3000 : 6000, factor: 0.8 }));
 const result = run(source({ payrolls: [payroll({ gross: 2800, regular_wage_snapshot: snap })] }));
 expect(result.total).toBe(2800); expect(result.days[9].amount).toBe(0); expect(result.days[10].amount).toBe(80);
});
test('legacy zero/month totals never allocated and mismatched snapshot invalid', () => {
 expect(run(source({ payrolls: [payroll({ gross: 0 })] })).total).toBeNull();
 expect(run(source({ payrolls: [payroll({ gross: 101, regular_wage_snapshot: regular() })] })).days[0].gaps).toContain('invalid_snapshot');
});
test('approved snapshot cost survives corrected pending revision without double count', () => {
 const s = source({ employees: [employee({ employment_type: 'part_time' })], payrolls: [payroll({ gross: 167, daily_work_snapshot: [day()] })], dailyWork: [{ ...day({ revision: 3, status: 'pending', gross: 999 }), store_id: 's', employee_id: 'e' } as any] });
 expect(run(s, 1).total).toBe(167); expect(run(s, 1).days[0].workStates).toEqual(['applied_changed']);
 expect(run(s, 2).total).toBeNull();
});
test.each(['pending', 'rejected'])('unapplied %s work stays unknown', status => {
 const result = run(source({ employees: [employee({ employment_type: 'part_time' })], dailyWork: [{ ...day({ status }), store_id: 's', employee_id: 'e' } as any] }), 1);
 expect(result.total).toBeNull(); expect(result.days[0].workStates).toContain(status === 'approved' ? 'approved_unapplied' : status);
});
test('explicit applied zero differs from missing and daily rounding 167+167=334', () => {
 const s = source({ payrolls: [payroll({ gross: 334, daily_work_snapshot: [day(), day({ id: 'd2', work_date: '2026-11-02' }), day({ id: 'd3', work_date: '2026-11-03', worked_minutes: 0, gross: 0 })] })] });
 expect(run(s, 3).total).toBe(334); expect(run(s, 3).days[2].amount).toBe(0); expect(run(s, 4).total).toBeNull();
});
test('missing wage is not backfilled with current salary; historical rates accrue', () => {
 expect(run(source({ employees: [employee({ base_salary: 3000 })] })).total).toBeNull();
 const wages = [{ id: 'w', store_id: 's', employee_id: 'e', effective_date: '2026-01-01', base_salary: 3000, non_taxable: 0 } as any];
 expect(run(source({ employees: [employee()], wages })).total).toBe(3000);
 expect(run(source({ employees: [employee({ is_active: false })], wages })).total).toBeNull();
});
test('short month and duplicate/scope/date validation', () => {
 expect(buildDailyLaborSeries('s', '2024-02', 29, source()).days).toHaveLength(29);
 expect(() => buildDailyLaborSeries('s', '2026-02', 29, source())).toThrow();
 expect(() => run(source({ payrolls: [payroll(), payroll()] }))).toThrow('DUPLICATE');
 expect(() => run(source({ payrolls: [payroll({ store_id: 'other' })] }))).toThrow('SCOPE');
});
test('read failure including forbidden never falls back', async () => {
 (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: new Error('FORBIDDEN') });
 await expect(getDailyLaborSeries('s', '2026-11', 1)).rejects.toThrow('FORBIDDEN');
 expect(supabase.rpc).toHaveBeenCalledWith('get_daily_labor_sources', { p_store_id: 's', p_year_month: '2026-11' });
});

test('Postgres numeric half-won boundary is exact', () => {
 const snap = regular(3000005); snap.days.forEach(d => d.factor = 0.9);
 expect(run(source({ payrolls: [payroll({ gross: 2700005, regular_wage_snapshot: snap })] })).total).toBe(2700005);
});

test('monthly baseline reconciles and partial-day difference is explicit', () => {
 const s = source({ payrolls: [payroll({ regular_wage_snapshot: regular() })], monthlyLaborCost: 100 });
 expect(run(s).reconciliation.difference).toBe(0);
 expect(run(s, 1).reconciliation.difference).toBe(-97);
 expect(run(s, 1).reconciliation.reasons).toContain('daily_cutoff_vs_monthly_summary');
});
test('contradictory snapshot types are invalid', () => {
 expect(run(source({ payrolls: [payroll({ regular_wage_snapshot: regular(), daily_work_snapshot: [] })] })).total).toBeNull();
});
test('out-of-order RPC resolutions preserve each request scope without shared mutable state', async () => {
 let resolveFirst!: (value: unknown) => void;
 (supabase.rpc as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
  .mockResolvedValueOnce({ data: source(), error: null });
 const first = getDailyLaborSeries('s', '2026-11', 1, now);
 const second = await getDailyLaborSeries('other', '2026-10', 2, now);
 resolveFirst({ data: source(), error: null });
 expect(second.storeId).toBe('other'); expect(second.month).toBe('2026-10');
 expect((await first).storeId).toBe('s');
});

test('명세 없는 PT는 승인 일별 당시 금액을 반영하고 현재 시급으로 덮지 않는다', () => {
 const s=source({employees:[employee({employment_type:'part_time',hourly_wage:99999})],dailyWork:[{...day(),store_id:'s',employee_id:'e',record_source:'qr_auto',auto_applied_at:'2026-11-01T01:00:00Z'} as any]});
 expect(run(s,1).total).toBe(167);
 expect(run(s,1).days[0].workStates).toContain('applied');
 expect(run(s,2).total).toBeNull();
});
test('DB projection은 실제 명세와 중복 합산하지 않으며 실패 날짜는 snapshot이 있어도 미확인이다', () => {
 const s=source({employees:[employee({employment_type:'part_time'})],payrolls:[payroll({gross:167,daily_work_snapshot:[day()],source_kind:'approved_daily_projection'})],dailyWork:[{...day(),store_id:'s',employee_id:'e'} as any],attendanceWorkFailures:[{store_id:'s',employee_id:'e',work_date:'2026-11-02',state:'failed',error_code:'DAILY_WORK_RATE_REQUIRED',updated_at:'2026-11-02T01:00:00Z'}],monthlyLaborCost:null});
 expect(run(s,1).total).toBe(167);
 const result=run(s,2); expect(result.days[1].amount).toBeNull();
 expect(result.days[1].gaps).toContain('attendance_work_failed');
 expect(result.total).toBeNull(); expect(result.reconciliation.monthlyLaborCost).toBeNull();
});
test('일별 행이 없는 실패 날짜와 명세 보존 날짜도 0원/확정액으로 위조하지 않는다', () => {
 const s=source({payrolls:[payroll({gross:167,daily_work_snapshot:[day()]})],attendanceWorkFailures:[{store_id:'s',employee_id:'e',work_date:'2026-11-01',state:'failed',error_code:'ATTENDANCE_WORK_WRITE_FAILED',updated_at:'2026-11-01T01:00:00Z'}]});
 expect(run(s,1).total).toBeNull(); expect(run(s,1).days[0].gaps).toContain('attendance_work_failed');
 expect(()=>run({...s,attendanceWorkFailures:[{...s.attendanceWorkFailures![0],store_id:'other'}]})).toThrow('SCOPE');
});

describe('일용근로자 하루 기록', () => {
  it('근무일 금액에 더하고 다른 매장·다른 달 기록은 거절한다', () => {
    const base = { employees: [], payrolls: [], dailyWork: [], wages: [], monthlyLaborCost: 200000 };
    const series = buildDailyLaborSeries('s', '2026-10', 31, { ...base, dailyLaborEntries: [{ store_id: 's', work_date: '2026-10-03', gross: 200000 }] }, new Date('2026-11-01T00:00:00Z'));
    expect(series.days[2].amount).toBe(200000);
    expect(series.total).toBe(200000);
    expect(() => buildDailyLaborSeries('s', '2026-10', 31, { ...base, dailyLaborEntries: [{ store_id: 'x', work_date: '2026-10-03', gross: 1 }] })).toThrow('LABOR_SCOPE_MISMATCH');
    expect(() => buildDailyLaborSeries('s', '2026-10', 31, { ...base, dailyLaborEntries: [{ store_id: 's', work_date: '2026-11-01', gross: 1 }] })).toThrow('LABOR_SCOPE_MISMATCH');
  });
});

import { dailyWorkSnapshot, dailyWorkTotals, parseDailyMinutes, saveDailyWork, applyDailyPayroll } from '../../lib/services/dailyWork';
import { DailyWorkRecord, Employee } from '../../types';
const mockRpc = jest.fn();
const mockCalculate = jest.fn();
const mockInvalidate = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));
jest.mock('../../lib/services/payroll', () => ({ calculatePayroll: (...args: unknown[]) => mockCalculate(...args) }));
jest.mock('../../lib/services/cacheInvalidation', () => ({ invalidateCachedStore: (...args: unknown[]) => mockInvalidate(...args) }));
const row = (date: string, gross: number, status: DailyWorkRecord['status'] = 'approved') => ({ id: date, revision: 1, work_date: date, worked_minutes: 1, applied_hourly_wage: 10000, gross, status, store_id: 's', employee_id: 'e', note: '실근무', submitted_by: 'u', reviewed_by: null, review_note: null, updated_at: '' } as DailyWorkRecord);
beforeEach(() => { jest.clearAllMocks(); mockInvalidate.mockResolvedValue(undefined); });
test('minutes accepts explicit zero and bounds without silently fixing input', () => {
  expect(parseDailyMinutes('0')).toBe(0); expect(parseDailyMinutes('1440')).toBe(1440);
  for (const value of ['', '-1', '1.5', '1,440', '1441']) expect(() => parseDailyMinutes(value)).toThrow();
});
test('monthly sums stored per-day rounded amounts instead of averaging rates', () => {
  const rows = [row('2026-10-02', 167), row('2026-10-01', 167), row('2026-10-03', 200, 'pending')];
  expect(dailyWorkTotals(rows)).toEqual({ minutes: 2, gross: 334, pending: 1 });
  expect(dailyWorkSnapshot(rows).map(x => x.work_date)).toEqual(['2026-10-01','2026-10-02','2026-10-03']);
  expect(rows[0].work_date).toBe('2026-10-02');
});
test('day save sends revision and server resolves rate; conflict is actionable', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'DAILY_WORK_CHANGED' } });
  await expect(saveDailyWork('e','2026-10-02','480','휴게 제외',2)).rejects.toThrow('다른 곳');
  expect(mockRpc).toHaveBeenCalledWith('save_daily_work', { p_employee_id: 'e', p_work_date: '2026-10-02', p_minutes: 480, p_note: '휴게 제외', p_revision: 2 });
});
test('monthly apply passes exact stored sum, never treats successful write as failed cache refresh', async () => {
  const employee = { id: 'e', store_id: 's', employment_type: 'part_time' } as Employee;
  mockCalculate.mockResolvedValue({ gross: 334, net_pay: 334 });
  mockRpc.mockResolvedValue({ data: { id: 'pay', gross: 334 }, error: null });
  mockInvalidate.mockRejectedValue(new Error('cache'));
  const saved = await applyDailyPayroll(employee,'2026-10',[row('2026-10-01',167),row('2026-10-02',167)]);
  expect(mockCalculate).toHaveBeenCalledWith(employee,{ minutes: 0, hourlyWage: 1 },'2026-10',334);
  expect(saved.cacheRefreshFailed).toBe(true);
  expect(mockRpc.mock.calls[0][1].p_revision).toBe(null);
});
test('pending day blocks apply before tax and database calls', async () => {
  await expect(applyDailyPayroll({ id:'e',store_id:'s' } as Employee,'2026-10',[row('2026-10-01',100,'pending')])).rejects.toThrow('모든 날짜');
  expect(mockCalculate).not.toHaveBeenCalled(); expect(mockRpc).not.toHaveBeenCalled();
});

import { getWeeklyCleaningProgress, getWeeklyScheduleBreakdown } from '../../lib/services/adminDashboard';
import { reviewScheduleRequest } from '../../lib/services/schedule';
import type { ScheduleRequest } from '../../types';
const mockFrom = jest.fn();
const mockInvalidate = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: { from: (...args: unknown[]) => mockFrom(...args), auth: { getUser: async () => ({ data: { user: { id: 'reviewer' } } }) } } }));
jest.mock('../../lib/services/cacheInvalidation', () => ({ invalidateCachedStore: (...args: unknown[]) => mockInvalidate(...args) }));
jest.mock('../../lib/services/homeFinancialSummary', () => ({ getFinancialSummaries: jest.fn() }));
jest.mock('../../lib/query/financial', () => ({ fetchFinancialSummary: jest.fn() }));
function query(data: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select','eq','gte','lte','order']) chain[method] = jest.fn(() => chain);
  chain.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve, reject);
  return chain as Record<string, jest.Mock>;
}
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-21T12:00:00+09:00')); mockFrom.mockReset(); mockInvalidate.mockReset(); });
afterEach(() => jest.useRealTimers());
it('weekly cleaning reads items once and one date range, ignoring duplicate and future completions', async () => {
  const items=query([
    { id:'daily',segment:'open',weekday:null }, { id:'mon',segment:'weekday',weekday:1 },
    { id:'wed',segment:'weekday',weekday:3 }, { id:'fri',segment:'weekday',weekday:5 },
  ]);
  const logs=query([
    { item_id:'daily',date:'2026-10-19' }, { item_id:'mon',date:'2026-10-19' },
    { item_id:'daily',date:'2026-10-19' }, { item_id:'daily',date:'2026-10-20' },
    { item_id:'wed',date:'2026-10-21' }, { item_id:'daily',date:'2026-10-23' }, { item_id:'fri',date:'2026-10-23' },
  ]);
  mockFrom.mockImplementation(table => table==='cleaning_items'?items:logs);
  const result=await getWeeklyCleaningProgress('a');
  expect(mockFrom.mock.calls.map(call=>call[0])).toEqual(['cleaning_items','cleaning_logs']);
  expect(logs.eq).toHaveBeenCalledWith('store_id','a');
  expect(logs.gte).toHaveBeenCalledWith('date','2026-10-19'); expect(logs.lte).toHaveBeenCalledWith('date','2026-10-21');
  expect(result.days.map(day=>day.checked)).toEqual([2,1,1,0,0,0,0]); expect(result.pct).toBe(40);
});
it('weekly schedules read all working weekdays with names once and preserve grouping and overlaps', async () => {
  const rows=query([
    { day_of_week:1,start_time:'09:00',end_time:'12:00',employees:{name:'one'} },
    { day_of_week:1,start_time:'11:00',end_time:'14:00',employees:{name:'two'} },
    { day_of_week:3,start_time:'10:00',end_time:'12:00',employees:{name:'three'} },
    { day_of_week:4,start_time:null,end_time:null,employees:{name:'unassigned'} },
  ]);
  mockFrom.mockReturnValue(rows);
  const result=await getWeeklyScheduleBreakdown('a');
  expect(mockFrom).toHaveBeenCalledTimes(1); expect(mockFrom).toHaveBeenCalledWith('employee_schedules');
  expect(rows.select).toHaveBeenCalledWith('*, employees(name)'); expect(rows.eq).toHaveBeenCalledWith('is_working',true);
  expect(result[0]).toMatchObject({weekday:1,headcount:2,totalHours:6,maxOverlap:2});
  expect(result[0].shifts.map(shift=>shift.employeeName)).toEqual(['one','two']);
  expect(result[2]).toMatchObject({weekday:3,headcount:1,totalHours:2});
  expect(result[3].headcount).toBe(0); expect(result.length).toBe(7);
});

it('schedule approval invalidates once even if status update fails after schedule commit', async () => {
  mockFrom.mockImplementation(table => table === 'employee_schedules'
    ? { upsert: async () => ({ error: null }) }
    : { update: () => ({ eq: async () => ({ error: { message: 'status failed' } }) }) });
  const request = { id:'request',store_id:'a',employee_id:'employee',days:[] } as unknown as ScheduleRequest;
  await expect(reviewScheduleRequest(request,true)).rejects.toThrow('status failed');
  expect(mockInvalidate).toHaveBeenCalledTimes(1); expect(mockInvalidate).toHaveBeenCalledWith('a', ['schedule', 'notifications']);
});

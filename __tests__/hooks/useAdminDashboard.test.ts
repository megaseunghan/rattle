import { act, renderHook } from '@testing-library/react-native';
import { useAdminDashboard } from '../../lib/hooks/useAdminDashboard';
import { Store } from '../../types';

let mockStores: Store[];
const mockRoles = {};
const mockPnl = jest.fn();
const mockTrend = jest.fn();
const mockCleaning = jest.fn();
const mockSchedule = jest.fn();
jest.mock('../../lib/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'owner' }, stores: mockStores, memberRoles: mockRoles }),
}));
jest.mock('../../lib/services/adminDashboard', () => ({
  getMultiStoreMonthlyPnl: (...args: unknown[]) => mockPnl(...args),
  getMultiStoreYearlyPnl: (...args: unknown[]) => mockPnl(...args),
  getMultiStoreMonthlyTrend: (...args: unknown[]) => mockTrend(...args),
  getMultiStoreYearlyTrend: (...args: unknown[]) => mockTrend(...args),
  getWeeklyCleaningProgress: (...args: unknown[]) => mockCleaning(...args),
  getWeeklyScheduleBreakdown: (...args: unknown[]) => mockSchedule(...args),
}));
const store = (id: string, closingTime = '23:00') => ({ id, owner_id: 'owner', closing_time: closingTime } as Store);

beforeEach(() => {
  mockStores = [store('a'), store('b')];
  mockPnl.mockReset().mockResolvedValue({ current: [], previous: [] });
  mockTrend.mockReset().mockResolvedValue([{ label: '10월', value: 0 }]);
  mockCleaning.mockReset().mockResolvedValue({ days: [], pct: 75 });
  mockSchedule.mockReset().mockResolvedValue([{ weekday: 1, headcount: 2 }]);
});

it('손익 조회가 실패해도 청소와 스케줄 결과를 유지하고 금액을 0원으로 만들지 않는다', async () => {
  mockPnl.mockRejectedValue(new Error('column payroll.worked_minutes does not exist'));
  mockTrend.mockRejectedValue(new Error('schema unavailable'));
  const { result } = renderHook(() => useAdminDashboard());
  await act(async () => { await result.current.refetch(); });
  expect(result.current.pnl).toBeNull();
  expect(result.current.trend).toBeNull();
  expect(result.current.errors.pnl).toBe(true);
  expect(result.current.errors.trend).toBe(true);
  expect(result.current.weeklyCleaning.a.pct).toBe(75);
  expect(result.current.weeklySchedule.b[0].headcount).toBe(2);
  expect(result.current.loading).toBe(false);
});

it('한 매장의 청소 또는 스케줄 오류를 다른 매장의 결과와 구분한다', async () => {
  mockCleaning.mockImplementation((id) => id === 'a' ? Promise.reject(new Error('denied')) : Promise.resolve({ days: [], pct: 0 }));
  mockSchedule.mockImplementation((id) => id === 'b' ? Promise.reject(new Error('network')) : Promise.resolve([]));
  const { result } = renderHook(() => useAdminDashboard());
  await act(async () => { await result.current.refetch(); });
  expect(result.current.weeklyCleaning.a).toBeUndefined();
  expect(result.current.weeklyCleaning.b.pct).toBe(0);
  expect(result.current.errors.cleaning).toEqual({ a: true });
  expect(result.current.weeklySchedule.a).toEqual([]);
  expect(result.current.weeklySchedule.b).toBeUndefined();
  expect(result.current.errors.schedule).toEqual({ b: true });
});

it('매장 범위가 바뀐 뒤 도착한 이전 응답을 버린다', async () => {
  let finishOld!: (value: { current: []; previous: [] }) => void;
  mockPnl.mockImplementation((stores: Store[]) => stores[0].id === 'a'
    ? new Promise(resolve => { finishOld = resolve; }) : Promise.resolve({ current: [], previous: [] }));
  const { result, rerender } = renderHook(() => useAdminDashboard());
  act(() => { void result.current.refetch(); });
  mockStores = [store('c')];
  rerender({});
  expect(result.current.weeklyCleaning).toEqual({});
  await act(async () => { await result.current.refetch(); });
  await act(async () => { finishOld({ current: [], previous: [] }); });
  expect(Object.keys(result.current.weeklyCleaning)).toEqual(['c']);
});

it('영업 마감 시각이 바뀌면 이전 손익을 즉시 숨기고 다시 조회한다', async () => {
  const { result, rerender } = renderHook(() => useAdminDashboard());
  await act(async () => { await result.current.refetch(); });
  mockStores = [store('a', '02:00')];
  rerender({});
  expect(result.current.pnl).toBeNull();
  expect(result.current.loading).toBe(true);
  await act(async () => { await result.current.refetch(); });
  expect(mockPnl.mock.lastCall[0][0].closing_time).toBe('02:00');
  expect(result.current.loading).toBe(false);
});

it('소유 매장이 없으면 조회 요청 없이 로딩을 끝낸다', async () => {
  mockStores = [];
  const { result } = renderHook(() => useAdminDashboard());
  await act(async () => { await result.current.refetch(); });
  expect(result.current.loading).toBe(false);
  expect(result.current.pnl).toBeNull();
  expect(mockPnl).not.toHaveBeenCalled();
  expect(mockCleaning).not.toHaveBeenCalled();
});

import { notifyManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
beforeAll(() => { notifyManager.setNotifyFunction(callback => { act(() => callback()); }); });
afterAll(() => { notifyManager.setNotifyFunction(callback => callback()); });
import { useAdminDashboard } from '../../lib/hooks/useAdminDashboard';
import { Store } from '../../types';
import { clearQueryData } from '../../lib/query/client';

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
afterEach(async () => { await act(async () => { await clearQueryData(); }); });
const store = (id: string, closingTime = '23:00') => ({ id, owner_id: 'owner', closing_time: closingTime } as Store);

beforeEach(async () => {
  await act(async () => { await clearQueryData(); });
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
  await waitFor(() => expect(result.current.loading).toBe(false));
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
  await waitFor(() => expect(result.current.loading).toBe(false));
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
  await act(async () => { await Promise.resolve(); });
  mockStores = [store('c')];
  rerender({});
  expect(result.current.weeklyCleaning).toEqual({});
  await act(async () => { await result.current.refetch(); });
  await act(async () => { finishOld({ current: [], previous: [] }); });
  await waitFor(() => expect(Object.keys(result.current.weeklyCleaning)).toEqual(['c']));
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
  await waitFor(() => expect(result.current.loading).toBe(false));
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

it('느린 차트·청소를 기다리지 않고 합계 숫자를 표시한다', async () => {
  mockTrend.mockImplementation(() => new Promise(() => {}));
  mockCleaning.mockImplementation(() => new Promise(() => {}));
  const { result } = renderHook(() => useAdminDashboard());
  await waitFor(() => expect(result.current.pnl).toEqual({ current: [], previous: [] }));
  expect(result.current.trend).toBeNull();
  expect(result.current.weeklyCleaning).toEqual({});
  expect(result.current.loading).toBe(true);
});

it('갱신 권한이 거절되면 이전 통합 손익과 추세를 숨긴다', async () => {
  const { result } = renderHook(() => useAdminDashboard());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.pnl).not.toBeNull();
  mockPnl.mockRejectedValue({ code: '42501', message: 'permission denied' });
  mockTrend.mockRejectedValue({ code: '42501', message: 'permission denied' });
  await act(async () => { await result.current.refetch(); });
  await waitFor(() => expect(result.current.errors.pnl).toBe(true));
  expect(result.current.pnl).toBeNull();
  expect(result.current.trend).toBeNull();
});

it('공유한 선택 월을 사용하고 연도 경계 이동을 같은 범위에 전달한다', async () => {
  const onMonthChange = jest.fn();
  const { result, rerender } = renderHook(({ month }: { month: string }) => useAdminDashboard(month, onMonthChange), { initialProps: { month: '2026-01' } });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.yearMonth).toBe('2026-01');
  act(() => result.current.goPrev());
  expect(onMonthChange).toHaveBeenLastCalledWith('2025-12');
  rerender({ month: '2025-12' });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.yearMonth).toBe('2025-12');
  act(() => result.current.goNext());
  expect(onMonthChange).toHaveBeenLastCalledWith('2026-01');
});

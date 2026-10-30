import { notifyManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useDashboardBreakdown } from '../../lib/hooks/useDashboardBreakdown';
import { clearQueryData } from '../../lib/query/client';
import type { DashboardMetric } from '../../lib/services/dashboardBreakdown';
import type { Store } from '../../types';
const mockDetail = jest.fn();
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'qa-admin' }, currentRole: 'admin', realRole: 'admin', memberRoles: {}, devPreviewMode: 'self', canReadFinancials: true }) }));
jest.mock('../../lib/services/profitLoss', () => ({ getProfitLossByMonth: (...args: unknown[]) => mockDetail(...args) }));
const stores = [{ id: 'a', closing_time: '23:00' }] as Store[];
const detail = (revenue = 100) => ({ revenue, cardRevenue: revenue, cashRevenue: 0, fixedExpense: 10, variableExpense: 20, marketingExpense: 5, maintenanceExpense: 5, utilitiesExpense: 5, cardFeeExpense: 5 });
beforeAll(() => notifyManager.setNotifyFunction(callback => { act(() => callback()); }));
afterAll(() => notifyManager.setNotifyFunction(callback => callback()));
beforeEach(async () => { await act(async () => { await clearQueryData(); }); mockDetail.mockReset().mockResolvedValue(detail()); });
afterEach(async () => { await act(async () => { await clearQueryData(); }); });
it('항목을 누르기 전에는 상세 조회를 하지 않는다', () => {
  const { result } = renderHook(() => useDashboardBreakdown(stores, 'month', '2026-10', null));
  expect(result.current.isFetching).toBe(false);
  expect(mockDetail).not.toHaveBeenCalled();
});
it('항목을 바꿔도 같은 월의 권한 검증된 상세 결과를 재사용한다', async () => {
  const { result, rerender } = renderHook(({ metric }: { metric: DashboardMetric }) => useDashboardBreakdown(stores, 'month', '2026-10', metric), { initialProps: { metric: 'revenue' as DashboardMetric } });
  await waitFor(() => expect(result.current.data?.total).toBe(100));
  rerender({ metric: 'expense' });
  await waitFor(() => expect(result.current.data?.total).toBe(30));
  expect(mockDetail).toHaveBeenCalledTimes(1);
});
it('연간 조회는 두 달까지만 동시에 처리하고 빠진 월 없이 합산한다', async () => {
  let active = 0, maximum = 0;
  mockDetail.mockImplementation(async () => { active++; maximum = Math.max(maximum, active); await Promise.resolve(); active--; return detail(); });
  const { result } = renderHook(() => useDashboardBreakdown(stores, 'year', '2025-01', 'revenue'));
  await waitFor(() => expect(result.current.data?.total).toBe(1200));
  expect(mockDetail).toHaveBeenCalledTimes(12);
  expect(maximum).toBeLessThanOrEqual(2);
});
it('매장을 바꾼 뒤 늦게 도착한 이전 매장의 결과를 표시하지 않는다', async () => {
  let finish!: (value: ReturnType<typeof detail>) => void;
  mockDetail.mockImplementation((id: string) => id === 'a' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(detail(200)));
  const { result, rerender } = renderHook(({ ids }: { ids: Store[] }) => useDashboardBreakdown(ids, 'month', '2026-10', 'revenue'), { initialProps: { ids: stores } });
  await waitFor(() => expect(mockDetail).toHaveBeenCalledTimes(1));
  rerender({ ids: [{ id: 'b', closing_time: '23:00' }] as Store[] });
  await waitFor(() => expect(result.current.data?.total).toBe(200));
  await act(async () => { finish(detail(100)); });
  expect(result.current.data?.total).toBe(200);
});

import { notifyManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
beforeAll(() => { notifyManager.setNotifyFunction(callback => { act(() => callback()); }); });
afterAll(() => { notifyManager.setNotifyFunction(callback => callback()); });
import { useProfitLossTrendChart } from '../../lib/hooks/useProfitLossTrendChart';
import { queryClient, clearQueryData } from '../../lib/query/client';
import { financialSummaryOptions } from '../../lib/query/financial';
let mockUser = { id: 'admin' };
let mockRole = 'admin';
let mockCanRead = true;
let mockStore = { id: 'a', closing_time: '23:00' };
const mockBatch = jest.fn();
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: mockStore, user: mockUser, currentRole: mockRole, realRole: 'admin', canReadFinancials: mockCanRead, memberRoles: {}, devPreviewMode: 'self' }) }));
jest.mock('../../lib/services/homeFinancialSummary', () => ({ getFinancialSummaries: (...args: unknown[]) => mockBatch(...args) }));
const rows = (ids: string[], months: string[], revenue = 100) => ids.flatMap(storeId => months.map(yearMonth => ({ storeId, yearMonth, revenue })));
beforeEach(async () => {
  await act(async () => { await clearQueryData(); }); mockCanRead = true; mockUser = { id: 'admin' }; mockRole = 'admin'; mockStore = { id: 'a', closing_time: '23:00' };
  mockBatch.mockReset().mockImplementation((ids, months) => Promise.resolve(rows(ids, months)));
});
afterEach(async () => { await act(async () => { await clearQueryData(); }); });
it('6개월을 한 RPC로 읽고 재방문·중복 화면은 공유 캐시를 사용한다', async () => {
  const first = renderHook(() => useProfitLossTrendChart(2026, 10));
  await waitFor(() => expect(first.result.current.loading).toBe(false));
  expect(mockBatch).toHaveBeenCalledTimes(1);
  const second = renderHook(() => useProfitLossTrendChart(2026, 10));
  await waitFor(() => expect(second.result.current.bars[5].data?.revenue).toBe(100));
  expect(mockBatch).toHaveBeenCalledTimes(1);
  first.unmount(); second.unmount();
});
it('수동 새로고침은 freshness를 무시한다', async () => {
  const { result } = renderHook(() => useProfitLossTrendChart(2026, 10));
  await waitFor(() => expect(result.current.loading).toBe(false));
  mockBatch.mockImplementation((ids, months) => Promise.resolve(rows(ids, months, 200)));
  await act(async () => { await result.current.refetch(); });
  await waitFor(() => expect(result.current.bars[5].data?.revenue).toBe(200));
  expect(mockBatch).toHaveBeenCalledTimes(2);
});
it('다른 매장·계정·권한 응답을 표시하지 않는다', async () => {
  const { result, rerender } = renderHook(() => useProfitLossTrendChart(2026, 10));
  await waitFor(() => expect(result.current.loading).toBe(false));
  mockBatch.mockImplementation(() => new Promise(() => {}));
  mockStore = { id: 'b', closing_time: '02:00' }; rerender({});
  expect(result.current.bars.every(b => b.data === null)).toBe(true);
  mockUser = { id: 'other' }; mockRole = 'member'; rerender({});
  expect(result.current.bars.every(b => b.data === null)).toBe(true);
});
it('일부 월 실패는 0원과 구분하고 선택 월 숫자는 나머지 월 완료 전에 표시한다', async () => {
  const scope = JSON.stringify(['admin', 'admin', 'admin', 'self', undefined, true, []]);
  queryClient.setQueryData(financialSummaryOptions(scope, 'a', '23:00', '2026-10', true).queryKey, { storeId: 'a', yearMonth: '2026-10', revenue: 0, purchaseCost: 0, laborCost: 0, fixedExpense: 0, variableExpense: 0, operatingProfit: 0 });
  mockBatch.mockRejectedValue(new Error('internal schema error'));
  const { result } = renderHook(() => useProfitLossTrendChart(2026, 10));
  expect(result.current.selectedLoading).toBe(false);
  expect(result.current.bars[5].data?.revenue).toBe(0);
  await waitFor(() => expect(result.current.error).toMatch('일부 월'));
  expect(result.current.bars[0].data).toBeNull();
  expect(result.current.error).not.toMatch('schema');
});

it('갱신 시 권한 거부가 확인되면 캐시의 기존 금액을 숨긴다', async () => {
  const { result } = renderHook(() => useProfitLossTrendChart(2026, 10));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.bars[5].data?.revenue).toBe(100);
  mockBatch.mockRejectedValue({ code: '42501', message: 'permission denied' });
  await act(async () => { await result.current.refetch(); });
  await waitFor(() => expect(result.current.bars.every(bar => bar.data === null)).toBe(true));
  expect(result.current.error).toBeTruthy();
});

it('공유가 해제되면 이미 받은 모든 합계와 차트를 숨기고 추가 조회하지 않는다', async () => {
  const { result, rerender } = renderHook(() => useProfitLossTrendChart(2026, 10));
  await waitFor(() => expect(result.current.bars[5].data).not.toBeNull());
  const calls = mockBatch.mock.calls.length;
  mockCanRead = false; rerender({});
  expect(result.current.bars).toEqual([]);
  await act(async () => { await result.current.refetch(); });
  expect(mockBatch).toHaveBeenCalledTimes(calls);
});

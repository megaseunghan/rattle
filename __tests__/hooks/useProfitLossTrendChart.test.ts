import { act, renderHook } from '@testing-library/react-native';
import { useProfitLossTrendChart } from '../../lib/hooks/useProfitLossTrendChart';
import { ProfitLoss } from '../../types';

let mockStore: { id: string; closing_time: string } | null;
const mockGetProfitLoss = jest.fn();
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: mockStore }) }));
jest.mock('../../lib/services/profitLoss', () => ({
  getProfitLossByMonth: (...args: unknown[]) => mockGetProfitLoss(...args),
}));
const pnl = (revenue: number) => ({ revenue } as ProfitLoss);

beforeEach(() => {
  mockStore = { id: 'store-a', closing_time: '23:00:00' };
  mockGetProfitLoss.mockReset().mockResolvedValue(pnl(100));
});

it('선택 월까지 6개월을 유지하고 실패한 월을 0원으로 바꾸지 않는다', async () => {
  mockGetProfitLoss.mockImplementation((_id, month) => month === '2026-07'
    ? Promise.reject(new Error('network error')) : Promise.resolve(pnl(0)));
  const { result } = renderHook(() => useProfitLossTrendChart(2026, 10));
  await act(async () => { await result.current.refetch(); });
  expect(result.current.bars.map(bar => bar.key)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  expect(result.current.bars[2].data).toBeNull();
  expect(result.current.bars[0].data?.revenue).toBe(0);
  expect(result.current.bars[5].isCurrent).toBe(true);
  expect(result.current.error).toBeTruthy();
});

it('전체 조회 실패 시 월 위치는 유지하고 내부 원문 대신 짧게 안내한다', async () => {
  mockGetProfitLoss.mockRejectedValue(new Error('column payroll.worked_minutes does not exist'));
  const { result } = renderHook(() => useProfitLossTrendChart(2026, 1));
  await act(async () => { await result.current.refetch(); });
  expect(result.current.bars).toHaveLength(6);
  expect(result.current.bars[0].key).toBe('2025-08');
  expect(result.current.bars.every(bar => bar.data === null)).toBe(true);
  expect(result.current.error).toBe('일부 월의 손익을 불러오지 못했어요. 다시 시도해 주세요.');
  expect(result.current.error).not.toMatch(/worked_minutes|업데이트/);
});

it('명시적 새로고침으로 수정된 금액을 다시 읽는다', async () => {
  const { result } = renderHook(() => useProfitLossTrendChart(2026, 10));
  await act(async () => { await result.current.refetch(); });
  mockGetProfitLoss.mockResolvedValue(pnl(200));
  await act(async () => { await result.current.refetch(); });
  expect(mockGetProfitLoss).toHaveBeenCalledTimes(12);
  expect(result.current.bars[5].data?.revenue).toBe(200);
});

it('매장 전환 뒤 늦게 도착한 이전 매장의 응답을 버린다', async () => {
  const pending: ((value: ProfitLoss) => void)[] = [];
  mockGetProfitLoss.mockImplementation((id) => id === 'store-a'
    ? new Promise<ProfitLoss>(resolve => pending.push(resolve)) : Promise.resolve(pnl(200)));
  const { result, rerender } = renderHook(() => useProfitLossTrendChart(2026, 10));
  act(() => { void result.current.refetch(); });
  mockStore = { id: 'store-b', closing_time: '02:00:00' };
  rerender({});
  expect(result.current.bars).toEqual([]);
  await act(async () => { await result.current.refetch(); });
  await act(async () => { pending.forEach(resolve => resolve(pnl(100))); });
  expect(result.current.bars[5].data?.revenue).toBe(200);
  expect(mockGetProfitLoss).toHaveBeenCalledWith('store-b', '2026-10', '02:00');
});

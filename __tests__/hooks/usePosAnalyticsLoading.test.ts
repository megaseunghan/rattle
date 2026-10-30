import { act, renderHook } from '@testing-library/react-native';
import { usePosAnalytics } from '../../lib/hooks/usePosAnalytics';
import { queryClient } from '../../lib/query';
jest.mock('../../lib/query/legacyPosCache', () => ({ clearLegacyPosCache: jest.fn() }));
let mockStore = { id: 'one', closing_time: '23:00' };
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: mockStore }) }));
jest.mock('../../lib/services/posAnalytics', () => ({ getDailySummaries: jest.fn(), getDailySummariesByRange: jest.fn(), getDailyItems: jest.fn() }));
jest.mock('../../lib/query', () => ({ useQueryScope: () => 'user', queryKeys: { store: (...args: any[]) => args }, queryClient: { getQueryData: jest.fn(), fetchQuery: jest.fn() } }));
const rows = [{ date: '2026-10-20', totalAmount: 100, orderCount: 1 }];
beforeEach(() => { jest.clearAllMocks(); mockStore = { id: 'one', closing_time: '23:00' }; });
it('동일 기간 재조회와 종료시각 변경 중 기존 매출을 유지하고 오류에도 보존한다', async () => {
  (queryClient.fetchQuery as jest.Mock).mockResolvedValueOnce(rows);
  const { result } = renderHook(() => usePosAnalytics());
  const from = new Date('2026-10-01T14:00:00Z');
  await act(async () => { await result.current.fetchSummariesByRange(from, new Date('2026-10-26T10:00:00Z')); });
  let reject!: (error: Error) => void;
  (queryClient.fetchQuery as jest.Mock).mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
  let pending!: Promise<void>;
  act(() => { pending = result.current.fetchSummariesByRange(from, new Date('2026-10-26T11:00:00Z')); });
  expect(result.current.summaries).toEqual(rows);
  expect(result.current.loadingSummaries).toBe(true);
  await act(async () => { reject(new Error('offline')); await pending; });
  expect(result.current.summaries).toEqual(rows);
  expect(result.current.error).toBeTruthy();
});
it('다른 월로 이동하면 이전 월의 금액을 표시하지 않는다', async () => {
  (queryClient.fetchQuery as jest.Mock).mockResolvedValueOnce(rows);
  const { result } = renderHook(() => usePosAnalytics());
  await act(async () => { await result.current.fetchSummariesByRange(new Date('2026-10-01'), new Date('2026-10-26')); });
  let resolve!: (data: unknown[]) => void;
  (queryClient.fetchQuery as jest.Mock).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  let pending!: Promise<void>;
  act(() => { pending = result.current.fetchSummariesByRange(new Date('2026-09-01'), new Date('2026-10-01')); });
  expect(result.current.summaries).toEqual([]);
  await act(async () => { resolve([]); await pending; });
});


it('로딩만 바뀌면 필터 결과를 재사용하고 분류 변경은 반영한다', async () => {
  const items = [
    { itemId: 'a', itemName: '국밥', categoryName: '식사', quantity: 1, totalAmount: 100 },
    { itemId: 'b', itemName: '물', categoryName: '음료', quantity: 1, totalAmount: 10 },
  ];
  (queryClient.fetchQuery as jest.Mock).mockResolvedValueOnce(items);
  const { result } = renderHook(() => usePosAnalytics());
  await act(async () => { await result.current.fetchItems('2026-10-01', '2026-10-02'); });
  act(() => result.current.setActiveCategory('식사'));
  const filtered = result.current.items;
  const categories = result.current.categories;
  let resolve!: (rows: unknown[]) => void;
  (queryClient.fetchQuery as jest.Mock).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  let pending!: Promise<void>;
  act(() => { pending = result.current.fetchSummariesByRange(new Date('2026-10-01'), new Date('2026-10-02')); });
  expect(result.current.items).toBe(filtered);
  expect(result.current.categories).toBe(categories);
  await act(async () => { resolve([]); await pending; });
  act(() => result.current.setActiveCategory('음료'));
  expect(result.current.items).toEqual([items[1]]);
});

it('전체라는 원본 분류가 있어도 필터 키를 중복하지 않는다', async () => {
  (queryClient.fetchQuery as jest.Mock).mockResolvedValueOnce([
    { itemId: 'one', itemName: '메뉴', categoryName: '전체', quantity: 1, totalAmount: 100 },
  ]);
  const { result } = renderHook(() => usePosAnalytics());
  await act(async () => { await result.current.fetchItems('2026-10-01', '2026-10-02'); });
  expect(result.current.categories).toEqual(['전체']);
});

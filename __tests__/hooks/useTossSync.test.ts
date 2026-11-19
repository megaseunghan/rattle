import { CancelledError } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { useTossSync } from '../../lib/hooks/useTossSync';
import { clearPosSyncCoordinator } from '../../lib/services/posSyncCoordinator';
const mockFetch = jest.fn();
const mockSave = jest.fn();
const mockHas = jest.fn();
const mockSummary = jest.fn();
let mockScope = 'account-a';
let mockPreview='self';
let mockStore = { id: 'store-a', closing_time: '16:00', toss_merchant_id: 'merchant-a' };
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: mockStore, currentRole: 'admin', canManageStore: true, devPreviewMode: mockPreview, canReadFinancials: true }) }));
jest.mock('../../lib/query', () => ({
  useQueryScope: () => mockScope,
  isAccessDenied: (error: any) => error?.code === "42501",
  queryKeys: { store: (...args: unknown[]) => args },
  queryClient: { getQueryData: jest.fn(), getQueryState: jest.fn(), fetchQuery: ({ queryFn }: { queryFn: () => unknown }) => queryFn() },
}));
jest.mock('../../lib/services/tossplace', () => ({ fetchTossOrders: (...args: unknown[]) => mockFetch(...args), fetchTossCatalog: jest.fn(), saveCatalog: jest.fn() }));
jest.mock('../../lib/services/tossSync', () => ({
  getTossMerchantId: jest.fn().mockResolvedValue('merchant-a'),
  hasPosOrders: (...args: unknown[]) => mockHas(...args), savePosOrders: (...args: unknown[]) => mockSave(...args),
}));
jest.mock('../../lib/services/posAnalytics', () => ({
  getAutoSyncRange: () => ({ from: new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000).toISOString(), to: new Date(Date.now()).toISOString() }),
  getDailySummariesByRange: (...args: unknown[]) => mockSummary(...args), getBusinessDayRange: jest.fn(),
}));
beforeEach(() => {
  mockPreview='self';
  clearPosSyncCoordinator(); mockFetch.mockReset().mockResolvedValue([]); mockSave.mockReset().mockResolvedValue(undefined);
  mockHas.mockReset().mockResolvedValue(false); mockSummary.mockReset().mockResolvedValue([]);
  mockScope = 'account-a'; mockStore = { id: 'store-a', closing_time: '16:00', toss_merchant_id: 'merchant-a' };
});
it('loading changes do not change automatic callbacks and separate instances deduplicate', async () => {
  const one = renderHook(useTossSync); const two = renderHook(useTossSync);
  const auto = one.result.current.autoSync;
  await act(async () => { await Promise.all([one.result.current.autoSync(), two.result.current.autoSync()]); });
  expect(one.result.current.autoSync).toBe(auto);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  await act(async () => { await one.result.current.autoSync(); });
  expect(mockFetch).toHaveBeenCalledTimes(1);
  await act(async () => { await one.result.current.syncOrders('from','to'); });
  expect(mockFetch).toHaveBeenCalledTimes(2); // manual action bypasses throttle
});
it('failed writes remain retryable and do not report sync success', async () => {
  mockSave.mockRejectedValueOnce(new Error('write failed'));
  const { result } = renderHook(useTossSync);
  await act(async () => { await result.current.autoSync(); });
  expect(result.current.lastSyncAt).toBeNull(); expect(result.current.error).toBeTruthy();
  await act(async () => { await result.current.autoSync(); });
  expect(mockFetch).toHaveBeenCalledTimes(2); expect(result.current.lastSyncAt).toBeTruthy();
});
it('late previous-store summary cannot overwrite current store', async () => {
  let done!: (rows: unknown[]) => void;
  mockSummary.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
  const { result, rerender } = renderHook(useTossSync);
  let pending!: Promise<void>;
  act(() => { pending = result.current.loadTodaySales(); });
  mockStore = { ...mockStore, id: 'store-b' }; mockScope = 'account-b'; rerender(false);
  await act(async () => { done([{ totalAmount: 999, orderCount: 1 }]); await pending; });
  expect(result.current.todaySales).toBe(0);
});

it('cache invalidation cancellation is not displayed as a sync error', async () => {
  mockSummary.mockRejectedValueOnce(new CancelledError());
  const { result } = renderHook(useTossSync);
  await act(async () => { await result.current.loadTodaySales(); });
  expect(result.current.error).toBeNull();
});

it('successful sales read clears its read error while preserving an import error', async () => {
  const { result } = renderHook(useTossSync);
  mockSummary.mockRejectedValueOnce(new Error('read offline'));
  await act(async () => { await result.current.loadTodaySales(); });
  expect(result.current.error).toBeTruthy();
  await act(async () => { await result.current.loadTodaySales(); });
  expect(result.current.error).toBeNull();
  mockSave.mockRejectedValueOnce(new Error('import failed'));
  await act(async () => { await result.current.autoSync(); });
  await act(async () => { await result.current.loadTodaySales(); });
  expect(result.current.error).toBeTruthy();
});

it('POS 조회 후 미리보기로 바뀌면 받은 주문을 실제로 저장하지 않는다',async()=>{
 let release!:(value:any[])=>void;mockFetch.mockImplementation(()=>new Promise<any[]>(resolve=>{release=resolve}));
 const {result,rerender}=renderHook(useTossSync);let pending!:Promise<unknown>;
 await act(async()=>{pending=result.current.syncOrders('from','to').catch(e=>e);await Promise.resolve();});
 mockPreview='regular';rerender({});await act(async()=>{release([]);await pending;});
 expect(mockSave).not.toHaveBeenCalled();
});

it('30일 이력은 6시간, 최근 2일은 30분 성공 간격으로 제한하고 수동 요청은 즉시 실행한다', async () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-17T10:00:00Z'));
  try {
    const { result } = renderHook(useTossSync);
    await act(async () => { await result.current.autoSyncRecent('16:00', 30); });
    clock.mockReturnValue(Date.parse('2026-11-17T10:31:00Z'));
    await act(async () => { await result.current.autoSyncRecent('16:00', 30); });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.autoSyncRecent('16:00', 2); });
    clock.mockReturnValue(Date.parse('2026-11-17T11:02:00Z'));
    await act(async () => { await result.current.autoSyncRecent('16:00', 2); });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    await act(async () => { await result.current.syncOrders('manual-from', 'manual-to'); });
    expect(mockFetch).toHaveBeenCalledTimes(4);
    clock.mockReturnValue(Date.parse('2026-11-17T16:00:00Z'));
    await act(async () => { await result.current.autoSyncRecent('16:00', 30); });
    expect(mockFetch).toHaveBeenCalledTimes(5);
  } finally { clock.mockRestore(); }
});

it('매장 전환 뒤 도착한 주문은 저장하거나 현재 성공 시각으로 표시하지 않는다', async () => {
  let finish!: (orders: unknown[]) => void;
  mockFetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { result, rerender } = renderHook(useTossSync);
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.autoSyncRecent('16:00', 30); });
  mockStore = { ...mockStore, id: 'store-b' }; mockScope = 'account-b'; rerender(false);
  await act(async () => { finish([]); await pending; });
  expect(mockSave).not.toHaveBeenCalled();
  expect(result.current.lastSyncAt).toBeNull();
  expect(result.current.error).toBeNull();
});

it('루트의 자동 저장이 끝나면 홈 훅도 같은 매장의 최신 매출을 다시 읽는다', async () => {
  mockSummary.mockResolvedValue([{ totalAmount: 100, orderCount: 1 }]);
  const root = renderHook(useTossSync); const home = renderHook(useTossSync);
  await act(async () => { await home.result.current.loadTodaySales(); });
  expect(home.result.current.todaySales).toBe(100);
  mockSave.mockImplementationOnce(async () => { mockSummary.mockResolvedValue([{ totalAmount: 300, orderCount: 2 }]); });
  await act(async () => { await root.result.current.autoSyncRecent('16:00', 2); });
  expect(home.result.current.todaySales).toBe(300);
  expect(home.result.current.todayOrderCount).toBe(2);
});

it('화면이 사라진 뒤 도착한 자동 주문 응답은 저장하지 않는다', async () => {
  let finish!: (orders: unknown[]) => void;
  mockFetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { result, unmount } = renderHook(useTossSync);
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.autoSyncRecent('16:00', 30); });
  unmount();
  await act(async () => { finish([]); await pending; });
  expect(mockSave).not.toHaveBeenCalled();
});

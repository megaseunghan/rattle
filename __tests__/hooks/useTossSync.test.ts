import { CancelledError } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { useTossSync } from '../../lib/hooks/useTossSync';
import { clearPosSyncCoordinator } from '../../lib/services/posSyncCoordinator';
const mockFetch = jest.fn();
const mockSave = jest.fn();
const mockHas = jest.fn();
const mockSummary = jest.fn();
let mockScope = 'account-a';
let mockStore = { id: 'store-a', closing_time: '16:00', toss_merchant_id: 'merchant-a' };
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: mockStore, currentRole: 'admin', canReadFinancials: true }) }));
jest.mock('../../lib/query', () => ({
  useQueryScope: () => mockScope,
  queryKeys: { store: (...args: unknown[]) => args },
  queryClient: { fetchQuery: ({ queryFn }: { queryFn: () => unknown }) => queryFn() },
}));
jest.mock('../../lib/services/tossplace', () => ({ fetchTossOrders: (...args: unknown[]) => mockFetch(...args), fetchTossCatalog: jest.fn(), saveCatalog: jest.fn() }));
jest.mock('../../lib/services/tossSync', () => ({
  getTossMerchantId: jest.fn().mockResolvedValue('merchant-a'),
  hasPosOrders: (...args: unknown[]) => mockHas(...args), savePosOrders: (...args: unknown[]) => mockSave(...args),
}));
jest.mock('../../lib/services/posAnalytics', () => ({
  getAutoSyncRange: () => ({ from: '2026-10-20T07:00:00Z', to: '2026-10-21T06:00:00Z' }),
  getDailySummariesByRange: (...args: unknown[]) => mockSummary(...args), getBusinessDayRange: jest.fn(),
}));
beforeEach(() => {
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

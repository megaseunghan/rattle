jest.mock('../../lib/components/HomeAttendanceCard', () => ({ HomeAttendanceCard: () => null }));
import { act, render, waitFor } from '@testing-library/react-native';
import { AppState, AppStateStatus, ScrollView } from 'react-native';
import { HomeScreen } from '../../app/(tabs)/index';
import { usePosForegroundSync } from '../../lib/hooks/usePosForegroundSync';
import { clearPosSyncCoordinator } from '../../lib/services/posSyncCoordinator';
import { queryClient } from '../../lib/query/client';
// 홈의 스택 복귀 갱신(useRefreshOnReturn)은 네비게이션 컨테이너가 필요해 여기서는 대체한다. 계약은 __tests__/query/reentryCache.test.ts에서 확인한다.
jest.mock('../../lib/query/useRefreshOnReturn', () => ({ useRefreshOnReturn: () => undefined }));

const mockFetch = jest.fn();
const mockRpc = jest.fn();
const mockRefetch = jest.fn().mockResolvedValue(undefined);
let mockSales = 100;
let mockListener: (state: AppStateStatus) => void;
const mockRemove = jest.fn();
const mockStore = { id: 'QA-store', name: 'QA 매장', closing_time: '00:00', toss_merchant_id: 'QA-merchant' };
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: mockStore, user: { id: 'QA-user' }, currentRole: 'admin', canManageStore: true, storeRole: 'owner', devPreviewMode: 'self', canReadFinancials: true }) }));
jest.mock('../../lib/query', () => ({ ...jest.requireActual('../../lib/query/client'), useQueryScope: () => 'QA-user:admin' }));
jest.mock('../../lib/services/tossplace', () => ({ fetchTossOrders: (...args: unknown[]) => mockFetch(...args) }));
jest.mock('../../lib/hooks/useIngredients', () => ({ useIngredients: () => ({ data: [], refetch: mockRefetch }) }));
jest.mock('../../lib/hooks/useEmployees', () => ({ useEmployees: () => ({ employees: [], refetch: mockRefetch }) }));
jest.mock('../../lib/hooks/useNotifications', () => ({ useNotifications: () => ({ refetch: mockRefetch }) }));
jest.mock('../../lib/hooks/useHomeFinancialCard', () => ({ useHomeFinancialCard: () => ({ data: null, refetch: mockRefetch }) }));
jest.mock('../../lib/contexts/TabPagerContext', () => ({ useTabPager: () => ({ goToTab: jest.fn(), innerGestureActive: false }) }));
jest.mock('../../lib/components/DailyOperationsHome', () => ({ DailyOperationsHome: () => null }));
jest.mock('../../lib/components/HomeFinancialCard', () => ({ HomeFinancialCard: () => null }));
jest.mock('../../lib/components/HomeAlertsPanel', () => ({ HomeAlertsPanel: ({ todaySales }: { todaySales: number }) => {
  const React = require('react'); const { Text } = require('react-native');
  return React.createElement(Text, null, `매출 ${todaySales}`);
} }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }));
jest.mock('../../lib/utils/scheduleIdleTask', () => ({ scheduleIdleTask: (task: () => void) => { task(); return () => {}; } }));

function RootSync() { usePosForegroundSync(true); return null; }
function App({ active }: { active: boolean }) { return <><RootSync /><HomeScreen active={active} /></>; }
const importCount = () => mockRpc.mock.calls.filter(([name]) => name === 'upsert_pos_order_batch').length;
let now = Date.parse('2026-11-17T10:00:00Z');
beforeEach(() => {
  clearPosSyncCoordinator(); queryClient.clear(); jest.clearAllMocks();
  now = Date.parse('2026-11-17T10:00:00Z'); mockSales = 100;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { mockListener = callback; return { remove: mockRemove }; });
  mockFetch.mockReset().mockResolvedValue([{ orderId: 'QA-order', items: [] }]);
  mockRpc.mockReset().mockImplementation(async (name: string) => {
    if (name === 'upsert_pos_order_batch') { mockSales += 100; return { data: 1, error: null }; }
    if (name === 'get_pos_daily_summaries') return { data: [{ total_amount: mockSales, order_count: 1 }], error: null };
    throw new Error(`Unexpected RPC ${name}`);
  });
});
afterEach(() => { queryClient.clear(); jest.restoreAllMocks(); });

it('앱을 켜 둔 홈 탭 복귀는 gate 전 0회, 30분 경과 후 1회만 실제 수입하고 홈 금액을 갱신한다', async () => {
  const view = render(<App active />);
  await waitFor(() => expect(view.getByText('매출 200')).toBeTruthy());
  expect(mockFetch).toHaveBeenCalledTimes(1); expect(importCount()).toBe(1);
  view.rerender(<App active={false} />);
  now += 29 * 60_000;
  view.rerender(<App active />);
  await act(async () => {});
  expect(mockFetch).toHaveBeenCalledTimes(1); expect(importCount()).toBe(1);
  view.rerender(<App active={false} />);
  now += 2 * 60_000;
  view.rerender(<App active />);
  await waitFor(() => expect(importCount()).toBe(2));
  await waitFor(() => expect(view.getByText('매출 300')).toBeTruthy());
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

it('실제 background 복귀와 홈 활성화가 겹쳐도 진행 중 요청을 공유하고 반복 active는 재수입하지 않는다', async () => {
  const view = render(<App active={false} />);
  await waitFor(() => expect(importCount()).toBe(1));
  await act(async () => {});
  now += 31 * 60_000;
  let finish!: (orders: unknown[]) => void;
  mockFetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => { mockListener('background'); mockListener('active'); });
  view.rerender(<App active />);
  await act(async () => {});
  expect(mockFetch).toHaveBeenCalledTimes(2); expect(importCount()).toBe(1);
  await act(async () => { finish([{ orderId: 'QA-order', items: [] }]); });
  await waitFor(() => expect(view.getByText('매출 300')).toBeTruthy());
  expect(importCount()).toBe(2);
  await act(async () => { mockListener('active'); mockListener('background'); mockListener('active'); });
  expect(mockFetch).toHaveBeenCalledTimes(2); expect(importCount()).toBe(2);
});

it('홈 당겨서 새로고침은 gate 전후 모두 저장자료를 재조회하고 수동 POS 수입으로 바꾸지 않는다', async () => {
  const view = render(<App active />);
  await waitFor(() => expect(view.getByText('매출 200')).toBeTruthy());
  for (const elapsed of [0, 31 * 60_000]) {
    now += elapsed;
    mockRefetch.mockClear();
    const refresh = view.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh;
    await act(async () => { await refresh(); });
    expect(mockRefetch).toHaveBeenCalledWith(true);
    expect(mockRefetch).toHaveBeenCalledWith(); // 알림·재무 강제 재조회
    expect(mockFetch).toHaveBeenCalledTimes(1); expect(importCount()).toBe(1);
  }
});

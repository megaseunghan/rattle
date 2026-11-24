import { act, render } from '@testing-library/react-native';
import { queryClient } from '../../lib/query';
import { PosScreen } from '../../app/pos';

jest.mock('../../lib/supabase', () => ({ supabase: {} }));
const mockManualRefetch = jest.fn().mockResolvedValue(undefined);
const mockSync = jest.fn().mockResolvedValue(undefined);
const mockNoop = jest.fn().mockResolvedValue(undefined);
let mockStore: Record<string, unknown> = { id: 'store', closing_time: '23:00' };
// 실제 화면처럼 포커스된 상태에서 콜백이 바뀌면 다시 실행한다.
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => require('react').useEffect(() => cb(), [cb]),
}));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: mockStore, currentRole: 'admin', canManageStore: true }) }));
jest.mock('../../lib/contexts/TabPagerContext', () => ({ TabPagerContext: require('react').createContext(null) }));
jest.mock('../../lib/hooks/useTossSync', () => ({ useTossSync: () => ({ lastSyncAt: null, todaySales: 0, todayOrderCount: 0, loadTodaySales: mockNoop, syncByMonth: mockSync, autoSyncing: false, autoSyncRecent: mockSync }) }));
jest.mock('../../lib/hooks/usePosAnalytics', () => ({ usePosAnalytics: () => ({ summaries: [], loadingSummaries: false, fetchSummariesByRange: mockNoop }) }));
jest.mock('../../lib/hooks/useManualSales', () => ({ useManualSales: () => ({ sales: [], refetch: mockManualRefetch, total: 0 }) }));
jest.mock('../../lib/services/stores', () => ({ getStoreDetails: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: { children: unknown }) => children }));

const getDetails = () => require('../../lib/services/stores').getStoreDetails as jest.Mock;

beforeEach(() => {
  queryClient.clear(); jest.clearAllMocks();
  mockStore = { id: 'store', closing_time: '23:00' };
});

describe('매출 화면 요청 순서', () => {
  it('앱 시작 때 받은 매장 정보에 POS 미연동이 있으면 연결 확인을 기다리지 않고 수기 매출을 조회한다', async () => {
    mockStore = { id: 'store', closing_time: '23:00', toss_merchant_id: null };
    getDetails().mockImplementation(() => new Promise(() => {}));
    render(<PosScreen />);
    await act(async () => {});
    expect(getDetails()).toHaveBeenCalledTimes(1);
    expect(mockManualRefetch).toHaveBeenCalledTimes(1);
  });

  it('매장 정보에 POS 연결 여부가 없으면 연결 확인 뒤에 수기 매출을 조회한다', async () => {
    let resolve!: (v: unknown) => void;
    getDetails().mockImplementation(() => new Promise(r => { resolve = r; }));
    render(<PosScreen />);
    await act(async () => {});
    expect(mockManualRefetch).not.toHaveBeenCalled();
    await act(async () => { resolve({ toss_merchant_id: null, closing_time: '23:00' }); });
    expect(mockManualRefetch).toHaveBeenCalledTimes(1);
  });

  it('연결 확인이 거절된 적이 있으면 매장 정보의 미연동 값으로 수기 매출을 먼저 조회하지 않는다', async () => {
    getDetails().mockRejectedValue({ code: '42501', message: 'denied' });
    const first = render(<PosScreen />);
    await act(async () => {});
    first.unmount();
    mockManualRefetch.mockClear();
    mockStore = { id: 'store', closing_time: '23:00', toss_merchant_id: null };
    getDetails().mockImplementation(() => new Promise(() => {}));
    render(<PosScreen />);
    await act(async () => {});
    expect(mockManualRefetch).not.toHaveBeenCalled();
  });

  it('탭 재진입 때 수기 매출과 연결 확인을 한 번씩만 요청한다', async () => {
    mockStore = { id: 'store', closing_time: '23:00', toss_merchant_id: null };
    getDetails().mockResolvedValue({ toss_merchant_id: null, closing_time: '23:00' });
    const view = render(<PosScreen active />);
    await act(async () => {});
    view.rerender(<PosScreen active={false} />);
    await act(async () => {});
    mockManualRefetch.mockClear(); getDetails().mockClear();
    view.rerender(<PosScreen active />);
    await act(async () => {});
    expect(mockManualRefetch).toHaveBeenCalledTimes(1);
    expect(getDetails()).toHaveBeenCalledTimes(1);
  });
});

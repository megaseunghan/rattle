import { act, render, screen, waitFor, fireEvent, renderHook } from '@testing-library/react-native';
import { queryClient, queryKeys, useQueryScope, invalidateStoreData } from '../../lib/query';
import { PosScreen } from '../../app/pos';
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
const mockFetch = jest.fn().mockResolvedValue(undefined);
const mockToday = jest.fn().mockResolvedValue(undefined);
const mockSync = jest.fn();
const mockStore = { id: 'store', closing_time: '23:00' };
let mockLoading = true;
let mockRole = 'admin';
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: mockStore, currentRole: mockRole, canManageStore: mockRole === 'admin', devPreviewMode: 'self' }) }));
jest.mock('../../lib/contexts/TabPagerContext', () => ({ TabPagerContext: require('react').createContext(null) }));
jest.mock('../../lib/hooks/useTossSync', () => ({ useTossSync: () => ({ lastSyncAt: null, todaySales: 500, todayOrderCount: 1, loadTodaySales: mockToday, syncByMonth: mockSync, autoSyncing: true, autoSyncRecent: mockSync }) }));
jest.mock('../../lib/hooks/usePosAnalytics', () => ({ usePosAnalytics: () => ({ summaries: [{ date: '2026-10-01', totalAmount: 500, orderCount: 1 }], loadingSummaries: mockLoading, fetchSummariesByRange: mockFetch }) }));
jest.mock('../../lib/hooks/useManualSales', () => ({ useManualSales: () => ({ sales: [], refetch: mockToday, total: 0 }) }));
jest.mock('../../lib/services/stores', () => ({ getStoreDetails: jest.fn().mockResolvedValue({ toss_merchant_id: 'merchant', closing_time: '23:00' }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }));
beforeEach(() => { queryClient.clear(); jest.clearAllMocks(); mockLoading = true; mockRole = 'admin'; });

it('마감 설정 변경 후에는 새 마감으로 월을 조회해야 한다', async () => {
 require('../../lib/services/stores').getStoreDetails.mockResolvedValue({ toss_merchant_id: 'merchant', closing_time: '22:00' });
 mockStore.closing_time = '22:00'; mockSync.mockResolvedValue(undefined);
 const scope = renderHook(useQueryScope);
 queryClient.setQueryData(queryKeys.store(scope.result.current, 'store', 'pos', 'connection'), { toss_merchant_id: 'merchant', closing_time: '23:00' });
 render(<PosScreen />);
 await act(async () => {});
 expect(mockFetch).toHaveBeenCalled();
 expect(mockFetch.mock.calls[0][0].getUTCHours()).toBe(13);
});
it('연동 완료 직후 재마운트는 이전 미연동 캐시를 검증해야 한다', async () => {
 require('../../lib/services/stores').getStoreDetails.mockResolvedValue({ toss_merchant_id: 'merchant', closing_time: '23:00' });
 mockStore.closing_time = '23:00'; mockSync.mockResolvedValue(undefined);
 const scope = renderHook(useQueryScope);
 queryClient.setQueryData(queryKeys.store(scope.result.current, 'store', 'pos', 'connection'), { toss_merchant_id: null, closing_time: '23:00' });
 render(<PosScreen />);
 await act(async () => {});
 expect(screen.queryByText('오늘 매출')).not.toBeNull();
});
// 2026-11-24 재진입 캐시: 매장 연결 정보는 30분 재사용한다. 연결 설정 저장(updateStoreInfo)의 'pos' 무효화 뒤 복귀하면 다시 확인한다.
it('30분 안의 미연동 캐시는 진입 때 다시 확인하지 않고, 연결 저장 무효화 뒤 설정 화면 복귀를 반영한다', async () => {
 const getDetails = require('../../lib/services/stores').getStoreDetails;
 mockStore.closing_time = '23:00'; mockSync.mockResolvedValue(undefined);
 getDetails.mockResolvedValue({ toss_merchant_id: null, closing_time: '23:00' });
 const scope = renderHook(useQueryScope);
 queryClient.setQueryData(queryKeys.store(scope.result.current, 'store', 'pos', 'connection', '23:00:'), { toss_merchant_id: null, closing_time: '23:00' });
 render(<PosScreen />); await act(async () => {});
 expect(getDetails).toHaveBeenCalledTimes(0);
 const focus = require('expo-router').useFocusEffect.mock.calls.at(-1)[0];
 act(() => focus());
 getDetails.mockResolvedValue({ toss_merchant_id: 'merchant', closing_time: '23:00' });
 await act(async () => { await invalidateStoreData('store', ['pos']); });
 await act(async () => { focus(); });
 expect(screen.queryByText('오늘 매출')).not.toBeNull();
 expect(getDetails).toHaveBeenCalledTimes(1);
});

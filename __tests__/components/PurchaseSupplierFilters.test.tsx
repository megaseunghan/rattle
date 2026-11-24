import { router } from 'expo-router';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { PurchasesScreen } from '../../app/(tabs)/purchases';
let mockManagementCapability = true;
let mockPurchases: any[] = [];
const mockRefetch = jest.fn().mockResolvedValue(undefined);
const mockReadPurchases = jest.fn().mockResolvedValue(true);
const mockFocusListeners = new Set<() => void>();
const mockCategory = { categories: ['식자재'], loading: false, error: null, refetch: mockRefetch, add: jest.fn(), rename: jest.fn(), remove: jest.fn() };
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: (callback: () => void) => {
  require('react').useEffect(() => {
    mockFocusListeners.add(callback);
    callback();
    return () => { mockFocusListeners.delete(callback); };
  }, [callback]);
} }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: { id: 'store' }, currentRole: 'admin', canManageStore: mockManagementCapability }) }));
jest.mock('../../lib/contexts/TabPagerContext', () => ({ useTabPager: () => ({ selectedMonth: '2026-10', setSelectedMonth: jest.fn(), viewState: {} }) }));
jest.mock('../../lib/hooks/usePurchases', () => ({ usePurchases: () => ({ purchases: mockPurchases, loaded: true, loading: false, error: null, refetch: mockReadPurchases, remove: jest.fn() }) }));
jest.mock('../../lib/hooks/useExpenses', () => ({ useExpenses: () => ({ expenses: [], loading: false, refetch: mockRefetch }) }));
jest.mock('../../lib/hooks/usePurchaseCategories', () => ({ usePurchaseCategories: () => mockCategory }));
// 2026-11-24 재진입 캐시: 등록 화면에서 돌아올 때는 화면이 refetch를 부르지 않고 useRefreshOnReturn이 오래된 쿼리만 다시 받는다.
const mockRefreshOnReturn = jest.fn();
jest.mock('../../lib/query/useRefreshOnReturn', () => ({ useRefreshOnReturn: (target: unknown) => mockRefreshOnReturn(target) }));
jest.mock('../../lib/components/ExpensesPanel', () => ({ ExpensesPanel: () => null }));
jest.mock('../../lib/components/CategoryManageModal', () => ({ CategoryManageModal: () => null }));
jest.mock('../../lib/components/GlassCard', () => ({ GlassCard: ({ children }: any) => children }));
jest.mock('../../lib/components/GlassBackdrop', () => ({ GlassBackdrop: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }));
beforeEach(() => { mockPurchases = []; mockManagementCapability = true; jest.clearAllMocks(); });
it('매입이 없으면 거래처 필터와 기본 유형을 표시하지 않는다', async () => {
  render(<PurchasesScreen />);
  await act(async () => {});
  expect(screen.queryByText('거래처')).toBeNull();
  expect(screen.queryByText('쿠팡')).toBeNull();
  expect(screen.getByLabelText('매입 카테고리 관리')).toBeTruthy();
});
it('실제 입력된 거래처를 중복 없이 표시하고 거래처명으로 필터한다', async () => {
  mockPurchases = [
    { id: 'a', supplier: '동네상회', type: '수기', category: '식자재', date: '2026-10-01', amount: 100 },
    { id: 'b', supplier: '동네상회', type: '쿠팡', category: '식자재', date: '2026-10-02', amount: 200 },
    { id: 'c', supplier: '새벽시장', type: '수기', category: '식자재', date: '2026-10-03', amount: 300 },
  ];
  render(<PurchasesScreen />);
  await act(async () => {});
  expect(screen.getAllByLabelText('거래처 동네상회')).toHaveLength(1);
  fireEvent.press(screen.getByLabelText('거래처 동네상회'));
  expect(screen.getAllByText('동네상회').length).toBeGreaterThan(1);
  expect(screen.getAllByText('새벽시장')).toHaveLength(1); // filter chip only; list excludes this supplier
  expect(screen.queryByText('매입 유형')).toBeNull();
});
it('목록 응답의 품목 수를 별도 조회 없이 표시하고 0개는 숨긴다', async () => {
  mockPurchases = [
    { id: 'a', supplier: '동네상회', type: '수기', category: '식자재', date: '2026-10-01', amount: 100, item_count: 3 },
    { id: 'b', supplier: '새벽시장', type: '수기', category: '식자재', date: '2026-10-02', amount: 200, item_count: 0 },
  ];
  render(<PurchasesScreen />);
  await act(async () => {});
  expect(screen.getByText('3개 품목')).toBeTruthy();
  expect(screen.queryByText('0개 품목')).toBeNull();
});

it('이전 관리자 역할이 있어도 현재 권한이 없으면 카테고리 관리를 숨긴다', async () => {
  mockManagementCapability = false;
  render(<PurchasesScreen />);
  await act(async () => {});
  expect(screen.queryByLabelText('매입 카테고리 관리')).toBeNull();
});

it('복수 분류 매입은 목록 한 건으로 표시하고 선택한 분류의 금액만 합산한다', async () => {
  mockPurchases = [{ id: 'mixed', supplier: '가상 상점', type: '수기', category: '식자재', date: '2026-10-01',
    amount: 3500, category_amounts: { 식자재: 2000, 비품: 1500 }, item_count: 0 }];
  render(<PurchasesScreen />);
  await act(async () => {});
  expect(screen.getByText('식자재 · 비품')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('매입 카테고리 비품'));
  expect(screen.getAllByText('1,500원').length).toBeGreaterThan(0);
  expect(screen.queryByText('3,500원')).toBeNull();
});

it('매입 탭에서 선택일로 등록을 열고 돌아오면 쿼리 캐시 갱신으로 목록과 상단 건수를 바꾸고 화면이 따로 다시 받지 않는다', async () => {
  const view = render(<PurchasesScreen />);
  fireEvent.press(screen.getByText('날짜로 찾기 · 달력 펼치기'));
  fireEvent.press(screen.getByLabelText('2026년 10월 9일'));
  fireEvent.press(screen.getByText('+ 매입 추가'));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/purchases/new', params: { date: '2026-10-09' } });
  expect(mockRefreshOnReturn).toHaveBeenLastCalledWith(expect.objectContaining({ active: true, storeId: 'store', domains: expect.arrayContaining(['purchases', 'expenses']) }));
  mockReadPurchases.mockClear();
  // 등록 저장의 'purchases' 무효화로 캐시가 새 목록을 받은 상황
  mockPurchases = [{ id: 'new', supplier: '새 납품처', type: '수기', category: '식자재', date: '2026-10-09', amount: 3700 }];
  await act(async () => { mockFocusListeners.forEach(onFocus => onFocus()); });
  view.rerender(<PurchasesScreen />);
  expect(screen.getByText(/2026-10 매입 1건/)).toBeTruthy();
  expect(screen.getAllByText('새 납품처').length).toBeGreaterThan(0);
  expect(mockReadPurchases).not.toHaveBeenCalled();
  expect(screen.getByLabelText('2026년 10월 9일').props.accessibilityState.selected).toBe(true);
});

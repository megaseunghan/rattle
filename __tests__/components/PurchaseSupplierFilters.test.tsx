import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { PurchasesScreen } from '../../app/(tabs)/purchases';
let mockPurchases: any[] = [];
const mockRefetch = jest.fn().mockResolvedValue(undefined);
const mockCategory = { categories: ['식자재'], loading: false, error: null, refetch: mockRefetch, add: jest.fn(), rename: jest.fn(), remove: jest.fn() };
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: { id: 'store' }, currentRole: 'admin' }) }));
jest.mock('../../lib/contexts/TabPagerContext', () => ({ useTabPager: () => ({ selectedMonth: '2026-10', setSelectedMonth: jest.fn(), viewState: {} }) }));
jest.mock('../../lib/hooks/usePurchases', () => ({ usePurchases: () => ({ purchases: mockPurchases, loaded: true, loading: false, error: null, refetch: mockRefetch, remove: jest.fn() }) }));
jest.mock('../../lib/hooks/useExpenses', () => ({ useExpenses: () => ({ expenses: [], loading: false, refetch: mockRefetch }) }));
jest.mock('../../lib/hooks/usePurchaseCategories', () => ({ usePurchaseCategories: () => mockCategory }));
jest.mock('../../lib/services/purchases', () => ({ getPurchaseItemCounts: jest.fn().mockResolvedValue({}) }));
jest.mock('../../lib/components/ExpensesPanel', () => ({ ExpensesPanel: () => null }));
jest.mock('../../lib/components/CategoryManageModal', () => ({ CategoryManageModal: () => null }));
jest.mock('../../lib/components/GlassCard', () => ({ GlassCard: ({ children }: any) => children }));
jest.mock('../../lib/components/GlassBackdrop', () => ({ GlassBackdrop: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }));
beforeEach(() => { mockPurchases = []; jest.clearAllMocks(); });
it('매입이 없으면 거래처 필터와 기본 유형을 표시하지 않는다', async () => {
  render(<PurchasesScreen />);
  await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
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
  await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
  expect(screen.getAllByLabelText('거래처 동네상회')).toHaveLength(1);
  fireEvent.press(screen.getByLabelText('거래처 동네상회'));
  expect(screen.getAllByText('동네상회').length).toBeGreaterThan(1);
  expect(screen.getAllByText('새벽시장')).toHaveLength(1); // filter chip only; list excludes this supplier
  expect(screen.queryByText('매입 유형')).toBeNull();
});

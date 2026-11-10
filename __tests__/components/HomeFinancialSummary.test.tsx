import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { RefreshControl, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { HomeScreen } from '../../app/(tabs)';
import { HomeFinancialSummary } from '../../types';

const mockRefetch = jest.fn(async () => {});
const mockFetchTrend = jest.fn(async () => {});
const mockGoToTab = jest.fn();
const mockSetHomeMode = jest.fn();
const mockOpenStorePicker = jest.fn();
const mockSwitchStore = jest.fn(async () => {});
let mockInnerGestureActive = false;
let mockEmployment = 'regular';
let mockRole = 'member';
let mockCanRead = true;
let mockLoading = false;
let mockError: string | null = null;
let mockMissing = false;
let mockProfit = 4_820_000;
const current = new Date();
const currentYear = current.getFullYear();
const currentMonth = current.getMonth() + 1;
const summary = (yearMonth: string): HomeFinancialSummary => ({
  yearMonth, revenue: 35_580_000, purchaseCost: 11_050_000, laborCost: 12_450_000,
  fixedExpense: 5_000_000, variableExpense: 2_260_000, operatingProfit: mockProfit,
});
const mockTrend = (year: number, month: number) => ({
  bars: [-1, 0].map(offset => {
    const date = new Date(year, month - 1 + offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { key, label: `${date.getMonth() + 1}월`, isCurrent: offset === 0, data: mockMissing ? null : summary(key) };
  }),
  loading: mockLoading, selectedLoading: mockLoading, updating: false, error: mockError, refetch: mockFetchTrend,
});

jest.mock('../../lib/components/DailyOperationsHome', () => ({ DailyOperationsHome: () => require('react').createElement(require('react-native').Text, null, '오늘 업무 화면') }));
jest.mock('../../lib/components/GlassCard', () => ({ GlassCard: ({ children }: any) => children }));
jest.mock('../../lib/components/GlassBackdrop', () => ({ GlassBackdrop: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../lib/contexts/AuthContext', () => {
  const store = { id: 'store', name: '소속 매장' }; const user = { id: 'employee' };
  return { useAuth: () => ({ store, user, stores: [store], currentRole: mockRole, canReadFinancials: mockCanRead, realRole: mockRole, devPreviewMode: 'self', switchStore: mockSwitchStore }) };
});
jest.mock('../../lib/contexts/TabPagerContext', () => ({ useTabPager: () => {
  const React = require('react');
  const [selectedMonth, setSelectedMonth] = React.useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  return { innerGestureActive: mockInnerGestureActive, goToTab: mockGoToTab, setHomeMode: mockSetHomeMode, openStorePicker: mockOpenStorePicker, selectedMonth, setSelectedMonth };
} }));
jest.mock('../../lib/hooks/useIngredients', () => ({ useIngredients: () => ({ data: [], refetch: mockRefetch }) }));
jest.mock('../../lib/hooks/useEmployees', () => ({ useEmployees: () => ({ employees: [{ user_id: 'employee', is_active: true, employment_type: mockEmployment }], refetch: mockRefetch }) }));
jest.mock('../../lib/hooks/useNotifications', () => ({ useNotifications: () => ({ unreadCount: 0, refetch: mockRefetch }) }));
jest.mock('../../lib/hooks/useTossSync', () => ({ useTossSync: () => ({ todaySales: null, loadTodaySales: mockRefetch, autoSyncOnForeground: mockRefetch }) }));
jest.mock('../../lib/hooks/useHomeFinancialCard', () => ({ useHomeFinancialCard: () => ({ data: null, loading: false, refreshing: false, error: false, refetch: mockFetchTrend }) }));
jest.mock('../../lib/components/HomeFinancialCard', () => ({ HomeFinancialCard: () => require('react').createElement(require('react-native').View, { testID: 'home-financial-card' }) }));
jest.mock('../../lib/components/HomeAlertsPanel', () => ({ HomeAlertsPanel: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  mockInnerGestureActive = false;
  mockEmployment = 'regular'; mockRole = 'member'; mockLoading = false;
  mockCanRead = true; mockError = null; mockMissing = false; mockProfit = 4_820_000;
});

it.each(['regular', 'part_time'])('%s 직원의 공유 요약은 선택한 금액을 표시하고 상세 손익을 숨긴다', async employment => {
  mockEmployment = employment;
  render(<HomeScreen />);
  expect(screen.getByTestId('home-financial-card')).toBeTruthy();
  expect(screen.queryByText('손익 정산')).toBeNull();
  expect(screen.getByText('오늘 업무 화면')).toBeTruthy();
  await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
});
it('비공유 직원에게 재무 카드와 열기 버튼을 숨긴다', () => {
  mockCanRead = false;
  render(<HomeScreen />);
  expect(screen.queryByRole('button', { name: '월별 손익 요약' })).toBeNull();
  expect(screen.queryByTestId('home-financial-card')).toBeNull();
});
it('관리자 홈에서도 하단 손익 정산 버튼을 표시하지 않는다', () => {
  mockRole = 'admin';
  render(<HomeScreen />);
  expect(screen.queryByText('손익 정산')).toBeNull();
  expect(screen.getByTestId('home-financial-card')).toBeTruthy();
});

it("차트 조작 중 홈 세로 스크롤을 잠그고 종료 후 복원한다", () => {
 const view = render(<HomeScreen />);
 expect(view.UNSAFE_getByType(ScrollView).props.scrollEnabled).toBe(true);
 mockInnerGestureActive = true; view.rerender(<HomeScreen />);
 expect(view.UNSAFE_getByType(ScrollView).props.scrollEnabled).toBe(false);
 mockInnerGestureActive = false; view.rerender(<HomeScreen />);
 expect(view.UNSAFE_getByType(ScrollView).props.scrollEnabled).toBe(true);
});

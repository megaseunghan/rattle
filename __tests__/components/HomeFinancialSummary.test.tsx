import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { HomeScreen } from '../../app/(tabs)';
import { HomeFinancialSummary } from '../../types';

const mockRefetch = jest.fn(async () => {});
const mockFetchTrend = jest.fn(async () => {});
const mockGoToTab = jest.fn();
const mockSetHomeMode = jest.fn();
const mockOpenStorePicker = jest.fn();
const mockSwitchStore = jest.fn(async () => {});
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
  return { goToTab: mockGoToTab, setHomeMode: mockSetHomeMode, openStorePicker: mockOpenStorePicker, selectedMonth, setSelectedMonth };
} }));
jest.mock('../../lib/hooks/useIngredients', () => ({ useIngredients: () => ({ data: [], refetch: mockRefetch }) }));
jest.mock('../../lib/hooks/useEmployees', () => ({ useEmployees: () => ({ employees: [{ user_id: 'employee', is_active: true, employment_type: mockEmployment }], refetch: mockRefetch }) }));
jest.mock('../../lib/hooks/useNotifications', () => ({ useNotifications: () => ({ unreadCount: 0, refetch: mockRefetch }) }));
jest.mock('../../lib/hooks/useTossSync', () => ({ useTossSync: () => ({ todaySales: null, loadTodaySales: mockRefetch, autoSyncOnForeground: mockRefetch }) }));
jest.mock('../../lib/hooks/useProfitLossTrendChart', () => ({ useProfitLossTrendChart: (year: number, month: number) => mockTrend(year, month) }));
jest.mock('../../lib/components/HomeAlertsPanel', () => ({ HomeAlertsPanel: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  mockEmployment = 'regular'; mockRole = 'member'; mockLoading = false;
  mockError = null; mockMissing = false; mockProfit = 4_820_000;
});

it.each(['regular', 'part_time'])('%s 직원에게 실제 다섯 합계를 공개하고 상세 손익은 숨긴다', async employment => {
  mockEmployment = employment;
  render(<HomeScreen />);
  fireEvent.press(screen.getByRole('button', { name: '월별 손익 요약' }));
  for (const value of ['4,820,000원', '35,580,000원', '11,050,000원', '12,450,000원', '7,260,000원']) {
    expect(screen.getByText(value)).toBeTruthy();
  }
  expect(screen.queryByText('손익 정산')).toBeNull();
  expect(screen.getByText('오늘 업무 화면')).toBeTruthy();
  await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
});

it('기본 영업이익과 모든 금액 선택이 월별 추이에 연결된다', () => {
  render(<HomeScreen />);
  fireEvent.press(screen.getByRole('button', { name: '월별 손익 요약' }));
  expect(screen.getByRole('button', { name: '영업이익 4,820,000원 추이 보기' }).props.accessibilityState.selected).toBe(true);
  for (const [label, amount] of [['매출', '35,580,000원'], ['매입', '11,050,000원'], ['인건비', '12,450,000원'], ['비용', '7,260,000원'], ['영업이익', '4,820,000원']]) {
    fireEvent.press(screen.getByRole('button', { name: `${label} ${amount} 추이 보기` }));
    expect(screen.getByText(`${label} 추이`)).toBeTruthy();
    expect(screen.getByRole('button', { name: `${label} ${amount} 추이 보기` }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByText('4,820,000원')).toBeTruthy();
  }
});

it('선택 지표의 매출 비중과 전월 전체 대비를 실제 합계로 계산한다', () => {
  render(<HomeScreen />);
  fireEvent.press(screen.getByRole('button', { name: '월별 손익 요약' }));
  fireEvent.press(screen.getByRole('button', { name: '매입 11,050,000원 추이 보기' }));
  expect(screen.getByText('매출의 31.1%')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '인건비 12,450,000원 추이 보기' }));
  expect(screen.getByText('매출의 35%')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '비용 7,260,000원 추이 보기' }));
  expect(screen.getByText('매출의 20.4%')).toBeTruthy();
  expect(screen.getByText('선택 월 집계 · 전월 전체 대비 0.0%')).toBeTruthy();
});

it('월 이동과 그래프 탭은 기간을 변경하며 현재 이후는 차단한다', () => {
  render(<HomeScreen />);
  fireEvent.press(screen.getByRole('button', { name: '월별 손익 요약' }));
  expect(screen.getByRole('button', { name: '다음 달' }).props.accessibilityState.disabled).toBe(true);
  const previous = new Date(currentYear, currentMonth - 2, 1);
  const previousLabel = `${previous.getFullYear()}년 ${previous.getMonth() + 1}월`;
  fireEvent.press(screen.getByRole('button', { name: '이전 달' }));
  expect(screen.getByText(previousLabel)).toBeTruthy();
  expect(screen.getByText(`소속 매장 · ${previousLabel}`)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '다음 달' }));
  expect(screen.getByText(`${currentYear}년 ${currentMonth}월`)).toBeTruthy();
  const key = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
  fireEvent.press(screen.getByRole('button', { name: `${key} 영업이익 4,820,000원` }));
  expect(screen.getByText(previousLabel)).toBeTruthy();
});

it('조회 실패는 0원으로 바뀌지 않고 재시도와 당겨서 새로고침을 유지한다', async () => {
  mockMissing = true; mockError = '매장 요약을 불러오지 못했어요.';
  render(<HomeScreen />);
  fireEvent.press(screen.getByRole('button', { name: '월별 손익 요약' }));
  expect(screen.getAllByText('—')).toHaveLength(7);
  expect(screen.queryByText('0원')).toBeNull();
  expect(screen.getByText(mockError)).toBeTruthy();
  fireEvent.press(screen.getByText('다시 시도'));
  expect(mockFetchTrend).toHaveBeenCalledTimes(1);
  fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
  await waitFor(() => expect(mockFetchTrend).toHaveBeenCalledTimes(2));
  expect(mockRefetch).toHaveBeenCalledWith(true);
});

it('선택 월 로딩 중에는 과거 금액 대신 진행 상태를 보여준다', () => {
  mockLoading = true;
  render(<HomeScreen />);
  fireEvent.press(screen.getByRole('button', { name: '월별 손익 요약' }));
  expect(screen.getByRole('button', { name: '영업이익 불러오는 중 추이 보기' }).props.accessibilityState.busy).toBe(true);
  expect(screen.queryByText('4,820,000원')).toBeNull();
});

it.each([0, -120_000])('영업이익 %s원을 누락 없이 표시한다', profit => {
  mockProfit = profit;
  render(<HomeScreen />);
  fireEvent.press(screen.getByRole('button', { name: '월별 손익 요약' }));
  expect(screen.getByText(`${profit.toLocaleString()}원`)).toBeTruthy();
  expect(screen.getByText(`매출 대비 이익률 ${profit === 0 ? '0' : '-0.3'}%`)).toBeTruthy();
});

it('관리자 상세 손익과 통합 대시보드, 공통 메뉴 연결을 유지한다', () => {
  mockRole = 'admin';
  render(<HomeScreen />);
  fireEvent.press(screen.getByRole('button', { name: '월별 손익 요약' }));
  fireEvent.press(screen.getByText('손익 정산'));
  expect(router.push).toHaveBeenCalledWith('/profit-loss');
  fireEvent.press(screen.getByRole('button', { name: '더보기' }));
  expect(mockGoToTab).toHaveBeenCalledWith('more');
  fireEvent.press(screen.getByRole('button', { name: '알림' }));
  expect(router.push).toHaveBeenCalledWith('/notifications');
  fireEvent.press(screen.getByRole('button', { name: '마이페이지' }));
  expect(router.push).toHaveBeenCalledWith('/mypage');
  fireEvent.press(screen.getByRole('button', { name: '매장 전환' }));
  expect(mockOpenStorePicker).toHaveBeenCalledTimes(1);
});

it('공유하지 않는 직원은 금액·추세·매입/비용 바로가기를 보지 않고 업무 홈을 본다', () => {
  mockRole = 'member'; mockCanRead = false;
  const view = render(<HomeScreen />);
  expect(view.getByText('오늘 업무 화면')).toBeTruthy();
  expect(view.queryByText('35,580,000원')).toBeNull();
  expect(view.queryByText('바로가기')).toBeNull();
  mockCanRead = true;
});

it('첫 화면에서는 금액을 접어두고 업무를 먼저 보여준다', () => {
  render(<HomeScreen />);
  expect(screen.getByText('오늘 업무 화면')).toBeTruthy();
  expect(screen.queryByText('4,820,000원')).toBeNull();
  expect(screen.getByRole('button', { name: '월별 손익 요약' }).props.accessibilityState.expanded).toBe(false);
});

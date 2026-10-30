import { fireEvent, render, screen } from '@testing-library/react-native';
import { AdminDashboardScreen } from '../../app/admin/index';
const mockDashboard = { ownedStores: [{ id: 'a', name: '매장A' }, { id: 'b', name: '매장B' }], period: 'month', setPeriod: jest.fn(), anchorYear: 2026, anchorMonth: 10, isCurrentMonth: true,
  pnl: { current: [{ storeId: 'a', storeName: '매장A', revenue: 100, profit: 10, purchaseCost: 30, laborCost: 20, otherExpense: 40 }, { storeId: 'b', storeName: '매장B', revenue: 300, profit: 30, purchaseCost: 90, laborCost: 60, otherExpense: 120 }], previous: [] },
  trend: [], weeklyCleaning: {}, weeklySchedule: { a: [{ weekday: 1, headcount: 2, totalHours: 16, shifts: [] }], b: [{ weekday: 1, headcount: 3, totalHours: 24, shifts: [] }] }, errors: { pnl: false, trend: false, cleaning: {}, schedule: {} }, financialError: null, loading: false, refetch: jest.fn(), goPrev: jest.fn(), goNext: jest.fn() };
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ realRole: 'admin', switchStore: jest.fn() }) }));
jest.mock('../../lib/contexts/TabPagerContext', () => ({ useTabPager: () => ({ goToTab: jest.fn(), openStorePicker: jest.fn(), selectStoreScope: jest.fn(), selectedMonth: '2026-10', setSelectedMonth: jest.fn() }) }));
jest.mock('../../lib/hooks/useAdminDashboard', () => ({ useAdminDashboard: () => mockDashboard }));
jest.mock('../../lib/components/GlassBackdrop', () => ({ GlassBackdrop: () => null }));
jest.mock('../../lib/components/HomeAlertsPanel', () => ({ HomeAlertsPanel: () => null }));
jest.mock('../../lib/components/DashboardBreakdownCard', () => ({ DashboardBreakdownCard: () => null }));
jest.mock('../../lib/components/DashboardProfitRing', () => ({ DashboardProfitRing: ({ revenue, profit }: { revenue: number; profit: number }) => { const { Text } = require('react-native'); return <Text>{`ring ${revenue} ${profit}`}</Text>; } }));
jest.mock('../../lib/components/DashboardSchedule', () => ({ DashboardSchedule: ({ days }: { days: { headcount: number }[] }) => { const { Text } = require('react-native'); return <Text>{`schedule ${days?.[0]?.headcount}`}</Text>; } }));
it('상단 칩으로 이동 없이 손익과 스케줄을 같은 매장 범위로 전환한다', () => {
  render(<AdminDashboardScreen />);
  expect(screen.getByText('ring 400 40')).toBeTruthy();
  expect(screen.queryByText('40원')).toBeNull();
  expect(screen.queryByText('schedule 5')).toBeNull();
  expect(screen.queryByText('전체 매장 · 운영 현황')).toBeNull();
  fireEvent.press(screen.getByLabelText('매장B 영업이익'));
  expect(screen.getByText('ring 300 30')).toBeTruthy();
  expect(screen.getByText('schedule 3')).toBeTruthy();
  expect(screen.getByLabelText('매장B 영업이익').props.accessibilityState.selected).toBe(true);
  fireEvent.press(screen.getByLabelText('전체 매장 영업이익'));
  expect(screen.getByText('ring 400 40')).toBeTruthy();
  expect(screen.queryByText('schedule 5')).toBeNull();
  expect(screen.queryByText('전체 매장 · 운영 현황')).toBeNull();
  expect(screen.queryByText('매장별 현황')).toBeNull();
});
it('매장이 많으면 검색을 제공하고 세로 매장 카드 목록을 만들지 않는다', () => {
  const original = mockDashboard.ownedStores;
  mockDashboard.ownedStores = Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: `매장${i}` }));
  try {
    render(<AdminDashboardScreen />);
    fireEvent.changeText(screen.getByLabelText('대시보드 매장 검색'), '매장19');
    expect(screen.getByLabelText('매장19 영업이익')).toBeTruthy();
    expect(screen.queryByLabelText('매장0 영업이익')).toBeNull();
    expect(screen.queryByText('매장별 현황')).toBeNull();
  } finally { mockDashboard.ownedStores = original; }
});

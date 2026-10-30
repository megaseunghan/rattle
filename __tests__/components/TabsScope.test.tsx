jest.mock('../../lib/services/qaLogin', () => ({ isQaLoginEnabled: () => false }));
jest.mock('../../lib/hooks/useNotifications', () => ({ useNotifications: () => ({ unreadCount: 0 }) }));
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import TabsLayout from '../../app/(tabs)/_layout';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('../../lib/components/GlassCard', () => ({ GlassCard: ({ children }: any) => children }));
jest.mock('../../lib/components/GlassBackdrop', () => ({ GlassBackdrop: () => null }));
function renderTabs() {
  const view = render(<TabsLayout />);
  mockPager.setPageWithoutAnimation.mockClear();
  mockPager.setPage.mockClear();
  return view;
}

const mockSwitchStore = jest.fn();
const mockPush = jest.fn();
const mockSetParams = jest.fn();
const mockRouter = { push: mockPush, setParams: mockSetParams };
let mockPagerContext: unknown;
const mockRefetch = jest.fn();
const mockPager = { setPage: jest.fn(), setPageWithoutAnimation: jest.fn() };
let mockRouteParams: Record<string, string | undefined> = {};
const mockStores = [{ id: 'a', name: '가매장' }, { id: 'b', name: '나매장' }];
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner' }, store: mockStores[0], stores: mockStores, switchStore: mockSwitchStore, currentRole: 'admin', realRole: 'admin', canReadFinancials: true, devPreviewMode: 'self' }) }));
jest.mock('../../lib/hooks/useEmployees', () => ({ useEmployees: () => ({ employees: [], refetch: mockRefetch }) }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockRouteParams, useRouter: () => mockRouter }));
jest.mock('react-native-pager-view', () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => mockPager);
    return <View testID="pager" {...props} />;
  });
});
jest.mock('../../lib/components/DraggableFab', () => ({ DraggableFab: ({ onPress }: { onPress: () => void }) => {
  const React = require('react'); const { Pressable } = require('react-native');
  return React.createElement(Pressable, { onPress, accessibilityLabel: '빠른 등록 열기', accessibilityRole: 'button' });
} }));
jest.mock('../../lib/components/MoreDrawer', () => ({ MoreDrawer: () => null }));
jest.mock('../../app/(tabs)/index', () => ({ HomeScreen: () => {
  mockPagerContext = require('../../lib/contexts/TabPagerContext').useTabPager();
  return null;
} }));
jest.mock('../../app/(tabs)/stock', () => ({ StockScreen: () => null }));
jest.mock('../../app/(tabs)/purchases', () => ({ PurchasesScreen: () => null }));
jest.mock('../../app/(tabs)/payroll', () => ({ PayrollScreen: () => {
  const React = require('react'); const { Text, Pressable } = require('react-native');
  const { useTabPager } = require('../../lib/contexts/TabPagerContext');
  const ctx = useTabPager();
  return ctx.employeeRegistration ? React.createElement(Pressable, { onPress: ctx.consumeEmployeeRegistration }, React.createElement(Text, null, `등록요청 ${ctx.employeeRegistration.storeId}`)) : null;
} }));
jest.mock('../../app/admin/index', () => ({ AdminDashboardScreen: () => {
  const React = require('react'); const { Text } = require('react-native');
  const { useTabPager } = require('../../lib/contexts/TabPagerContext');
  return React.createElement(Text, null, `전체 ${useTabPager().selectedMonth}`);
} }));
jest.mock('../../app/pos/index', () => ({ PosScreen: () => null }));

beforeEach(() => { jest.clearAllMocks(); mockRouteParams = { targetTab: 'home', homeScope: 'all' }; mockSetParams.mockImplementation(params => { mockRouteParams = { ...mockRouteParams, ...params }; }); mockSwitchStore.mockResolvedValue(undefined); });
it('전체매장에서 업무탭 선택 후 취소하면 이전 매장으로 넘어가지 않는다', () => {
  const view = renderTabs();
  fireEvent.press(view.getByText('매입'));
  expect(view.getByText('이 업무를 진행할 매장을 먼저 선택해 주세요.')).toBeTruthy();
  expect(mockPager.setPage).not.toHaveBeenCalled();
  fireEvent.press(view.getByLabelText('매장 선택 닫기'));
  expect(mockSwitchStore).not.toHaveBeenCalled();
  expect(view.getByTestId('pager').props.scrollEnabled).toBe(false);
});
it('매장 선택이 성공한 뒤에만 요청한 업무탭으로 이동한다', async () => {
  let resolve!: () => void;
  mockSwitchStore.mockImplementation(() => new Promise<void>(done => { resolve = done; }));
  const view = renderTabs();
  fireEvent.press(view.getByText('매입'));
  fireEvent.press(view.getByText('나매장'));
  expect(mockSwitchStore).toHaveBeenCalledWith('b');
  expect(mockPager.setPageWithoutAnimation).not.toHaveBeenCalled();
  await act(async () => resolve());
  expect(mockPager.setPageWithoutAnimation).toHaveBeenCalledWith(2);
  expect(view.getByTestId('pager').props.scrollEnabled).toBe(true);
});
it('전환 실패는 선택창에 남기고 업무탭으로 이동하지 않는다', async () => {
  mockSwitchStore.mockRejectedValue(new Error('unavailable'));
  const view = renderTabs();
  fireEvent.press(view.getByText('인건비'));
  fireEvent.press(view.getByText('나매장'));
  await waitFor(() => expect(view.getByText('매장을 바꾸지 못했어요. 다시 선택해 주세요.')).toBeTruthy());
  expect(mockPager.setPageWithoutAnimation).not.toHaveBeenCalled();
  expect(view.getByTestId('pager').props.scrollEnabled).toBe(false);
});
it('전체매장에서 페이지 이벤트가 도착해도 매장 선택을 우회하지 않는다', () => {
  const view = renderTabs();
  fireEvent(view.getByTestId('pager'), 'pageSelected', { nativeEvent: { position: 3 } });
  expect(mockPager.setPageWithoutAnimation).toHaveBeenCalledWith(0);
  expect(view.getByText('이 업무를 진행할 매장을 먼저 선택해 주세요.')).toBeTruthy();
  expect(mockSwitchStore).not.toHaveBeenCalled();
});

it('급여조건 완료의 복귀 요청에서 전체 범위와 과거 월을 복원한다', () => {
  mockRouteParams = { targetTab: 'home', homeScope: 'all', month: '2025-12' };
  const view = renderTabs();
  expect(view.getByText('전체 2025-12')).toBeTruthy();
  expect(view.getByTestId('pager').props.scrollEnabled).toBe(false);
  expect(mockSetParams).toHaveBeenCalledWith({ targetTab: undefined, homeScope: undefined, month: undefined });
});

it('탭을 누르는 즉시 선택하고 이전 탭 콜백이 새 선택을 되돌리지 않는다', () => {
  mockRouteParams = { targetTab: 'home', homeScope: 'store', month: '2026-09' };
  const view = renderTabs();
  fireEvent.press(view.getByRole('tab', { name: '재고' }));
  expect(view.getByRole('tab', { name: '재고' }).props.accessibilityState.selected).toBe(true);
  fireEvent.press(view.getByRole('tab', { name: '매입' }));
  fireEvent(view.getByTestId('pager'), 'pageSelected', { nativeEvent: { position: 1 } });
  expect(view.getByRole('tab', { name: '매입' }).props.accessibilityState.selected).toBe(true);
  fireEvent(view.getByTestId('pager'), 'pageSelected', { nativeEvent: { position: 2 } });
  fireEvent.press(view.getByRole('tab', { name: '매입' }));
  fireEvent(view.getByTestId('pager'), 'pageSelected', { nativeEvent: { position: 3 } });
  expect(view.getByRole('tab', { name: '인건비' }).props.accessibilityState.selected).toBe(true);
  expect(mockPager.setPage).not.toHaveBeenCalled();
});

it('전체 홈에서도 플로팅 등록을 제공하고 매입 등록 전 매장을 선택한다', () => {
  const view = renderTabs();
  fireEvent.press(view.getByLabelText('빠른 등록 열기'));
  fireEvent.press(view.getByText('매입 등록'));
  expect(view.getByText('이 업무를 진행할 매장을 먼저 선택해 주세요.')).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
});

it('직원 등록은 매장 전환 성공 후 선택한 매장에만 요청한다', async () => {
  const view = renderTabs();
  fireEvent.press(view.getByLabelText('빠른 등록 열기'));
  fireEvent.press(view.getByText('직원 등록'));
  expect(view.queryByText('등록요청 a')).toBeNull();
  fireEvent.press(view.getByText('나매장'));
  await waitFor(() => expect(view.getByText('등록요청 b')).toBeTruthy());
  expect(mockPager.setPageWithoutAnimation).toHaveBeenCalledWith(3);
});

it('직원 등록 매장 선택을 취소하면 다음 일반 전환에서 등록을 열지 않는다', async () => {
  const view = renderTabs();
  fireEvent.press(view.getByLabelText('빠른 등록 열기'));
  fireEvent.press(view.getByText('직원 등록'));
  fireEvent.press(view.getByLabelText('매장 선택 닫기'));
  fireEvent.press(view.getByRole('tab', { name: '인건비' }));
  fireEvent.press(view.getByText('나매장'));
  await waitFor(() => expect(mockSwitchStore).toHaveBeenCalledWith('b'));
  expect(view.queryByText('등록요청 b')).toBeNull();
});

it('이미 인건비 탭이어도 직원 등록 요청을 반복해서 열 수 있다', () => {
  mockRouteParams = { targetTab: 'payroll', homeScope: 'store' };
  const view = renderTabs();
  for (let i = 0; i < 2; i++) {
    fireEvent.press(view.getByLabelText('빠른 등록 열기'));
    fireEvent.press(view.getByText('직원 등록'));
    fireEvent.press(view.getByText('등록요청 a'));
    expect(view.queryByText('등록요청 a')).toBeNull();
  }
});

it('첫 홈은 선택된 매장 업무 흐름이며 전체 매장 범위로 시작하지 않는다', () => {
  mockRouteParams = {};
  const view = renderTabs();
  expect(view.getByTestId('pager').props.scrollEnabled).toBe(true);
  fireEvent.press(view.getByRole('tab', { name: '매입' }));
  expect(view.queryByText('이 업무를 진행할 매장을 먼저 선택해 주세요.')).toBeNull();
});

it('재고 탭에서도 홈과 같은 상단바로 알림·마이페이지·매장 선택을 연다', async () => {
  const view = renderTabs();
  fireEvent.press(view.getByRole('tab', { name: '재고' }));
  fireEvent.press(view.getByText('나매장'));
  await waitFor(() => expect(view.getByRole('tab', { name: '재고' }).props.accessibilityState.selected).toBe(true));
  fireEvent.press(view.getByLabelText('알림'));
  expect(mockPush).toHaveBeenCalledWith('/notifications');
  fireEvent.press(view.getByLabelText('마이페이지'));
  expect(mockPush).toHaveBeenCalledWith('/mypage');
  fireEvent.press(view.getByLabelText('매장 전환'));
  expect(view.getByLabelText('매장 선택 닫기')).toBeTruthy();
});


it('빠른 등록을 열어도 업무 범위가 같으면 컨텍스트 참조를 유지한다', () => {
  mockRouteParams = {};
  const view = renderTabs();
  const previous = mockPagerContext;
  fireEvent.press(view.getByLabelText('빠른 등록 열기'));
  expect(mockPagerContext).toBe(previous);
  fireEvent.press(view.getByRole('tab', { name: '재고' }));
  expect(mockPagerContext).not.toBe(previous);
});

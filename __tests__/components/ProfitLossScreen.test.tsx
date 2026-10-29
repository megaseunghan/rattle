import { notifyManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { withTiming } from 'react-native-reanimated';
beforeAll(() => { notifyManager.setNotifyFunction(callback => { act(() => callback()); }); });
afterAll(() => { notifyManager.setNotifyFunction(callback => callback()); });
import { clearQueryData } from '../../lib/query/client';
import ProfitLossScreen from '../../app/profit-loss';
// 모션 자체는 Release 앱 영상으로 확인하고, 여기서는 완료 콜백과 화면 수명만 제어한다.
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Easing } = require('react-native');
  return {
    __esModule: true, default: { View }, Easing, ReduceMotion: { System: 'system' },
    cancelAnimation: jest.fn(), useSharedValue: (value: number) => React.useRef({ value }).current,
    useAnimatedStyle: (style: () => unknown) => style(),
    withTiming: jest.fn((value: number, _config: unknown, callback?: (finished: boolean) => void) => { callback?.(true); return value; }),
  };
});
jest.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));

const mockLoad = jest.fn();
let mockRole = 'admin';
let mockStore = { id: 'a', closing_time: '23:00' };
jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ currentRole: mockRole, store: mockStore }) }));
jest.mock('../../lib/services/profitLoss', () => ({ getYearlyProfitLoss: (...args: unknown[]) => mockLoad(...args) }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));
const annual = (amount: number) => [{ month: 1, data: { yearMonth: '2026-01', revenue: amount,
  cardRevenue: amount, cashRevenue: 0, grossProfit: amount,
  fixedExpense: 0, variableExpense: 0, partTimeGross: 0,
  operatingProfit: amount, laborCost: 0, purchaseCost: 0 } }];
beforeEach(async () => { await act(async () => { await clearQueryData(); }); jest.clearAllMocks(); mockRole = 'admin'; mockStore = { id: 'a', closing_time: '23:00' }; });

afterEach(async () => { await act(async () => { await clearQueryData(); }); });

it('조회 실패를 처리하고 내부 오류 대신 재시도 안내를 제공한다', async () => {
  mockLoad.mockRejectedValueOnce(new Error('Gateway Timeout')).mockResolvedValueOnce(annual(123456));
  render(<ProfitLossScreen />);
  await waitFor(() => expect(screen.getByText('손익을 불러오지 못했어요.')).toBeTruthy());
  expect(screen.queryByText('Gateway Timeout')).toBeNull();
  fireEvent.press(screen.getByText('다시 시도'));
  await waitFor(() => expect(screen.getAllByText('영업이익').length).toBeGreaterThan(0));
  expect(mockLoad).toHaveBeenCalledTimes(2);
});

it('닫힘 모션이 끝날 때까지 내용을 유지하고 닫기 연속 탭을 무시한다', async () => {
  mockLoad.mockResolvedValue(annual(123456));
  render(<ProfitLossScreen />);
  await waitFor(() => expect(screen.getByText('1월')).toBeTruthy());
  fireEvent.press(screen.getByText('1월'));
  let finish!: (finished: boolean) => void;
  (withTiming as jest.Mock).mockImplementation((value, _config, callback) => { if (callback) finish = callback; return value; });
  const close = screen.getByRole('button', { name: '월별 손익계산서 닫기' });
  fireEvent.press(close);
  expect(screen.getByText('2026년 1월 손익계산서')).toBeTruthy();
  const count = (withTiming as jest.Mock).mock.calls.length;
  fireEvent.press(close);
  expect(withTiming).toHaveBeenCalledTimes(count);
  expect(withTiming).toHaveBeenCalledWith(expect.any(Number), expect.objectContaining({ reduceMotion: 'system' }), expect.any(Function));
  act(() => finish(true));
  expect(screen.queryByText('2026년 1월 손익계산서')).toBeNull();
  (withTiming as jest.Mock).mockImplementation((value, _config, callback) => { callback?.(true); return value; });
});
it('매장이 바뀐 후에는 이전 매장의 늦은 조회 결과를 표시하지 않는다', async () => {
  let done!: (value: unknown) => void;
  mockLoad.mockImplementationOnce(() => new Promise(resolve => { done = resolve; })).mockResolvedValueOnce(annual(222222));
  const { rerender } = render(<ProfitLossScreen />);
  mockStore = { ...mockStore, id: 'b' };
  rerender(<ProfitLossScreen />);
  await waitFor(() => expect(screen.getAllByText('222,222원').length).toBeGreaterThan(0));
  await act(async () => { done(annual(111111)); });
  expect(screen.queryByText('111,111원')).toBeNull();
});

it('일반 직원에게 전체 손익을 조회하지 않는다', () => {
  mockRole = 'member';
  render(<ProfitLossScreen />);
  expect(screen.getByText('관리자만 확인할 수 있어요.')).toBeTruthy();
  expect(mockLoad).not.toHaveBeenCalled();
});

it('같은 매장에 다시 진입하면 신선한 상세 손익 캐시를 사용한다', async () => {
  mockLoad.mockResolvedValue(annual(333333));
  const first = render(<ProfitLossScreen />);
  await waitFor(() => expect(screen.getAllByText('333,333원').length).toBeGreaterThan(0));
  first.unmount();
  render(<ProfitLossScreen />);
  expect(screen.getAllByText('333,333원').length).toBeGreaterThan(0);
  expect(mockLoad).toHaveBeenCalledTimes(1);
});

it('월 인건비 누락을 연간 합계 0원이나 정상 이익으로 표시하지 않는다', async () => {
  mockLoad.mockResolvedValue([{month:1,data:{yearMonth:'2026-01',revenue:123456,operatingProfit:null,laborCost:null,purchaseCost:1000}}]);
  render(<ProfitLossScreen />);
  await waitFor(() => expect(screen.getAllByText('확인 필요').length).toBeGreaterThanOrEqual(3));
  expect(screen.getAllByText('123,456원').length).toBeGreaterThan(0);
});

it('월별 상세 본문을 눌러도 유지하고 닫은 뒤 다른 월을 열 수 있다', async () => {
  mockLoad.mockResolvedValue([...annual(123456), {
    month: 2, data: { ...annual(222222)[0].data, yearMonth: '2026-02' },
  }]);
  render(<ProfitLossScreen />);
  await waitFor(() => expect(screen.getByText('1월')).toBeTruthy());
  fireEvent.press(screen.getByText('1월'));
  expect(screen.getByText('2026년 1월 손익계산서')).toBeTruthy();
  fireEvent.press(screen.getByText('5. 영업이익'));
  expect(screen.getByText('2026년 1월 손익계산서')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '월별 손익계산서 닫기' }));
  await waitFor(() => expect(screen.queryByText('2026년 1월 손익계산서')).toBeNull());
  fireEvent.press(screen.getByText('2월'));
  expect(screen.getByText('2026년 2월 손익계산서')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('월별 손익계산서 배경 닫기', { includeHiddenElements: true }));
  await waitFor(() => expect(screen.queryByText('2026년 2월 손익계산서')).toBeNull());
});

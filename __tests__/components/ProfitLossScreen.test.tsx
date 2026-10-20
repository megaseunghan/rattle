import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ProfitLossScreen from '../../app/profit-loss';

const mockLoad = jest.fn();
let mockStore = { id: 'a', closing_time: '23:00' };
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: mockStore }) }));
jest.mock('../../lib/services/profitLoss', () => ({ getYearlyProfitLoss: (...args: unknown[]) => mockLoad(...args) }));
const annual = (amount: number) => [{ month: 1, data: { yearMonth: '2026-01', revenue: amount,
  operatingProfit: amount, laborCost: 0, purchaseCost: 0 } }];
beforeEach(() => { jest.clearAllMocks(); mockStore = { id: 'a', closing_time: '23:00' }; });

it('조회 실패를 처리하고 내부 오류 대신 재시도 안내를 제공한다', async () => {
  mockLoad.mockRejectedValueOnce(new Error('Gateway Timeout')).mockResolvedValueOnce(annual(123456));
  render(<ProfitLossScreen />);
  await waitFor(() => expect(screen.getByText('손익을 불러오지 못했어요.')).toBeTruthy());
  expect(screen.queryByText('Gateway Timeout')).toBeNull();
  fireEvent.press(screen.getByText('다시 시도'));
  await waitFor(() => expect(screen.getAllByText('영업이익').length).toBeGreaterThan(0));
  expect(mockLoad).toHaveBeenCalledTimes(2);
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

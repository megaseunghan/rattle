import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { HomeFinancialCard } from '../../lib/components/HomeFinancialCard';
import { buildCumulativeDays, HomeFinancialCardData } from '../../lib/utils/homeFinancialCard';
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
jest.mock('../../lib/hooks/useReducedTransparency', () => ({ useReducedTransparency: () => true }));
const mockChartMount = jest.fn();
jest.mock('../../lib/components/home-financial/FinancialAreaChart', () => ({ FinancialAreaChart: ({ current, metric }: any) => { require('react').useEffect(() => { mockChartMount(); }, []); return require('react').createElement(require('react-native').Text, null, current.at(-1)?.values[metric] == null ? '일별 자료 확인 필요' : '일별 그래프'); } }));
const data: HomeFinancialCardData = { date: '2026-11-05', totals: { profit: 200, revenue: 1000, purchase: 300, labor: 300, expense: 200 }, current: buildCumulativeDays('2026-11', 5, [{ date: '2026-11-01', revenue: 500, purchase: 100 }]), previous: [], hasRecords: null };
const props = { data, loading: false, refreshing: false, error: false, onRetry: jest.fn(async () => {}) };
it('월 집계 이익률과 일별 매입 비율은 각자의 기간 분모를 사용한다', () => {
  render(<HomeFinancialCard {...props} />);
  expect(screen.getByText('11월의 영업이익')).toBeTruthy();
  expect(screen.getByText('이익률 20.0%')).toBeTruthy();
  expect(screen.getByText('일별 자료 확인 필요')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '매입' }));
  expect(screen.getByText('11월 5일까지의 매입')).toBeTruthy();
  expect(screen.getByText('매출 대비 20.0%')).toBeTruthy();
  expect(screen.queryByText(/전월 대비/)).toBeNull();
});
it('0원과 실제 빈 자료를 구분한다', () => {
  const view = render(<HomeFinancialCard {...props} data={{ ...data, totals: { ...data.totals, profit: 0 } }} />);
  expect(screen.getByLabelText('0원')).toBeTruthy();
  view.rerender(<HomeFinancialCard {...props} data={{ ...data, hasRecords: false }} />);
  expect(screen.getByText('집계된 자료가 없어요')).toBeTruthy();
  expect(screen.queryByLabelText('0원')).toBeNull();
});
it('최초 실패에는 금액·이익률을 숨기고 재조회한다', async () => {
  render(<HomeFinancialCard {...props} data={null} error />);
  expect(screen.queryByText(/이익률/)).toBeNull();
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '다시 불러오기' })); });
  expect(props.onRetry).toHaveBeenCalledTimes(1);
});
it('갱신 실패는 기존 금액을 보존한다', () => {
  render(<HomeFinancialCard {...props} error />);
  expect(screen.getByLabelText('200원')).toBeTruthy();
  expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy();
});

it('항목을 연속 선택해도 그래프 인스턴스를 유지해 모핑이 이어진다', () => {
  mockChartMount.mockClear();
  render(<HomeFinancialCard {...props} />);
  fireEvent.press(screen.getByRole('button', { name: '매출' }));
  fireEvent.press(screen.getByRole('button', { name: '매입' }));
  expect(mockChartMount).toHaveBeenCalledTimes(1);
  expect(screen.getByText('11월 5일까지의 매입')).toBeTruthy();
});

it('일별 자료 유무와 항목 전환에도 그래프와 범례 공간을 유지한다', () => {
 const { StyleSheet } = require('react-native');
 render(<HomeFinancialCard {...props} />);
 for (const name of ['영업이익', '매출', '매입', '인건비', '비용']) {
  fireEvent.press(screen.getByRole('button', { name }));
  expect(StyleSheet.flatten(screen.getByTestId('financial-chart-region').props.style).height).toBe(242);
  expect(StyleSheet.flatten(screen.getByTestId('financial-chart-legend').props.style).height).toBe(18);
 }
});

import { fireEvent, render, screen } from '@testing-library/react-native';
import { DashboardProfitTrend } from '../../lib/components/DashboardProfitTrend';
it('음수·0·양수를 같은 축의 꺾은선으로 표시한다', () => {
  render(<DashboardProfitTrend data={[{ label: '8월', value: -100 }, { label: '9월', value: 0 }, { label: '10월', value: 200 }]} />);
  expect(screen.getAllByTestId('profit-trend-line')).toHaveLength(1);
  const points = screen.getAllByTestId('profit-trend-point');
  expect(points[0].props.cy).toBeGreaterThan(points[1].props.cy);
  expect(points[1].props.cy).toBeGreaterThan(points[2].props.cy);
});
it('미확인 월을 0원으로 만들거나 양옆 월을 이어 그리지 않는다', () => {
  render(<DashboardProfitTrend data={[{ label: '6월', value: 10 }, { label: '7월', value: 20 }, { label: '8월', value: null }, { label: '9월', value: 30 }, { label: '10월', value: 40 }]} />);
  expect(screen.getAllByTestId('profit-trend-line')).toHaveLength(2);
  expect(screen.getAllByTestId('profit-trend-point')).toHaveLength(4);
  expect(screen.getByLabelText('8월 영업이익 확인 필요')).toBeTruthy();
});
it('월을 누르면 기존 기간 선택 동작에 해당 인덱스를 전달한다', () => {
  const onSelect = jest.fn();
  render(<DashboardProfitTrend data={[{ label: '9월', value: 10000 }, { label: '10월', value: 20000 }]} onSelect={onSelect} />);
  fireEvent.press(screen.getByLabelText('10월 영업이익 20,000원'));
  expect(onSelect).toHaveBeenCalledWith(1);
});
it('모든 금액이 0원이어도 좌표가 유효한 수평선을 표시한다', () => {
  render(<DashboardProfitTrend data={[{ label: '9월', value: 0 }, { label: '10월', value: 0 }]} />);
  const points = screen.getAllByTestId('profit-trend-point');
  expect(Number.isFinite(points[0].props.cy)).toBe(true);
  expect(points[0].props.cy).toBe(points[1].props.cy);
});
it('모든 기간이 미확인이면 가짜 선을 표시하지 않는다', () => {
  render(<DashboardProfitTrend data={[{ label: '9월', value: null }, { label: '10월', value: null }]} />);
  expect(screen.queryAllByTestId('profit-trend-line')).toHaveLength(0);
  expect(screen.queryAllByTestId('profit-trend-point')).toHaveLength(0);
  expect(screen.getByText('추세 금액을 확인해주세요')).toBeTruthy();
});
it('같은 부드러운 경로를 0원 위 파랑과 아래 빨강으로 나눈다', () => {
  render(<DashboardProfitTrend data={[{ label: '8월', value: -100 }, { label: '9월', value: 200 }, { label: '10월', value: 50 }]} />);
  const positive = screen.getByTestId('profit-trend-line');
  const negative = screen.getByTestId('profit-trend-negative-line');
  expect(positive.props.d).toContain(' C ');
  expect(positive.props.d).toBe(negative.props.d);
  expect(positive.props.stroke).not.toBe(negative.props.stroke);
  expect(positive.props.clipPath).toMatch(/positive/);
  expect(negative.props.clipPath).toMatch(/negative/);
});
it('0원 수평선은 파란색만 표시한다', () => {
  render(<DashboardProfitTrend data={[{ label: '9월', value: 0 }, { label: '10월', value: 0 }]} />);
  expect(screen.queryByTestId('profit-trend-negative-line')).toBeNull();
});

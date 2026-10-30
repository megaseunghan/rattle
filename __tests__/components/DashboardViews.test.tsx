import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { DashboardMetric } from '../../lib/services/dashboardBreakdown';
import { DashboardProfitRing } from '../../lib/components/DashboardProfitRing';
import { DashboardSchedule } from '../../lib/components/DashboardSchedule';
import type { WeeklyScheduleDay } from '../../lib/services/adminDashboard';
it('매출 기준으로 이익률과 네 가지 항목을 표시하고 항목 선택을 전달한다', () => {
  const onSelect = jest.fn();
  render(<DashboardProfitRing revenue={1000} profit={250} purchase={300} expense={200} labor={250} onSelect={onSelect} />);
  expect(screen.getByLabelText('영업이익률 25.0%')).toBeTruthy();
  expect(screen.getAllByTestId('profit-donut-segment')).toHaveLength(4);
  expect(screen.getByText('매출 = 매입 + 비용 + 인건비 + 영업이익')).toBeTruthy();
  for (const label of ['매출', '매입', '비용', '인건비']) expect(screen.getByLabelText(`${label} 세부 보기`)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('매입 세부 보기'));
  expect(onSelect).toHaveBeenCalledWith('purchase');
});
it('적자 비율은 음수로 유지하고 100% 초과 지출은 실제 수치를 안내한다', () => {
  render(<DashboardProfitRing revenue={1000} profit={-200} purchase={700} expense={200} labor={300} />);
  expect(screen.getByLabelText('영업이익률 -20.0%')).toBeTruthy();
  expect(screen.getByText('적자 상태 · 도넛은 전체 지출 구성으로 표시해요')).toBeTruthy();
  expect(screen.getAllByTestId('profit-donut-segment')).toHaveLength(3);
});
it('급여 미확인 금액을 0원이나 0%로 바꾸지 않는다', () => {
  render(<DashboardProfitRing revenue={1000} profit={null} labor={null} />);
  expect(screen.getByLabelText('비율 확인 필요')).toBeTruthy();
  expect(screen.getAllByText('확인 필요').length).toBeGreaterThan(0);
  expect(screen.queryAllByTestId('profit-donut-segment')).toHaveLength(0);
});
it('요일을 누르면 해당 날짜의 근무자를 보여주고 긴 명단은 네 명씩 전환한다', () => {
  const days: WeeklyScheduleDay[] = [{ weekday: 1, headcount: 6, totalHours: 48, maxOverlap: 6, segments: [], shifts: Array.from({ length: 6 }, (_, i) => ({ employeeName: `직원${i + 1}`, start: '09:00', end: '18:00' })) }, { weekday: 2, headcount: 0, totalHours: 0, shifts: [], maxOverlap: 0, segments: [] }];
  render(<DashboardSchedule days={days} />);
  fireEvent.press(screen.getByLabelText('월요일 6명'));
  expect(screen.getByText('직원1')).toBeTruthy();
  expect(screen.queryByText('직원5')).toBeNull();
  fireEvent.press(screen.getByLabelText('다음 근무자'));
  expect(screen.getByText('직원5')).toBeTruthy();
  expect(screen.queryByText('직원1')).toBeNull();
  fireEvent.press(screen.getByLabelText('화요일 0명'));
  expect(screen.getByText('등록된 근무가 없어요')).toBeTruthy();
});
it('조회 실패를 휴무나 0명으로 표시하지 않는다', () => {
  render(<DashboardSchedule error />);
  expect(screen.getByText('스케줄을 불러오지 못했어요')).toBeTruthy();
  expect(screen.queryByLabelText('월요일 0명')).toBeNull();
});

it('항목을 누르면 도넛 중앙 이름·금액·비율이 같이 바뀌고 해제하면 영업이익으로 복귀한다', () => {
  function InteractiveRing() {
    const [selected, setSelected] = useState<DashboardMetric | null>(null);
    return <DashboardProfitRing revenue={1000} profit={250} purchase={300} expense={200} labor={250} selected={selected} onSelect={metric => setSelected(current => current === metric ? null : metric)} />;
  }
  render(<InteractiveRing />);
  for (const [label, amount, percent] of [['매입', '300원', '30.0%'], ['비용', '200원', '20.0%'], ['인건비', '250원', '25.0%'], ['매출', '1,000원', '100.0%']]) {
    fireEvent.press(screen.getByLabelText(`${label} 세부 보기`));
    const center = within(screen.getByLabelText(`도넛 중앙 ${label} 보기`));
    expect(center.getByText(label)).toBeTruthy();
    expect(center.getByText(amount)).toBeTruthy();
    expect(center.getByText(`매출 대비 ${percent}`)).toBeTruthy();
  }
  fireEvent.press(screen.getByLabelText('매출 세부 보기'));
  const center = within(screen.getByLabelText('도넛 중앙 영업이익 보기'));
  expect(center.getByText('영업이익')).toBeTruthy();
  expect(center.getByText('250원')).toBeTruthy();
  expect(center.getByText('이익률 25.0%')).toBeTruthy();
});
it('선택한 인건비가 미확인이면 중앙에도 0원이 아닌 확인 필요를 표시한다', () => {
  render(<DashboardProfitRing revenue={1000} profit={null} labor={null} selected="labor" />);
  const center = within(screen.getByLabelText('도넛 중앙 인건비 보기'));
  expect(center.getByText('확인 필요')).toBeTruthy();
  expect(center.getByText('매출 대비 확인 필요')).toBeTruthy();
});

it('도넛 안 총매출과 항목 설명을 표시하고 총매출에서 세부 항목을 연다', () => {
  const onSelect = jest.fn();
  render(<DashboardProfitRing revenue={1000} profit={250} purchase={300} expense={200} labor={250} onSelect={onSelect} />);
  expect(screen.getByText('총매출')).toBeTruthy();
  expect(screen.getByText('현금·카드 등 총매출')).toBeTruthy();
  expect(screen.getByText('식자재·비품·소모품 매입')).toBeTruthy();
  expect(screen.getByText('고정비·공과금·수수료 등')).toBeTruthy();
  expect(screen.getByText('직원·파트타이머 세전 급여')).toBeTruthy();
  expect(screen.getByLabelText('매입 구성비 30.0%')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('도넛 총매출 세부 보기'));
  expect(onSelect).toHaveBeenCalledWith('revenue');
});

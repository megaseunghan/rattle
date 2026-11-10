import 'react-native-gesture-handler/jestSetup';
import { act, fireEvent, render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';
Object.assign(Reanimated, { useEvent: () => undefined });
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { FinancialAreaChart } from '../../lib/components/home-financial/FinancialAreaChart';
import { TabPagerContext } from '../../lib/contexts/TabPagerContext';
import { buildCumulativeDays } from '../../lib/utils/homeFinancialCard';
const days = buildCumulativeDays('2026-11', 3, [{ date: '2026-11-01', revenue: 100, purchase: 10 }]);
it.each([State.END, State.CANCELLED])('네이티브 터치 시작부터 종료/취소(%s)까지 스크롤을 잠근다', end => {
 const lock = jest.fn();
 const view = render(<TabPagerContext.Provider value={{ setPagerGestureActive: lock } as any}><FinancialAreaChart current={days} previous={[]} metric="revenue" date="2026-11-03" /></TabPagerContext.Provider>);
 const gesture = getByGestureTestId('financial-chart-pan');
 expect(gesture.config.minDist).toBe(0);
 expect(gesture.config.shouldCancelWhenOutside).toBe(false);
 act(() => fireGestureHandler(gesture, [
  { state: State.BEGAN, x: 10, y: 50 },
  { state: State.ACTIVE, x: 180, y: 160 },
  { state: end, x: 180, y: 160 },
 ]));
 const owner = lock.mock.calls[0][0];
 expect(lock).toHaveBeenNthCalledWith(1, owner, true);
 expect(lock).toHaveBeenLastCalledWith(owner, false);
 view.unmount();
 expect(lock).toHaveBeenLastCalledWith(owner, false);
});

it.each([false, true])('첫 등장 모션은 모션 줄이기(%s) 설정을 따른다', reduced => {
 const { Animated } = require('react-native');
 const timing = jest.spyOn(Animated, 'timing');
 try {
  const view = render(<FinancialAreaChart current={days} previous={[]} metric="revenue" date="2026-11-03" animateEntry reduced={reduced} />);
  expect(timing.mock.calls.some((call: any) => call[1].duration === 320 && call[1].useNativeDriver)).toBe(!reduced);
  view.unmount();
 } finally { timing.mockRestore(); }
});

it('하단 날짜 눈금은 숨기고 빈 그래프도 동일 높이를 유지한다', () => {
 const { StyleSheet } = require('react-native');
 const view = render(<FinancialAreaChart current={days} previous={[]} metric="revenue" date="2026-11-03" />);
 expect(view.queryByText('1일')).toBeNull();
 expect(view.queryByText('3일')).toBeNull();
 const height = StyleSheet.flatten(view.getByTestId('financial-chart-touch-surface').props.style).height;
 view.rerender(<FinancialAreaChart current={[]} previous={[]} metric="labor" date="2026-11-03" />);
 expect(StyleSheet.flatten(view.getByTestId('financial-chart-no-timeline').props.style).height).toBe(height);
});

it('B 범위 금액은 날짜 탐색 중에만 보이고 종료하면 숨긴다', () => {
 const view = render(<FinancialAreaChart current={days} previous={[]} metric="revenue" date="2026-11-03" />);
 expect(view.queryByTestId('chart-range-high')).toBeNull();
 const surface = view.getByRole('adjustable');
 fireEvent(surface, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
 expect(view.getByTestId('chart-range-high')).toBeTruthy();
 fireEvent(surface, 'accessibilityAction', { nativeEvent: { actionName: 'escape' } });
 expect(view.queryByTestId('chart-range-high')).toBeNull();
});
it('음수 범위에서만 점선 없는 0 기준선을 표시한다', () => {
 const view = render(<FinancialAreaChart current={days} previous={[]} metric="revenue" date="2026-11-03" />);
 expect(view.queryByTestId('chart-zero-baseline')).toBeNull();
 const negative = days.map(row => ({ ...row, values: { ...row.values, revenue: -100 } }));
 view.rerender(<FinancialAreaChart current={negative} previous={[]} metric="revenue" date="2026-11-03" />);
 expect(view.getByTestId('chart-zero-baseline').props.strokeDasharray).toBeUndefined();
 expect(view.getByTestId('chart-zero-baseline').props.strokeOpacity).toBe(0.22);
});

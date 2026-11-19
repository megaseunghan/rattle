import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, PanResponder } from 'react-native';
import AttendanceDesign, { dateLabel, timeLabel } from '../../dev/attendance-design/AttendanceDesign';

jest.mock('../../lib/components/GlassBackdrop', () => ({ GlassBackdrop: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 62, bottom: 34, left: 0, right: 0 }) };
});
jest.mock('@react-native-community/datetimepicker', () => require('react-native').View);
beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => { act(() => jest.runOnlyPendingTimers()); jest.useRealTimers(); jest.restoreAllMocks(); });
async function open() {
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '기록 정정 요청' })); });
}
it('기존 분 단위 시간을 유지하고 날짜만 바꾸면 시각은 변하지 않는다', async () => {
  render(<AttendanceDesign />); await open();
  expect(screen.getByText('11월 17일 · 오전 9:02')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('변경할 날짜 11월 17일'));
  fireEvent(screen.getByTestId('attendance-design-picker'), 'onChange', { type: 'set' }, new Date(2026, 10, 18, 0, 0));
  expect(screen.getByLabelText('변경할 날짜 11월 18일')).toBeTruthy();
  expect(screen.getByLabelText('변경할 시간 오전 9:02')).toBeTruthy();
});
it('시각 변경 후 취소하고 다시 열어도 날짜와 사유 초안을 보존한다', async () => {
  render(<AttendanceDesign />); await open();
  fireEvent.press(screen.getByLabelText('변경할 시간 오전 9:02'));
  fireEvent(screen.getByTestId('attendance-design-picker'), 'onChange', { type: 'set' }, new Date(2026, 10, 20, 12, 2));
  fireEvent.changeText(screen.getByLabelText('기록 정정 사유'), '출근 시각 확인 부탁드려요');
  fireEvent.press(screen.getByRole('button', { name: '취소' })); act(() => jest.runAllTimers());
  await open();
  expect(screen.getByLabelText('변경할 날짜 11월 17일')).toBeTruthy();
  expect(screen.getByLabelText('변경할 시간 오후 12:02')).toBeTruthy();
  expect(screen.getByLabelText('기록 정정 사유').props.value).toBe('출근 시각 확인 부탁드려요');
});
it('제출은 빈 사유를 안내하고 유효 사유에도 실제 전송이 없음을 표시한다', async () => {
  render(<AttendanceDesign />); await open();
  fireEvent.press(screen.getByRole('button', { name: '정정 요청' }));
  expect(screen.getByText('기록 정정 사유를 적어주세요')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('기록 정정 사유'), '테스트 사유');
  fireEvent.press(screen.getByRole('button', { name: '정정 요청' }));
  expect(screen.getByText('디자인 미리보기예요. 실제 요청은 전송되지 않아요.')).toBeTruthy();
});
it('자정 정오와 연도 경계를 같은 표기 규칙으로 보여준다', () => {
  expect(timeLabel(new Date(2026, 10, 17, 0, 2))).toBe('오전 12:02');
  expect(timeLabel(new Date(2026, 10, 17, 12, 2))).toBe('오후 12:02');
  expect(dateLabel(new Date(2027, 0, 1))).toBe('2027년 1월 1일');
});
it('닫기 진행 중 짧은 드래그가 끝나도 닫기 애니메이션을 취소하지 않는다', async () => {
  const create = jest.spyOn(PanResponder, 'create');
  const timing = jest.spyOn(Animated, 'timing');
  render(<AttendanceDesign />); await open();
  fireEvent.press(screen.getByLabelText('정정 요청 닫기'));
  const closingCalls = timing.mock.calls.length;
  act(() => create.mock.calls[0][0].onPanResponderRelease?.({} as never, { dy: 10, vy: 0 } as never));
  expect(timing).toHaveBeenCalledTimes(closingCalls);
});

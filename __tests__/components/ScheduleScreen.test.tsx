import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Alert } from 'react-native';
import ScheduleSettingsScreen from '../../app/mypage/schedule';

const mockRefetch = jest.fn(), mockEmployeesRefetch = jest.fn(), mockSubmit = jest.fn();
let mockRouteDay: string | string[] | undefined;
let mockUser = 'u', mockStore = 's', mockPreview = 'self', mockEmployeeId: string | null = null;
let mockLoading = false, mockSubmitting = false, mockSchedule: any[], mockPending: any = null;
const employees = [{ id: 'e', name: '홍길동', user_id: 'u' }, { id: 'other', name: '다른 직원', user_id: 'other-user' }];
jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => ({ day: mockRouteDay }) }));
jest.mock('../../lib/icons/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mockUser }, store: { id: mockStore, name: '래틀' }, realRole: 'admin', devPreviewMode: mockPreview, devPreviewEmployeeId: mockEmployeeId }) }));
jest.mock('../../lib/hooks/useEmployees', () => ({ useEmployees: () => ({ employees, loading: false, error: null, refetch: mockEmployeesRefetch }) }));
jest.mock('../../lib/hooks/useSchedule', () => ({ useSchedule: () => ({ schedule: mockSchedule, pendingRequest: mockPending, loading: mockLoading, submitting: mockSubmitting, refetch: mockRefetch, submit: mockSubmit }) }));
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native');
  return (props: any) => <View {...props} />;
});
jest.mock('../../lib/components/ui', () => {
  const { Text, TouchableOpacity } = require('react-native');
  return { AppBar: ({ title }: any) => <Text>{title}</Text>, Button: ({ label, onPress, disabled, loading }: any) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled || loading} onPress={onPress}><Text>{label}</Text></TouchableOpacity> };
});
beforeEach(() => {
  jest.clearAllMocks(); mockRouteDay = undefined; mockUser = 'u'; mockStore = 's'; mockPreview = 'self'; mockEmployeeId = null;
  mockLoading = false; mockSubmitting = false; mockPending = null;
  mockSchedule = [{ day_of_week: 3, is_working: true, start_time: '10:00:00', end_time: '19:00:00' }];
  mockRefetch.mockResolvedValue(undefined); mockEmployeesRefetch.mockResolvedValue(undefined); mockSubmit.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
async function mount() {
  const view = render(<ScheduleSettingsScreen />);
  await waitFor(() => expect(screen.getByLabelText(/^수요일 .*일정 수정$/)).toBeTruthy());
  return view;
}
const open = (day = '수') => fireEvent.press(screen.getByLabelText(new RegExp(`^${day}요일 .*일정 수정$`)));
const setStart = (hours = 11) => {
  fireEvent.press(screen.getByLabelText('시작 시간 오전 10:00'));
  const date = new Date(); date.setHours(hours, 30, 0, 0);
  fireEvent(screen.getByTestId('schedule-time-picker'), 'onChange', { type: 'set' }, date);
};
it('요일 바로 아래 한 개만 펼치고 같은 요일을 다시 누르면 접는다', async () => {
  await mount(); open();
  expect(within(screen.getByTestId('schedule-day-3')).getByTestId('schedule-editor-3')).toBeTruthy();
  open('목'); expect(screen.queryByTestId('schedule-editor-3')).toBeNull();
  expect(screen.getByTestId('schedule-editor-4')).toBeTruthy();
  open('목'); expect(screen.queryByTestId('schedule-editor-4')).toBeNull();
});
it('시작/종료는 하나의 휠을 공유하고 같은 버튼을 누르면 닫는다', async () => {
  await mount(); open(); expect(screen.queryByTestId('schedule-time-picker')).toBeNull();
  fireEvent.press(screen.getByLabelText('시작 시간 오전 10:00'));
  expect(screen.getAllByTestId('schedule-time-picker')).toHaveLength(1);
  fireEvent.press(screen.getByLabelText('종료 시간 오후 7:00'));
  expect(screen.getByTestId('schedule-time-picker').props.value.getHours()).toBe(19);
  fireEvent.press(screen.getByLabelText('종료 시간 오후 7:00'));
  expect(screen.queryByTestId('schedule-time-picker')).toBeNull();
});
it('취소하면 시간과 근무 여부를 변경하지 않는다', async () => {
  await mount(); open(); setStart(); fireEvent.press(screen.getByLabelText('요일 수정 취소'));
  open(); expect(screen.getByLabelText('시작 시간 오전 10:00')).toBeTruthy();
  fireEvent(screen.getByLabelText('수요일 근무 여부'), 'valueChange', false);
  fireEvent.press(screen.getByLabelText('요일 수정 취소')); open();
  expect(screen.getByLabelText('수요일 근무 여부').props.value).toBe(true);
  expect(mockSubmit).not.toHaveBeenCalled();
});
it('다른 요일 적용은 작성안만 변경하고 제출할 때 24시간 시간값을 전달한다', async () => {
  await mount(); open(); setStart(0);
  fireEvent.press(screen.getByLabelText('금요일에도 적용'));
  fireEvent.press(screen.getByLabelText('요일 변경 적용'));
  expect(mockSubmit).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByLabelText('변경 요청하기')));
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  const submitted = mockSubmit.mock.calls[0][0];
  expect(submitted.find((d: any) => d.day_of_week === 3)).toMatchObject({ start_time: '00:30:00', end_time: '19:00:00', is_working: true });
  expect(submitted.find((d: any) => d.day_of_week === 5)).toMatchObject({ start_time: '00:30:00', end_time: '19:00:00', is_working: true });
  expect(submitted.find((d: any) => d.day_of_week === 4).is_working).toBe(false);
});
it('미리보기에서는 적용을 해도 실제 제출할 수 없다', async () => {
  mockPreview = 'regular'; mockEmployeeId = 'e'; await mount(); open();
  fireEvent.press(screen.getByLabelText('요일 변경 적용'));
  await act(async () => fireEvent.press(screen.getByLabelText('미리보기 중 (제출 불가)')));
  expect(mockSubmit).not.toHaveBeenCalled();
});
it('최초 조회가 끝나기 전에는 휴무 일정이나 저장 버튼을 표시하지 않는다', async () => {
  let resolve!: () => void; mockRefetch.mockImplementation(() => new Promise<void>(yes => { resolve = yes; }));
  render(<ScheduleSettingsScreen />);
  expect(screen.getByLabelText('스케줄 불러오는 중')).toBeTruthy();
  expect(screen.queryByLabelText(/^수요일 .*일정 수정$/)).toBeNull();
  await act(async () => resolve());
  expect(screen.getByLabelText(/^수요일 .*일정 수정$/)).toBeTruthy();
});
it('조회 실패를 표시하고 재시도로 복구한다', async () => {
  mockRefetch.mockRejectedValueOnce(new Error('조회 실패'));
  render(<ScheduleSettingsScreen />); await waitFor(() => expect(screen.getByText('일정을 불러오지 못했어요')).toBeTruthy());
  expect(screen.queryByLabelText(/^수요일 .*일정 수정$/)).toBeNull();
  await act(async () => fireEvent.press(screen.getByLabelText('다시 불러오기')));
  expect(screen.getByLabelText(/^수요일 .*일정 수정$/)).toBeTruthy();
});
it('매장이나 직원 미리보기 변경 시 열린 편집과 작성안을 초기화한다', async () => {
  const view = await mount(); open(); setStart();
  fireEvent.press(screen.getByLabelText('요일 변경 적용')); open();
  mockStore = 'other-store'; view.rerender(<ScheduleSettingsScreen />);
  await waitFor(() => expect(screen.getByLabelText(/^수요일 .*일정 수정$/)).toBeTruthy());
  expect(screen.queryByTestId('schedule-editor-3')).toBeNull();
  expect(screen.queryByLabelText('변경 요청하기')).toBeNull();
  open(); expect(screen.getByLabelText('시작 시간 오전 10:00')).toBeTruthy();
  mockPreview = 'regular'; mockEmployeeId = 'other'; view.rerender(<ScheduleSettingsScreen />);
  await waitFor(() => expect(screen.getByLabelText(/^수요일 .*일정 수정$/)).toBeTruthy());
  expect(screen.queryByTestId('schedule-editor-3')).toBeNull();
});
it('새 조회 배열이 도착해도 이미 적용한 작성안은 덮어쓰지 않는다', async () => {
  const view = await mount(); open(); setStart(); fireEvent.press(screen.getByLabelText('요일 변경 적용'));
  mockSchedule = mockSchedule.map(day => ({ ...day, start_time: '08:00:00' })); view.rerender(<ScheduleSettingsScreen />);
  open(); expect(screen.getByLabelText('시작 시간 오전 11:30')).toBeTruthy();
});
it('요청 연타를 막고 실패 후 작성안을 유지한다', async () => {
  let reject!: (reason: Error) => void; mockSubmit.mockImplementation(() => new Promise((_yes, no) => { reject = no; }));
  await mount(); open(); setStart(); fireEvent.press(screen.getByLabelText('요일 변경 적용'));
  fireEvent.press(screen.getByLabelText('변경 요청하기')); fireEvent.press(screen.getByLabelText('변경 요청하기'));
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error('제출 실패')));
  expect(Alert.alert).toHaveBeenCalledWith('요청 실패', '잠시 후 다시 시도해주세요.');
  open(); expect(screen.getByLabelText('시작 시간 오전 11:30')).toBeTruthy();
});
it('승인 대기 안내를 유지하며 계정에 연결된 직원이 없으면 편집을 표시하지 않는다', async () => {
  mockPending = { id: 'pending' }; const view = await mount(); expect(screen.getByText('변경 요청 승인 대기 중이에요.')).toBeTruthy();
  mockUser = 'unlinked'; view.rerender(<ScheduleSettingsScreen />);
  expect(screen.getByText('연결된 직원 정보가 없어요')).toBeTruthy();
  expect(screen.queryByLabelText(/^수요일 .*일정 수정$/)).toBeNull();
});

it('편집 중 도착한 조회값은 취소 후 반영하고 편집값을 덮어쓰지 않는다', async () => {
  const view = await mount(); open(); setStart();
  mockSchedule = mockSchedule.map(day => ({ ...day, start_time: '08:00:00' })); view.rerender(<ScheduleSettingsScreen />);
  expect(screen.getByLabelText('시작 시간 오전 11:30')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('요일 수정 취소')); open();
  expect(screen.getByLabelText('시작 시간 오전 8:00')).toBeTruthy();
});

it('요일 행 접근성 이름에 현재 근무시간과 휴무 상태를 포함한다', async () => {
  await mount();
  expect(screen.getByLabelText('수요일 오전 10:00부터 오후 7:00까지 근무, 일정 수정')).toBeTruthy();
  expect(screen.getByLabelText('월요일 휴무, 일정 수정')).toBeTruthy();
  open(); setStart(); fireEvent.press(screen.getByLabelText('요일 변경 적용'));
  expect(screen.getByLabelText('수요일 오전 11:30부터 오후 7:00까지 근무, 일정 수정')).toBeTruthy();
});

it('남은 근무는 확정 일정으로 계산하고 작성안은 집계하지 않는다', async () => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-11T09:59:00Z'));
  try {
    await mount();
    expect(screen.getByText('이번 주는 1일 더 근무할 예정이에요')).toBeTruthy();
    open(); fireEvent(screen.getByLabelText('수요일 근무 여부'), 'valueChange', false);
    fireEvent.press(screen.getByLabelText('요일 변경 적용'));
    expect(screen.getByText('이번 주는 1일 더 근무할 예정이에요')).toBeTruthy();
    act(() => jest.advanceTimersByTime(60000));
    expect(screen.getByText('이번 주 예정된 근무를 모두 마쳤어요')).toBeTruthy();
  } finally { jest.useRealTimers(); }
});
it('등록 일정이 없으면 근무 완료로 안내하지 않는다', async () => {
  mockSchedule = [];
  render(<ScheduleSettingsScreen />);
  await waitFor(() => expect(screen.getByText('이번 주 근무 일정을 확인해보세요')).toBeTruthy());
  expect(screen.queryByText('이번 주 예정된 근무를 모두 마쳤어요')).toBeNull();
});

it('마이페이지에서 지정한 요일은 조회가 끝난 뒤 해당 시간으로 펼친다', async () => {
  mockRouteDay = '3'; await mount();
  expect(screen.getByTestId('schedule-editor-3')).toBeTruthy();
  expect(screen.getByLabelText('시작 시간 오전 10:00')).toBeTruthy();
  open(); expect(screen.queryByTestId('schedule-editor-3')).toBeNull();
});
it('잘못된 요일 파라미터는 무시한다', async () => {
  mockRouteDay = '7'; await mount();
  expect(screen.queryByTestId('schedule-editor-3')).toBeNull();
});

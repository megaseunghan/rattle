import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import MyPageScreen from '../../app/mypage';
const mockPush = jest.fn(), mockReplace = jest.fn(), mockSignOut = jest.fn();
const mockRefetch = jest.fn(), mockEmployeesRefetch = jest.fn();
let mockRole = 'admin', mockRealRole = 'admin', mockMode = 'self', mockPreviewEmployee: string | null = null;
let mockUser = 'user', mockStore = 'store', mockSchedule: any[], mockLoading = false;
let mockEmployees: any[];
jest.mock('expo-router', () => ({
  router: { push: (...args: any[]) => mockPush(...args), replace: (...args: any[]) => mockReplace(...args), back: jest.fn() },
  useFocusEffect: (callback: any) => require('react').useEffect(callback, [callback]),
}));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({
  user: { id: mockUser, email: 'test@example.test', user_metadata: { full_name: '사장님' } }, store: { id: mockStore, name: '래틀' },
  currentRole: mockRole, realRole: mockRealRole, devPreviewMode: mockMode, devPreviewEmployeeId: mockPreviewEmployee, signOut: mockSignOut,
}) }));
jest.mock('../../lib/hooks/useEmployees', () => ({ useEmployees: () => ({ employees: mockEmployees, refetch: mockEmployeesRefetch }) }));
jest.mock('../../lib/hooks/useSchedule', () => ({ useSchedule: () => ({ schedule: mockSchedule, loading: mockLoading, refetch: mockRefetch }) }));
jest.mock('../../lib/icons/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('../../lib/icons/Illustration', () => ({ Illustration: ({ name, size }: any) => {
  const { View } = require('react-native'); return <View testID={`illustration-${name}`} style={{ width: size, height: size }} />;
} }));
jest.mock('../../lib/components/ui', () => ({ AppBar: ({ title }: any) => {
  const { Text } = require('react-native'); return <Text>{title}</Text>;
} }));
beforeEach(() => {
  jest.clearAllMocks(); mockRole = 'admin'; mockRealRole = 'admin'; mockMode = 'self'; mockPreviewEmployee = null;
  mockUser = 'user'; mockStore = 'store'; mockLoading = false;
  mockEmployees = [{ id: 'employee', user_id: 'user', name: '홍길동', employment_type: 'regular' }, { id: 'pt', user_id: 'part', name: '파트', employment_type: 'part_time' }];
  mockSchedule = [{ id: 'wed', day_of_week: 3, is_working: true, start_time: '10:00:00', end_time: '19:00:00' }, { id: 'mon', day_of_week: 1, is_working: false, start_time: null, end_time: null }];
  mockRefetch.mockResolvedValue(undefined); mockEmployeesRefetch.mockResolvedValue(undefined); mockSignOut.mockResolvedValue(undefined);
  jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-11-11T00:00:00Z').getTime());
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
async function mount() {
  const view = render(<MyPageScreen />);
  await waitFor(() => expect(screen.getByLabelText(/^오늘 근무/)).toBeTruthy());
  return view;
}
const toggle = () => fireEvent.press(screen.getByLabelText(/^오늘 근무/));
it('화면형 소제목과 3D 메뉴를 표시하고 오늘 행은 초기 접힘이다', async () => {
  await mount();
  for (const heading of ['내 정보', '근무 일정', '내 메뉴']) expect(screen.getByText(heading)).toBeTruthy();
  expect(screen.queryByTestId('mypage-weekly-schedule')).toBeNull();
  expect(screen.queryByLabelText('스케줄 설정')).toBeNull();
  expect(screen.getByTestId('illustration-payroll')).toBeTruthy();
  expect(screen.getByTestId('illustration-staff')).toBeTruthy();
  expect(screen.getByTestId('illustration-review-pending')).toBeTruthy();
});
it('오늘 행을 눌러 주간 일정을 펼치고 재탭으로 접는다', async () => {
  await mount(); toggle(); expect(screen.getByTestId('mypage-weekly-schedule')).toBeTruthy();
  toggle(); expect(screen.queryByTestId('mypage-weekly-schedule')).toBeNull();
});
it('주간 요일은 원본 요일 번호로 수정 화면에 연결한다', async () => {
  await mount(); toggle(); fireEvent.press(screen.getByLabelText('수요일 10:00 – 19:00 수정'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/mypage/schedule', params: { day: '3' } });
  fireEvent.press(screen.getByLabelText('일요일 미설정 수정'));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/mypage/schedule', params: { day: '0' } });
});
it('오늘 휴무는 친절한 문구로 표시하고 미설정과 구분한다', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-11-09T00:00:00Z').getTime());
  await mount(); expect(screen.getByText('오늘은 쉬는 날이에요')).toBeTruthy();
});
it('미등록도 펼쳐 요일을 설정할 수 있고 휴무로 바꾸지 않는다', async () => {
  mockSchedule = []; await mount();
  expect(screen.getByText('등록된 스케줄이 없어요. 요일을 눌러 설정해주세요.')).toBeTruthy();
  expect(screen.queryByText('오늘은 쉬는 날이에요')).toBeNull();
  toggle(); fireEvent.press(screen.getByLabelText('수요일 미설정 수정'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/mypage/schedule', params: { day: '3' } });
});
it('첫 조회가 끝나기 전에는 미설정을 표시하지 않는다', async () => {
  let done!: () => void; mockRefetch.mockImplementation(() => new Promise<void>(resolve => { done = resolve; }));
  render(<MyPageScreen />); expect(screen.getByLabelText('스케줄 불러오는 중')).toBeTruthy();
  expect(screen.queryByLabelText(/^오늘 근무/)).toBeNull();
  await act(async () => done()); expect(screen.getByLabelText(/^오늘 근무/)).toBeTruthy();
});
it('조회 실패와 빈 일정을 분리하고 재시도로 복구한다', async () => {
  mockRefetch.mockRejectedValueOnce(new Error('failed'));
  render(<MyPageScreen />);
  await waitFor(() => expect(screen.getByText('스케줄을 불러오지 못했어요')).toBeTruthy());
  expect(screen.queryByLabelText(/^오늘 근무/)).toBeNull();
  await act(async () => fireEvent.press(screen.getByLabelText('스케줄 다시 불러오기')));
  expect(screen.getByLabelText(/^오늘 근무/)).toBeTruthy();
});
it('매장과 미리보기 직원 변경 시 열린 주간 목록을 초기화한다', async () => {
  const view = await mount(); toggle(); mockStore = 'new'; view.rerender(<MyPageScreen />);
  await waitFor(() => expect(screen.getByLabelText(/^오늘 근무/)).toBeTruthy());
  expect(screen.queryByTestId('mypage-weekly-schedule')).toBeNull();
  toggle(); mockMode = 'part_time'; mockPreviewEmployee = 'pt'; view.rerender(<MyPageScreen />);
  await waitFor(() => expect(screen.getByLabelText(/^오늘 근무/)).toBeTruthy());
  expect(screen.queryByTestId('mypage-weekly-schedule')).toBeNull();
});
it('파트타이머 메뉴와 관리자 요청함 접근 조건을 유지한다', async () => {
  mockUser = 'part'; mockRole = 'part_time'; mockRealRole = 'member'; await mount();
  expect(screen.getByTestId('illustration-work-time')).toBeTruthy();
  expect(screen.queryByLabelText('요청함 (스케줄)')).toBeNull();
  fireEvent.press(screen.getByLabelText('근무시간 제출')); expect(mockPush).toHaveBeenCalledWith('/mypage/work-minutes');
});
it('미리보기 중 개인정보 수정은 숨기고 기존 급여 경로는 유지한다', async () => {
  mockMode = 'regular'; mockPreviewEmployee = 'employee'; await mount();
  expect(screen.queryByLabelText('개인정보 수정')).toBeNull();
  fireEvent.press(screen.getByLabelText('급여 명세서')); expect(mockPush).toHaveBeenCalledWith('/mypage/payslip');
});
it('직원 미연결이면 근무 영역과 급여 메뉴를 노출하지 않는다', async () => {
  mockUser = 'unlinked'; render(<MyPageScreen />);
  expect(screen.queryByText('근무 일정')).toBeNull();
  expect(screen.queryByLabelText('급여 명세서')).toBeNull();
  expect(screen.getByLabelText('개인정보 수정')).toBeTruthy();
});
it('로그아웃은 기존 확인 후 실행 흐름을 유지한다', async () => {
  await mount(); fireEvent.press(screen.getByLabelText('로그아웃'));
  expect(mockSignOut).not.toHaveBeenCalled();
  const actions = (Alert.alert as jest.Mock).mock.calls[0][2];
  await act(async () => actions[1].onPress());
  expect(mockSignOut).toHaveBeenCalledTimes(1); expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
});

it('KST 자정이 지나면 오늘 요일을 갱신한다', async () => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-08T14:59:00Z'));
  await mount();
  expect(screen.getByLabelText(/^오늘 근무 일요일/)).toBeTruthy();
  act(() => jest.advanceTimersByTime(60_000));
  expect(screen.getByLabelText(/^오늘 근무 월요일 오늘은 쉬는 날이에요/)).toBeTruthy();
});

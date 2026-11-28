import { fireEvent, render, screen } from '@testing-library/react-native';
import { HomeWeekSchedule } from '../../../lib/components/home/schedule/HomeWeekSchedule';
import type { Employee } from '../../../types';

let mockQuery: any;
jest.mock('../../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: { id: 'QA-store' }, user: { id: 'QA-user' } }) }));
jest.mock('../../../lib/hooks/useHomeWeekSchedule', () => ({ useHomeWeekSchedule: () => mockQuery }));
jest.mock('../../../lib/components/home/schedule/weekSchedule', () => ({
  ...jest.requireActual('../../../lib/components/home/schedule/weekSchedule'),
  kstNow: () => ({ date: '2026-11-26', minutes: 14 * 60 + 20 }), // 목요일 14:20
}));

const employees = [
  { id: 'a', name: '김하늘', employment_type: 'part_time', is_active: true },
  { id: 'b', name: '박서준', employment_type: 'regular', is_active: true },
] as Employee[];
const row = (employee_id: string, dow: number, start: string, end: string) =>
  ({ id: `${employee_id}${dow}`, store_id: 'QA-store', employee_id, day_of_week: dow, is_working: true, start_time: start, end_time: end, updated_at: '' });
beforeEach(() => {
  mockQuery = { data: [row('b', 4, '10:00:00', '18:00:00'), row('a', 4, '15:00:00', '22:00:00'), row('a', 5, '09:00:00', '13:00:00')], isError: false, refetch: jest.fn() };
});

it('오늘을 고르고 직원/파트타이머 탭에 인원 수를 보인다', () => {
  render(<HomeWeekSchedule active refreshKey={0} employees={employees} />);
  expect(screen.getByLabelText('목요일, 오늘').props.accessibilityState.selected).toBe(true);
  expect(screen.getByRole('tab', { name: '직원 1명' })).toBeTruthy();
  expect(screen.getByLabelText('박서준, 직원, 10:00부터 18:00까지, 근무 중')).toBeTruthy();
  fireEvent.press(screen.getByRole('tab', { name: '파트타이머 1명' }));
  expect(screen.getByLabelText('김하늘, 파트타이머, 15:00부터 22:00까지')).toBeTruthy();
});
it('다른 날을 고르면 그날 근무로 바꾸고 없으면 없다고 보인다', () => {
  render(<HomeWeekSchedule active refreshKey={0} employees={employees} />);
  fireEvent.press(screen.getByLabelText('금요일'));
  expect(screen.getByText('이날은 직원 근무가 없어요')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('수요일'));
  expect(screen.getByText('이날은 직원 근무가 없어요')).toBeTruthy();
});
it('불러오는 중에는 탭·요일은 그대로 두고 근무 자리만 비워 둔다', () => {
  mockQuery = { data: undefined, isError: false, refetch: jest.fn() };
  render(<HomeWeekSchedule active refreshKey={0} employees={employees} />);
  expect(screen.getByLabelText('근무표를 불러오는 중이에요')).toBeTruthy();
  expect(screen.getByLabelText('목요일, 오늘')).toBeTruthy();
  expect(screen.queryByText(/근무가 없어요/)).toBeNull();
});
it('불러오기 실패는 근무 없음으로 보이지 않는다', () => {
  mockQuery = { data: undefined, isError: true, error: new Error('offline'), refetch: jest.fn() };
  render(<HomeWeekSchedule active refreshKey={0} employees={employees} />);
  expect(screen.queryByText(/근무가 없어요/)).toBeNull();
  fireEvent.press(screen.getByText('다시 시도'));
  expect(mockQuery.refetch).toHaveBeenCalled();
});

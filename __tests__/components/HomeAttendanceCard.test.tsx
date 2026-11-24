import { render } from '@testing-library/react-native';
import { HomeAttendanceCard } from '../../lib/components/HomeAttendanceCard';
import { resolveSelfEmployeeId } from '../../lib/utils/resolveSelfEmployee';

const mockAttendance = jest.fn();
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u', user_metadata: { full_name: '사장' } }, store: { id: 's', name: '매장' }, storeRole: 'owner' }) }));
jest.mock('../../lib/hooks/useAttendanceToday', () => ({
  attendanceTime: () => '',
  useAttendanceToday: (...args: unknown[]) => mockAttendance(...args),
}));
beforeEach(() => mockAttendance.mockReset().mockReturnValue({ loading: false, error: '', schedule: null, start: undefined, end: undefined, scheduleError: false, refetch: jest.fn() }));

it('직원 목록을 받기 전에도 권한 응답의 본인 직원 ID로 출퇴근 조회를 시작한다', () => {
  const screen = render(<HomeAttendanceCard employeeId="self" employee={undefined} active refreshKey={0} />);
  expect(mockAttendance).toHaveBeenCalledWith('self', true, 0);
  expect(screen.getByText('출근 예정')).toBeTruthy();
});
it('본인 직원 ID가 없으면 출퇴근 조회를 하지 않는다', () => {
  const screen = render(<HomeAttendanceCard employeeId={undefined} employee={undefined} active refreshKey={0} />);
  expect(mockAttendance).toHaveBeenCalledWith(undefined, true, 0);
  expect(screen.queryByText('출근 예정')).toBeNull();
});
describe('resolveSelfEmployeeId', () => {
  const list = [{ id: 'preview' }] as never[];
  it('관리자 미리보기 직원이 목록에 있으면 그 직원을 쓴다', () => expect(resolveSelfEmployeeId('self', 'preview', list)).toBe('preview'));
  it('미리보기 직원이 목록에 없으면(연결 안 된 미리보기) 조회하지 않는다', () => expect(resolveSelfEmployeeId('self', '__unlinked_preview__', list)).toBeUndefined());
  it('미리보기가 없으면 직원 목록 없이도 권한 응답의 본인 직원 ID를 쓴다', () => expect(resolveSelfEmployeeId('self', null, [])).toBe('self'));
  it('연결된 직원이 없으면 undefined', () => expect(resolveSelfEmployeeId(null, null, [])).toBeUndefined());
});

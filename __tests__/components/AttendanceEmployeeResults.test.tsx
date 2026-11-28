import { render } from '@testing-library/react-native';
import MyAttendanceQrScreen from '../../app/attendance/my-qr';
import { HomeAttendanceCard } from '../../lib/components/HomeAttendanceCard';
import type { Employee, AttendancePunchWithEmployee } from '../../types';
const mockRefetch = jest.fn().mockResolvedValue(undefined), mockWorkRead = jest.fn(), mockWorkRetry = jest.fn();
const employee = { id: 'employee', name: '가상 직원', employment_type: 'part_time' } as Employee;
const start = { id: 'in', kind: 'clock_in', punched_at: '2026-11-18T09:00:00+09:00' } as AttendancePunchWithEmployee;
const end = { id: 'out', kind: 'clock_out', punched_at: '2026-11-18T12:00:00+09:00' } as AttendancePunchWithEmployee;
const mockToday = { scope: 'scope', loading: false, error: '', schedule: null, start, end: undefined as AttendancePunchWithEmployee | undefined, refetch: mockRefetch };
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]) }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: { id: 'store', name: '가상 매장' }, user: { id: 'person' }, storeRole: 'part_timer', devPreviewMode: 'self' }) }));
jest.mock('../../lib/hooks/useEmployees', () => ({ useEmployees: () => ({ employees: [], refetch: mockRefetch }) }));
jest.mock('../../lib/utils/resolveSelfEmployee', () => ({ resolveSelfEmployee: () => ({ id: 'employee', employment_type: 'part_time' }) }));
jest.mock('../../lib/hooks/useAttendanceToday', () => ({ useAttendanceToday: () => mockToday, attendanceTime: (time?: string) => time?.slice(11, 16) ?? '' }));
jest.mock('../../lib/hooks/useAttendanceQr', () => ({ useAttendanceQr: () => ({ state: 'ready', qr: 'fake', expiresAt: Date.now() + 45000 }) }));
jest.mock('../../lib/services/attendanceWorkRecord', () => ({ getAttendanceWorkRecord: (...args: unknown[]) => mockWorkRead(...args), retryAttendanceWorkRecord: (...args: unknown[]) => mockWorkRetry(...args) }));
jest.mock('../../lib/components/AttendanceQrCode', () => ({ AttendanceQrCode: () => null }));
jest.mock('../../lib/components/GlassBackdrop', () => ({ GlassBackdrop: () => null }));
jest.mock('../../lib/components/ui', () => ({ AppBar: () => null }));
jest.mock('../../lib/icons/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
beforeEach(() => { mockToday.end = undefined; jest.clearAllMocks(); });
function expectNoProcessingUi(view: ReturnType<typeof render>) {
  expect(view.queryByText(/인건비 ·|인건비에 기록|관리자 확인|급여 반영|정산 확정|다시 시도해주세요/)).toBeNull();
  expect(mockWorkRead).not.toHaveBeenCalled(); expect(mockWorkRetry).not.toHaveBeenCalled();
}
it('S43은 퇴근 결과를 오늘 기록에만 반영하고 자동기록 조회·모달을 열지 않는다', () => {
  const view = render(<MyAttendanceQrScreen />); expectNoProcessingUi(view);
  mockToday.end = end; view.rerender(<MyAttendanceQrScreen />);
  expect(view.getByText('오늘 내 기록')).toBeTruthy(); expect(view.getByText(/(오후|PM) 12:00/)).toBeTruthy();
  expectNoProcessingUi(view);
});
it('홈은 근무 중이면 퇴근하기를, 퇴근 후에는 최신 근무 시간대만 표시한다(S04 2026-11-27)', () => {
  const view = render(<HomeAttendanceCard employeeId={employee.id} employee={employee} active refreshKey={0} />);
  expect(view.getByText('출근 09:00 · 근무 중')).toBeTruthy(); expect(view.getByText('퇴근하기')).toBeTruthy();
  mockToday.end = end; view.rerender(<HomeAttendanceCard employeeId={employee.id} employee={employee} active refreshKey={1} />);
  expect(view.getByText('오늘 근무 끝')).toBeTruthy(); expect(view.getByText('09:00 ~ 12:00')).toBeTruthy();
  expect(view.queryByText('퇴근하기')).toBeNull(); expectNoProcessingUi(view);
});
it('직원 행이 없으면 이름·역할은 유지하고 출퇴근 시각과 행동을 숨긴다', () => {
  const view = render(<HomeAttendanceCard employee={null} active refreshKey={0} />);
  expect(view.getByLabelText('내 정보 보기')).toBeTruthy();
  expect(view.queryByText('오늘 근무')).toBeNull(); expect(view.queryByText('출근하기')).toBeNull();
  expect(view.queryByHintText('내 출퇴근 QR을 열어요')).toBeNull();
});

import { fireEvent, render } from '@testing-library/react-native';
import { AttendanceWorkIssuesNotice, attendanceWorkFailureReason } from '../../lib/components/AttendanceWorkIssuesNotice';
it('관리자 확인 필요에는 직원·날짜·할 일을 표시하고 직원 정보로 연결한다', () => {
  const onEmployee = jest.fn();
  const view = render(<AttendanceWorkIssuesNotice rows={[{ id: 'issue', employeeId: 'e', employeeName: '가상 직원', workDate: '2026-11-18', reason: attendanceWorkFailureReason('DAILY_WORK_RATE_REQUIRED') }]} loading={false} error="" onReload={jest.fn()} onEmployee={onEmployee} />);
  expect(view.getByText('확인 필요')).toBeTruthy(); expect(view.getByText('가상 직원님 · 11월 18일')).toBeTruthy();
  expect(view.getByText('시급을 등록해주세요')).toBeTruthy(); fireEvent.press(view.getByLabelText('가상 직원님 직원 정보 보기')); expect(onEmployee).toHaveBeenCalledWith('e');
  expect(attendanceWorkFailureReason('internal SQL error')).not.toContain('internal');
});
it('실패 목록 0건과 조회 실패를 구분한다', () => {
  const props = { rows: [], loading: false, error: '', onReload: jest.fn(), onEmployee: jest.fn() };
  const view = render(<AttendanceWorkIssuesNotice {...props} />); expect(view.queryByText('확인 필요')).toBeNull();
  view.rerender(<AttendanceWorkIssuesNotice {...props} error="확인이 필요한 근무를 불러오지 못했어요. 다시 확인해주세요" />);
  expect(view.getByText('확인 필요')).toBeTruthy(); expect(view.getByText(/불러오지 못했어요/)).toBeTruthy();
});
it('조회 상한과 시급 수정 뒤 명시적 새로고침을 안내한다', () => {
  const reload = jest.fn();
  const view = render(<AttendanceWorkIssuesNotice rows={[{ id: 'e:day', employeeId: 'e', employeeName: '파트', workDate: '2026-11-18', reason: '시급을 등록해주세요' }]} loading={false} error="" onReload={reload} onEmployee={jest.fn()} limitReached />);
  expect(view.getByText(/최대 1,000건/)).toBeTruthy(); expect(view.getByText(/표시되지 않은 근무가 있을 수 있어요/)).toBeTruthy();
  expect(view.getByText('시급을 수정했다면 새로고침해주세요')).toBeTruthy(); fireEvent.press(view.getByText('새로고침')); expect(reload).toHaveBeenCalledTimes(1);
  expect(view.queryByText('인건비 다시 반영하기')).toBeNull(); expect(view.getByText('다시 반영하려면 퇴근 원본을 확인해주세요')).toBeTruthy();
});
it('원본이 있을 때만 관리자 재시도 행동을 연결한다', () => {
  const retry = jest.fn();
  const props = { rows: [{ id: 'e:day', employeeId: 'e', employeeName: '파트', workDate: '2026-11-18', reason: '조건을 확인해주세요', retryPunchId: 'out' }], loading: false, error: '', onReload: jest.fn(), onEmployee: jest.fn(), onRetry: retry };
  const view = render(<AttendanceWorkIssuesNotice {...props} />); fireEvent.press(view.getByText('인건비 다시 반영하기')); expect(retry).toHaveBeenCalledWith('e:day');
  view.rerender(<AttendanceWorkIssuesNotice {...props} rows={[{ ...props.rows[0], retryUnknown: true }]} />);
  expect(view.queryByText('인건비 다시 반영하기')).toBeNull(); expect(view.getByText('반영 상태 확인하기')).toBeTruthy();
});

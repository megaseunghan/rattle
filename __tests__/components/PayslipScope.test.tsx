import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import PayslipScreen from '../../app/mypage/payslip';
const mockRead = jest.fn();
const mockRefetch = jest.fn();
let mockAuth: any;
let mockEmployees: any;
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../../lib/hooks/useEmployees', () => ({ useEmployees: () => mockEmployees }));
jest.mock('../../lib/services/payroll', () => ({ getMyPayroll: (...args: unknown[]) => mockRead(...args) }));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('../../lib/icons/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('../../lib/components/ui', () => {
  const { Text } = require('react-native');
  return { AppBar: ({ title }: any) => <Text>{title}</Text> };
});
jest.mock('../../lib/components/ErrorMessage', () => {
  const { Text, Pressable } = require('react-native');
  return { ErrorMessage: ({ message, onRetry }: any) => <Pressable onPress={onRetry}><Text>{message}</Text></Pressable> };
});
function deferred() {
  let resolve!: (value: any) => void;
  let reject!: (reason: any) => void;
  const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const payroll = (net: number) => ({ net_pay: net, gross: net, taxable_base: net,
  national_pension: 0, health_insurance: 0, long_term_care: 0, employment_insurance: 0,
  income_tax: 0, local_income_tax: 0, withholding_tax: 0, worked_minutes: null });
beforeEach(() => {
  jest.clearAllMocks(); mockRead.mockReset();
  mockAuth = { user: { id: 'user-a' }, store: { id: 'store-a' }, realRole: 'staff', devPreviewMode: 'self', devPreviewEmployeeId: null };
  mockEmployees = { employees: [{ id: 'employee-a', user_id: 'user-a', store_id: 'store-a' }], loading: false, error: null, refetch: mockRefetch };
});
it('늦은 이전 달 성공 응답이 현재 월 명세를 덮어쓰지 않는다', async () => {
  const old = deferred(); mockRead.mockReturnValueOnce(old.promise).mockResolvedValueOnce(payroll(222));
  render(<PayslipScreen />); fireEvent.press(screen.getByLabelText('이전 달'));
  await waitFor(() => expect(screen.getAllByText('222원').length).toBeGreaterThan(0));
  await act(async () => old.resolve(payroll(111)));
  expect(screen.queryByText('111원')).toBeNull();
});
it('이전 달의 늦은 오류는 현재 월 성공을 가리지 않는다', async () => {
  const old = deferred(); mockRead.mockReturnValueOnce(old.promise).mockResolvedValueOnce(payroll(222));
  render(<PayslipScreen />); fireEvent.press(screen.getByLabelText('이전 달'));
  await waitFor(() => expect(screen.getAllByText('222원').length).toBeGreaterThan(0));
  await act(async () => old.reject(new Error('old failure')));
  expect(screen.getAllByText('222원').length).toBeGreaterThan(0);
});
it('새 월 조회 중 이전 월 금액을 즉시 숨긴다', async () => {
  mockRead.mockResolvedValueOnce(payroll(111)).mockReturnValueOnce(deferred().promise);
  render(<PayslipScreen />); await waitFor(() => expect(screen.getAllByText('111원').length).toBeGreaterThan(0));
  fireEvent.press(screen.getByLabelText('이전 달')); expect(screen.queryByText('111원')).toBeNull();
  expect(screen.queryByText('이 달은 아직 급여명세가 작성되지 않았어요')).toBeNull();
});
it('계정과 직원 변경 뒤 이전 계정 응답을 숨긴다', async () => {
  const old = deferred(); mockRead.mockReturnValueOnce(old.promise).mockResolvedValueOnce(payroll(333));
  const view = render(<PayslipScreen />);
  mockAuth = { ...mockAuth, user: { id: 'user-b' } };
  mockEmployees = { ...mockEmployees, employees: [{ id: 'employee-b', user_id: 'user-b', store_id: 'store-a' }] };
  view.rerender(<PayslipScreen />);
  await waitFor(() => expect(screen.getAllByText('333원').length).toBeGreaterThan(0));
  await act(async () => old.resolve(payroll(111))); expect(screen.queryByText('111원')).toBeNull();
});
it('매장이 바뀌면 이전 매장 직원으로 요청하지 않는다', async () => {
  const old = deferred(); mockRead.mockReturnValue(old.promise); const view = render(<PayslipScreen />);
  mockAuth = { ...mockAuth, store: { id: 'store-b' } }; view.rerender(<PayslipScreen />);
  await act(async () => old.resolve(payroll(111)));
  expect(mockRead).toHaveBeenCalledTimes(1); expect(screen.queryByText('111원')).toBeNull();
  expect(screen.getByText('연결된 직원 정보를 확인해주세요.')).toBeTruthy();
});
it('로그아웃 뒤 명세를 숨기고 조회를 중단한다', async () => {
  const old = deferred(); mockRead.mockReturnValue(old.promise); const view = render(<PayslipScreen />);
  mockAuth = { ...mockAuth, user: null }; view.rerender(<PayslipScreen />);
  await act(async () => old.resolve(payroll(111)));
  expect(screen.queryByText('111원')).toBeNull(); expect(mockRead).toHaveBeenCalledTimes(1);
  expect(screen.getByText('연결된 직원 정보를 확인해주세요.')).toBeTruthy();
});
it('현재 월 조회 실패는 빈 명세와 구분하며 재시도할 수 있다', async () => {
  mockRead.mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce(null);
  render(<PayslipScreen />); await waitFor(() => expect(screen.getByText('처리하지 못했어요. 다시 시도해주세요.')).toBeTruthy());
  fireEvent.press(screen.getByText('처리하지 못했어요. 다시 시도해주세요.'));
  await waitFor(() => expect(screen.getByText('이 달은 아직 급여명세가 작성되지 않았어요')).toBeTruthy());
  expect(mockRead).toHaveBeenCalledTimes(2);
});
it('미리보기 직원을 바꾸면 새 직원 명세만 표시한다', async () => {
  const old = deferred(); mockRead.mockReturnValueOnce(old.promise).mockResolvedValueOnce(payroll(444));
  mockAuth = { ...mockAuth, realRole: 'admin', devPreviewMode: 'staff', devPreviewEmployeeId: 'employee-a' };
  mockEmployees.employees.push({ id: 'employee-b', user_id: 'user-b', store_id: 'store-a' });
  const view = render(<PayslipScreen />);
  mockAuth = { ...mockAuth, devPreviewEmployeeId: 'employee-b' }; view.rerender(<PayslipScreen />);
  await waitFor(() => expect(screen.getAllByText('444원').length).toBeGreaterThan(0));
  await act(async () => old.resolve(payroll(111))); expect(screen.queryByText('111원')).toBeNull();
  expect(mockRead.mock.calls.at(-1)[0]).toBe('employee-b');
});
it('같은 월로 돌아와도 처음 요청의 늦은 응답을 버린다', async () => {
  const first = deferred(); const second = deferred();
  mockRead.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockResolvedValueOnce(payroll(555));
  render(<PayslipScreen />); fireEvent.press(screen.getByLabelText('이전 달')); fireEvent.press(screen.getByLabelText('다음 달'));
  await waitFor(() => expect(screen.getAllByText('555원').length).toBeGreaterThan(0));
  await act(async () => { first.resolve(payroll(111)); second.resolve(payroll(222)); });
  expect(screen.queryByText('111원')).toBeNull(); expect(screen.queryByText('222원')).toBeNull();
});
it('연도 경계에서도 한 번에 올바른 월만 조회하고 미래 월 이동을 막는다', async () => {
  const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 0, 10).getTime());
  // 실제 시스템 시각을 고정해 new Date()를 사용하는 화면을 검증한다.
  jest.useFakeTimers({ now: new Date(2026, 0, 10), doNotFake: ['nextTick', 'setImmediate'] });
  try {
    mockRead.mockResolvedValue(null); render(<PayslipScreen />);
    fireEvent.press(screen.getByLabelText('이전 달'));
    expect(mockRead.mock.calls.map(call => call[1])).toEqual(['2026-01', '2025-12']);
    fireEvent.press(screen.getByLabelText('다음 달')); fireEvent.press(screen.getByLabelText('다음 달'));
    expect(mockRead.mock.calls.map(call => call[1])).toEqual(['2026-01', '2025-12', '2026-01']);
    await act(async () => {});
  } finally { jest.useRealTimers(); dateSpy.mockRestore(); }
});
it('현재 고용형태·기본급·비과세 조건이 바뀌어도 과거 명세 지급·공제는 그대로 표시한다', async () => {
  mockRead.mockResolvedValue({ ...payroll(2767890), gross: 3000000, taxable_base: 2800000,
    national_pension: 126000, health_insurance: 99260, withholding_tax: 6850, worked_minutes: null });
  mockEmployees.employees[0] = { ...mockEmployees.employees[0], employment_type: 'regular', base_salary: 3000000, non_taxable: 200000 };
  const view = render(<PayslipScreen />);
  await waitFor(() => expect(screen.getAllByText('2,767,890원').length).toBeGreaterThan(0));
  mockEmployees = { ...mockEmployees, employees: [{ ...mockEmployees.employees[0], employment_type: 'part_time', base_salary: 9999999, non_taxable: 500000, hourly_wage: 50000 }] };
  view.rerender(<PayslipScreen />);
  expect(screen.getAllByText('2,767,890원').length).toBeGreaterThan(0);
  expect(screen.getByText('3,000,000원')).toBeTruthy(); expect(screen.getByText('2,800,000원')).toBeTruthy();
  expect(screen.getByText('−126,000원')).toBeTruthy(); expect(screen.getByText('−99,260원')).toBeTruthy();
  expect(screen.getByText('−6,850원')).toBeTruthy();
  expect(screen.queryByText('500,000원')).toBeNull(); expect(screen.queryByText('9,999,999원')).toBeNull();
  expect(screen.queryByText(/급여 작성 근무:/)).toBeNull(); expect(mockRead).toHaveBeenCalledTimes(1);
});
it('파트타이머 명세는 정규직 전환 후에도 저장된 원천징수·0분을 보존하고 세율을 추정하지 않는다', async () => {
  mockRead.mockResolvedValue({ ...payroll(967000), gross: 1000000, taxable_base: 0, withholding_tax: 33000, worked_minutes: 0 });
  mockEmployees.employees[0].employment_type = 'part_time'; const view = render(<PayslipScreen />);
  await waitFor(() => expect(screen.getAllByText('967,000원').length).toBeGreaterThan(0));
  mockEmployees = { ...mockEmployees, employees: [{ ...mockEmployees.employees[0], employment_type: 'regular', non_taxable: 200000, base_salary: 3500000 }] };
  view.rerender(<PayslipScreen />);
  expect(screen.getAllByText('−33,000원')).toHaveLength(2); expect(screen.getByText('급여 작성 근무: 0분 (0시간 0분)')).toBeTruthy();
  expect(screen.queryByText(/3\.3%/)).toBeNull(); expect(screen.queryByText('200,000원')).toBeNull();
  expect(screen.queryByText('비과세 수당')).toBeNull(); expect(screen.queryByText('기본급')).toBeNull();
});
it('과세 기준액이 누락된 과거 명세는 0원이나 현재 조건으로 추정하지 않는다', async () => {
  mockRead.mockResolvedValue({ ...payroll(967000), gross: 1000000, taxable_base: null });
  render(<PayslipScreen />); await waitFor(() => expect(screen.getByText('확인 필요')).toBeTruthy());
  expect(screen.getAllByText('967,000원').length).toBeGreaterThan(0);
  expect(screen.getByText('저장된 명세 금액이에요. 당시 기본급·비과세 세부 조건은 관리자에게 확인해주세요.')).toBeTruthy();
});
it('저장된 과세 기준액 0원은 누락으로 취급하지 않고 공제 0원에 음수 기호를 붙이지 않는다', async () => {
  mockRead.mockResolvedValue({ ...payroll(0), taxable_base: 0 }); render(<PayslipScreen />);
  await waitFor(() => expect(screen.getByText('명세에 저장된 과세 기준액')).toBeTruthy());
  expect(screen.queryByText('확인 필요')).toBeNull(); expect(screen.queryByText('−0원')).toBeNull();
  expect(screen.getAllByText('0원').length).toBeGreaterThan(0);
});

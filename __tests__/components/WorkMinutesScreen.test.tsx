jest.mock('../../lib/components/DailyWorkPanel', () => ({ DailyWorkPanel: () => null }));
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { LegacyWorkMinutesScreen as WorkMinutesScreen } from '../../app/mypage/work-minutes';
const mockRefetchEmployees = jest.fn().mockResolvedValue(undefined);
const mockRefetchSubmissions = jest.fn().mockResolvedValue(undefined);
const mockSubmit = jest.fn().mockResolvedValue({ id: 'submitted' });
let mockPreview = false;
let mockRows: { id: string; worked_minutes: number; note: string; status: string }[] = [];
let mockLoading = false;
let mockError: string | null = null;
const employee = { id: 'employee', user_id: 'user', name: '파트', employment_type: 'part_time' };
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user' }, devPreviewEmployeeId: null,
  devPreviewMode: mockPreview ? 'part_time' : 'self', realRole: mockPreview ? 'admin' : 'member' }) }));
jest.mock('../../lib/hooks/useEmployees', () => ({ useEmployees: () => ({ employees: [employee], loading: false, error: null, refetch: mockRefetchEmployees }) }));
jest.mock('../../lib/hooks/usePayrollSubmissions', () => ({ usePayrollSubmissions: () => ({ rows: mockRows, loading: mockLoading, error: mockError, refetch: mockRefetchSubmissions }) }));
jest.mock('../../lib/services/payrollSubmissions', () => ({ submitWorkMinutes: (...args: unknown[]) => mockSubmit(...args) }));
jest.mock('../../lib/hooks/useConfirmLeave', () => ({ useConfirmLeave: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); mockPreview = false; mockRows = []; mockLoading = false; mockError = null; mockSubmit.mockResolvedValue({ id: 'submitted' }); mockRefetchSubmissions.mockResolvedValue(undefined); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());
it('화면 진입 시 직원과 제출 이력을 실제로 불러온다', async () => {
  render(<WorkMinutesScreen />);
  await waitFor(() => expect(mockRefetchEmployees).toHaveBeenCalled());
  expect(mockRefetchSubmissions).toHaveBeenCalled();
  expect(screen.getByText('파트님의 월별 근무시간')).toBeTruthy();
});
it('직원은 근무 분과 근거만 제출하고 시급 입력은 하지 않는다', async () => {
  render(<WorkMinutesScreen />);
  fireEvent.changeText(screen.getByLabelText('총 실근무 시간 (분)'), '61');
  fireEvent.changeText(screen.getByPlaceholderText('예: 10월 근무 합계, 휴게시간 제외'), '근무 합계');
  fireEvent.press(screen.getByText('관리자에게 제출'));
  await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith('employee', expect.stringMatching(/^\d{4}-\d{2}$/), '61', '근무 합계', undefined));
  expect(screen.queryByLabelText('적용 시급 (원)')).toBeNull();
});
it('관리자 미리보기에서 직원 명의 제출을 막는다', async () => {
  mockPreview = true;
  render(<WorkMinutesScreen />);
  fireEvent.press(screen.getByText('관리자에게 제출'));
  expect(mockSubmit).not.toHaveBeenCalled();
});

it('분과 필수 근거 오류를 입력 위치에 표시하고 실제 0분은 허용한다', async () => {
  render(<WorkMinutesScreen />);
  fireEvent.changeText(screen.getByLabelText('총 실근무 시간 (분)'), '1.5');
  fireEvent.press(screen.getByText('관리자에게 제출'));
  expect(screen.getByText('총 근무시간을 0 이상의 정수 분으로 입력해주세요.')).toBeTruthy();
  expect(screen.getByText('입력 근거나 수정 사유를 적어 주세요.')).toBeTruthy();
  expect(mockSubmit).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('총 실근무 시간 (분)'), '0');
  fireEvent.changeText(screen.getByLabelText('입력 근거 / 수정 사유'), '해당 월 미근무');
  expect(screen.getByText('입력한 시간: 0분 (0시간 0분)')).toBeTruthy();
  fireEvent.press(screen.getByText('관리자에게 제출'));
  await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
  expect(mockSubmit).toHaveBeenCalledWith('employee', expect.any(String), '0', '해당 월 미근무', undefined);
});

it('제출 내역을 다시 읽거나 조회 실패 후 복구해도 작성 중인 값을 덮어쓰지 않는다', () => {
  const original = { id: 'old', worked_minutes: 60, note: '원래 근거', status: 'pending' };
  mockRows = [original];
  const { rerender } = render(<WorkMinutesScreen />);
  fireEvent.changeText(screen.getByLabelText('총 실근무 시간 (분)'), '120');
  fireEvent.changeText(screen.getByLabelText('입력 근거 / 수정 사유'), '수정 중');
  mockLoading = true; mockRows = []; rerender(<WorkMinutesScreen />);
  mockLoading = false; mockError = '조회 실패'; rerender(<WorkMinutesScreen />);
  expect(screen.getByLabelText('총 실근무 시간 (분)')).toHaveDisplayValue('120');
  mockError = null; mockRows = [original]; rerender(<WorkMinutesScreen />);
  expect(screen.getByLabelText('입력 근거 / 수정 사유')).toHaveDisplayValue('수정 중');
});

it('제출 실패 후 입력을 보존하고 다시 시도할 수 있다', async () => {
  mockSubmit.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ id: 'submitted' });
  render(<WorkMinutesScreen />);
  fireEvent.changeText(screen.getByLabelText('총 실근무 시간 (분)'), '61');
  fireEvent.changeText(screen.getByLabelText('입력 근거 / 수정 사유'), '근무 합계');
  fireEvent.press(screen.getByText('관리자에게 제출'));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('제출 실패', expect.any(String)));
  expect(screen.getByLabelText('총 실근무 시간 (분)')).toHaveDisplayValue('61');
  fireEvent.press(screen.getByText('관리자에게 제출'));
  await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(2));
});

it('제출 중 중복 탭을 막고 제출 후 조회 실패는 재제출로 안내하지 않는다', async () => {
  let resolve!: (value: unknown) => void;
  mockSubmit.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  render(<WorkMinutesScreen />);
  mockRefetchSubmissions.mockResolvedValueOnce(false);
  fireEvent.changeText(screen.getByLabelText('총 실근무 시간 (분)'), '61');
  fireEvent.changeText(screen.getByLabelText('입력 근거 / 수정 사유'), '근무 합계');
  const button = screen.getByRole('button', { name: '관리자에게 제출' });
  fireEvent.press(button); fireEvent.press(button);
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  await act(async () => { resolve({ id: 'submitted' }); });
  expect(Alert.alert).toHaveBeenCalledWith('제출 완료', '제출은 완료됐어요. 제출 이력을 다시 불러와 주세요.');
  expect(screen.getByRole('button', { name: '제출 완료 · 관리자 확인 대기' })).toBeDisabled();
  expect(screen.getByLabelText('입력 근거 / 수정 사유')).toHaveDisplayValue('근무 합계');
});

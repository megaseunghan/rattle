import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import WorkMinutesScreen from '../../app/mypage/work-minutes';
const mockRefetchEmployees = jest.fn().mockResolvedValue(undefined);
const mockRefetchSubmissions = jest.fn().mockResolvedValue(undefined);
const mockSubmit = jest.fn().mockResolvedValue({ id: 'submitted' });
let mockPreview = false;
const employee = { id: 'employee', user_id: 'user', name: '파트', employment_type: 'part_time' };
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user' }, devPreviewEmployeeId: null,
  devPreviewMode: mockPreview ? 'part_time' : 'self', realRole: mockPreview ? 'admin' : 'member' }) }));
jest.mock('../../lib/hooks/useEmployees', () => ({ useEmployees: () => ({ employees: [employee], loading: false, error: null, refetch: mockRefetchEmployees }) }));
jest.mock('../../lib/hooks/usePayrollSubmissions', () => ({ usePayrollSubmissions: () => ({ rows: [], loading: false, error: null, refetch: mockRefetchSubmissions }) }));
jest.mock('../../lib/services/payrollSubmissions', () => ({ submitWorkMinutes: (...args: unknown[]) => mockSubmit(...args) }));
jest.mock('../../lib/hooks/useConfirmLeave', () => ({ useConfirmLeave: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); mockPreview = false; jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
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

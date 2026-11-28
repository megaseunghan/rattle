import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
import { EmployeeInfoModal } from '../../../lib/components/employee/EmployeeInfoModal';
import type { Employee } from '../../../types';

const regular = {
  id: 'e1', store_id: 's1', user_id: 'u1', name: '가상 직원', employment_type: 'regular', base_salary: 3000000, hourly_wage: null,
  non_taxable: 200000, joined_at: '2026-10-01', phone: '01012345678', bank_name: '국민은행', account_number: 'enc:v1:3456:x', account_last4: '3456',
  is_probation: false, probation_rate: null, probation_started_at: null, probation_ends_on: null, is_resigned_during_probation: false,
  weekly_hours: null, weekly_minutes: null, weekly_rest_included: null, income_type: 'employee', dependents: 2, is_active: true, created_at: '2026-10-01T00:00:00Z',
} as Employee;
const part = { ...regular, employment_type: 'part_time', base_salary: 0, hourly_wage: 12000, non_taxable: 0, weekly_minutes: 1200, weekly_rest_included: false } as Employee;
const row = (name: RegExp) => screen.getByRole('button', { name });
function setup(employee: Employee, overrides: Partial<React.ComponentProps<typeof EmployeeInfoModal>> = {}) {
  const props = {
    employee, onClose: jest.fn(), onSave: jest.fn(async () => undefined), onChangeWage: jest.fn(async () => undefined),
    onReveal: jest.fn(async () => '123456123456'), store: { default_probation_months: 3 as const, default_probation_rate: 0.9, payroll_close_day: 0 },
    ...overrides,
  };
  render(<EmployeeInfoModal {...props} />);
  return props;
}
beforeEach(() => jest.spyOn(Alert, 'alert').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

it('근무 형태는 바꿀 수 없고 시트에서 확인한 항목만 바로 저장한다', async () => {
  const props = setup(regular);
  expect(screen.getByLabelText(/^근무 형태/).props.accessibilityRole).toBeUndefined();
  fireEvent.press(row(/^이름/));
  fireEvent.changeText(screen.getByLabelText('이름'), '새 이름');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '확인' })); });
  expect(props.onSave).toHaveBeenCalledWith({ name: '새 이름' });
  expect(screen.getByText('저장했어요')).toBeTruthy();
  expect(row(/^이름/).props.accessibilityLabel).toContain('새 이름');
});
it('소득 구분은 근로자와 프리랜서만 고를 수 있다', async () => {
  const props = setup(regular);
  fireEvent.press(row(/^소득 구분/));
  expect(screen.queryByRole('radio', { name: '잘 모르겠어요' })).toBeNull();
  await act(async () => { fireEvent.press(screen.getByRole('radio', { name: '프리랜서' })); });
  expect(props.onSave).toHaveBeenCalledWith({ income_type: 'freelancer' });
  // 프리랜서는 부양가족을 쓰지 않는다.
  expect(screen.queryByRole('button', { name: /^부양가족/ })).toBeNull();
});
it('부양가족은 −/+ 버튼으로 바꾼다', async () => {
  const props = setup(regular);
  fireEvent.press(row(/^부양가족/));
  fireEvent.press(screen.getByRole('button', { name: '한 명 늘리기' }));
  fireEvent.press(screen.getByRole('button', { name: '한 명 늘리기' }));
  fireEvent.press(screen.getByRole('button', { name: '한 명 줄이기' }));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '확인' })); });
  expect(props.onSave).toHaveBeenCalledWith({ dependents: 3 });
});
it('시급 바꾸기는 오늘부터 또는 다음 급여 기간부터 적용일을 정해 보낸다', async () => {
  const props = setup(part, { store: { default_probation_months: null, default_probation_rate: null, payroll_close_day: null } });
  fireEvent.press(row(/^시급/));
  fireEvent.changeText(screen.getByLabelText('새 시급'), '13000');
  fireEvent.press(screen.getByRole('radio', { name: '다음 급여 기간부터' }));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '바꾸기' })); });
  const [{ amount, effectiveDate }] = (props.onChangeWage as jest.Mock).mock.calls[0];
  expect(amount).toBe(13000);
  expect(effectiveDate).toMatch(/^\d{4}-\d{2}-01$/); // 마감일이 없으면 다음 달 1일
  expect(props.onSave).not.toHaveBeenCalled();
});
it('지금과 같은 시급은 바꾸지 않는다', () => {
  setup(part);
  fireEvent.press(row(/^시급/));
  expect(screen.getByRole('button', { name: '바꾸기' }).props.accessibilityState.disabled).toBe(true);
});
it('급여 변경 결과를 모르면 시트를 닫고 다시 보내지 않게 안내한다', async () => {
  const unknown = Object.assign(new Error('저장됐는지 확인하지 못했어요. 급여 이력을 먼저 확인해 주세요.'), { name: 'WageChangeOutcomeUnknownError' });
  setup(part, { onChangeWage: jest.fn(async () => { throw unknown; }) });
  fireEvent.press(row(/^시급/));
  fireEvent.changeText(screen.getByLabelText('새 시급'), '13000');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '바꾸기' })); });
  expect(Alert.alert).toHaveBeenCalledWith('급여를 바꾸지 못했어요', expect.any(String));
  expect(screen.queryByLabelText('새 시급')).toBeNull();
});
it('주 근무시간은 분과 정수 시간을 함께 저장한다', async () => {
  const props = setup(part);
  fireEvent.press(row(/^주 근무시간/));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '확인' })); });
  expect(props.onSave).toHaveBeenCalledWith({ weekly_minutes: 1200, weekly_hours: 20 });
});
it('계좌는 끝 4자리로 보이고 계좌 보기로 전체 번호를 연다', async () => {
  const props = setup(regular);
  expect(row(/^급여 계좌/).props.accessibilityLabel).toContain('국민 ····3456');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '계좌 보기' })); });
  expect(props.onReveal).toHaveBeenCalled();
  await waitFor(() => expect(row(/^급여 계좌/).props.accessibilityLabel).toContain('123456123456'));
  fireEvent.press(screen.getByRole('button', { name: '계좌 숨기기' }));
  expect(row(/^급여 계좌/).props.accessibilityLabel).not.toContain('123456123456');
});
it('은행만 바꾸면 지금 계좌번호를 그대로 둔다', async () => {
  const props = setup(regular);
  fireEvent.press(row(/^급여 계좌/));
  fireEvent.press(screen.getByRole('radio', { name: '토스뱅크' }));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '확인' })); });
  expect(props.onSave).toHaveBeenCalledWith({ bank_name: '토스뱅크' });
});
it('수습 시트를 다시 써서 기간과 비율을 저장한다', async () => {
  const props = setup(regular);
  fireEvent.press(row(/^수습 적용/));
  fireEvent.press(screen.getByRole('radio', { name: '적용해요' }));
  fireEvent.press(screen.getByRole('button', { name: /^2개월/ }));
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '확인' })); });
  expect(props.onSave).toHaveBeenCalledWith({ is_probation: true, probation_started_at: '2026-10-01', probation_ends_on: '2026-11-30', probation_rate: 0.9 });
});
it('저장에 실패하면 시트를 그대로 두고 안내한다', async () => {
  setup(regular, { onSave: jest.fn(async () => { throw new Error('network'); }) });
  fireEvent.press(row(/^이름/));
  fireEvent.changeText(screen.getByLabelText('이름'), '새 이름');
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: '확인' })); });
  expect(Alert.alert).toHaveBeenCalledWith('저장하지 못했어요', expect.any(String));
  expect(screen.getByLabelText('이름')).toBeTruthy();
  expect(screen.queryByText('저장했어요')).toBeNull();
});
it('삭제 권한이 없으면 직원 삭제를 보이지 않는다', () => {
  setup(regular);
  expect(screen.queryByRole('button', { name: '직원 삭제' })).toBeNull();
});

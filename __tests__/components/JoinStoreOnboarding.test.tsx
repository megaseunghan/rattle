import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import JoinStoreScreen from '../../app/(auth)/join-store';
const mockSubmit = jest.fn();
let mockMode = 'self';
const mockGetInvite = jest.fn();
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'applicant' }, devPreviewMode: mockMode }) }));
jest.mock('../../lib/hooks/useConfirmLeave', () => ({ useConfirmLeave: () => jest.fn() }));
jest.mock('../../lib/services/storeMembers', () => ({ submitJoinOnboarding: (...args: unknown[]) => mockSubmit(...args), getStoreInviteCode: (...args: unknown[]) => mockGetInvite(...args) }));
beforeEach(() => { mockMode = 'self'; mockSubmit.mockReset().mockResolvedValue({ store_name: '매장', store_id: 'store' }); mockGetInvite.mockReset().mockResolvedValue({ store_name: '매장', store_id: 'store' }); });
async function renderJoin() { render(<JoinStoreScreen />); fireEvent.changeText(screen.getByLabelText('참여코드'), '1111-1111-1111-1111'); fireEvent.press(screen.getByText('매장 확인')); await waitFor(() => expect(screen.getByLabelText('이름')).toBeTruthy()); }

it('취소되거나 만료된 초대는 온보딩을 열지 않는다', async () => {
  mockGetInvite.mockRejectedValueOnce(new Error('STORE_INVITE_INVALID'));
  render(<JoinStoreScreen />);
  fireEvent.changeText(screen.getByLabelText('참여코드'), '1111-1111-1111-1111');
  fireEvent.press(screen.getByText('매장 확인'));
  await waitFor(() => expect(screen.getByRole('alert').props.children).toContain('참여코드'));
  expect(screen.queryByLabelText('이름')).toBeNull();
  expect(mockSubmit).not.toHaveBeenCalled();
});

const next = () => fireEvent.press(screen.getByRole('button', { name: '다음' }));
function answer(label: string, value: string) {
  const input = screen.getByLabelText(label);
  expect(input.props.returnKeyType).not.toBe('next');
  expect(input.props.onSubmitEditing).toBeUndefined();
  expect(input.props.autoFocus).not.toBe(true);
  fireEvent.changeText(input, value);
  next();
}
const pick = (name: string) => fireEvent.press(screen.getByRole('radio', { name: new RegExp(`^${name}`) }));
function identity() { answer('이름', '신입'); answer('휴대폰 번호', '01012345678'); }
/** 휠은 열릴 때 보이는 값(오늘·20시간)을 답으로 채우므로 다음만 누른다. */
function common(bank = '국민') {
  next(); // 입사일(오늘)
  fireEvent.press(screen.getByRole('radio', { name: new RegExp(`^${bank}`) }));
  next();
}
function fillRegular() {
  identity();
  pick('직원'); next();
  pick('근로자'); next();
  answer('월 기본급', '3000000');
  answer('월 비과세 금액', '200000');
  common();
  fireEvent.changeText(screen.getByLabelText('계좌번호'), '123456123456');
}
const submitButton = () => screen.getByRole('button', { name: '관리자에게 제출' });

it('질문이 아래로 하나씩 쌓이고 제출 전에는 서버에 보내지 않는다', async () => {
  await renderJoin();
  expect(screen.getByLabelText('신청 매장 매장')).toBeTruthy();
  expect(screen.queryByLabelText('휴대폰 번호')).toBeNull();
  answer('이름', '신입');
  // 답한 질문은 작게 줄어 남고 다음 질문이 아래에 열린다.
  expect(screen.getByRole('button', { name: '이름을 알려 주세요, 신입' })).toBeTruthy();
  expect(screen.getByLabelText('휴대폰 번호')).toBeTruthy();
  answer('휴대폰 번호', '01012345678');
  pick('직원'); next();
  expect(screen.getByRole('radio', { name: /^프리랜서 3.3%/ })).toBeTruthy();
  expect(screen.queryByRole('radio', { name: /^일용/ })).toBeNull();
  pick('근로자'); next();
  answer('월 기본급', '3000000');
  answer('월 비과세 금액', '200000');
  common();
  fireEvent.changeText(screen.getByLabelText('계좌번호'), '123456123456');
  expect(mockSubmit).not.toHaveBeenCalled();
  expect(screen.getByText('제출해도 바로 인건비에 반영되지 않아요. 관리자가 확인하고 최종 합류를 승인해요.')).toBeTruthy();
  expect(screen.getByRole('button', { name: /월 급여는 얼마인가요\?, 3,000,000원/ })).toBeTruthy();
  await act(async () => { fireEvent.press(submitButton()); });
  await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith('1111111111111111', '신입', '01012345678', expect.objectContaining({
    employment_type: 'regular', income_type: 'employee', base_salary: 3000000, non_taxable: 200000, bank_name: '국민은행', account_number: '123456123456', weekly_rest_included: null,
  })));
  expect(screen.getByText('신청했어요')).toBeTruthy();
  expect(screen.getByText(/관리자 확인을 기다려 주세요/)).toBeTruthy();
});
it('답이 비면 다음을 꺼 두고, 형식이 틀리면 그 질문에서 멈추고 바로 고칠 수 있다', async () => {
  await renderJoin();
  const nextButton = () => screen.getByRole('button', { name: '다음' });
  expect(nextButton().props.accessibilityState.disabled).toBe(true);
  fireEvent.changeText(screen.getByLabelText('이름'), '신입');
  expect(nextButton().props.accessibilityState.disabled).toBe(false);
  next();
  fireEvent.changeText(screen.getByLabelText('휴대폰 번호'), '0101234');
  next();
  expect(screen.getByRole('alert').props.children).toBe('휴대폰 번호를 확인해주세요.');
  fireEvent.changeText(screen.getByLabelText('휴대폰 번호'), '01012345678');
  expect(screen.queryByRole('alert')).toBeNull();
  next();
  expect(screen.getByText('어떤 형태로 일하나요?')).toBeTruthy();
  expect(mockSubmit).not.toHaveBeenCalled();
});
it('뒤로 가도 이전 답변을 유지한다', async () => {
  await renderJoin();
  answer('이름', '신입');
  fireEvent.changeText(screen.getByLabelText('휴대폰 번호'), '01012345678');
  fireEvent.press(screen.getByLabelText('뒤로가기'));
  expect(screen.getByLabelText('이름').props.value).toBe('신입');
  next();
  expect(screen.getByLabelText('휴대폰 번호').props.value).toBe('010-1234-5678');
});
it('파트타이머에게 시급·주휴수당·주 근무시간을 묻고 월급 질문은 건너뛴다', async () => {
  await renderJoin();
  identity();
  pick('파트타이머'); next();
  pick('잘 모르겠어요'); next();
  expect(screen.queryByLabelText('월 기본급')).toBeNull();
  answer('시급', '13000');
  expect(screen.getByRole('radio', { name: /^시급에 들어 있어요/ })).toBeTruthy();
  pick('따로 받아요'); next();
  expect(screen.getByRole('adjustable', { name: '시간' })).toBeTruthy();
  next(); // 주 근무시간(20시간)
  common('토스');
  fireEvent.changeText(screen.getByLabelText('계좌번호'), '001234567890');
  await act(async () => { fireEvent.press(submitButton()); });
  expect(mockSubmit).toHaveBeenCalledWith('1111111111111111', '신입', '01012345678', expect.objectContaining({
    employment_type: 'part_time', income_type: 'unknown', hourly_wage: 13000, weekly_minutes: 1200, weekly_hours: 20, weekly_rest_included: false, base_salary: 0, bank_name: '토스뱅크', account_number: '001234567890',
  }));
});
it('답한 질문 하나를 눌러 고치면 다른 답은 그대로 둔다', async () => {
  await renderJoin();
  fillRegular();
  fireEvent.press(screen.getByRole('button', { name: /^월 급여는 얼마인가요\?/ }));
  fireEvent.changeText(screen.getByLabelText('월 기본급'), '3200000');
  fireEvent.press(screen.getByRole('button', { name: '확인' }));
  expect(screen.getByLabelText('계좌번호').props.value).toBe('123456123456');
  await act(async () => { fireEvent.press(submitButton()); });
  expect(mockSubmit).toHaveBeenCalledWith('1111111111111111', '신입', '01012345678', expect.objectContaining({ base_salary: 3200000, account_number: '123456123456' }));
});
it('고치는 중 근무 형태를 바꾸면 새 급여 질문부터 다시 거친다', async () => {
  await renderJoin();
  fillRegular();
  fireEvent.press(screen.getByRole('button', { name: /^어떤 형태로 일하나요\?/ }));
  pick('파트타이머');
  expect(screen.getByLabelText('시급')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '관리자에게 제출' })).toBeNull();
  answer('시급', '14000');
  pick('시급에 들어 있어요'); next();
  next(); // 주 근무시간
  next(); // 남아 있는 입사일
  next(); // 남아 있는 은행
  expect(screen.getByLabelText('계좌번호').props.value).toBe('123456123456');
  await act(async () => { fireEvent.press(submitButton()); });
  expect(mockSubmit).toHaveBeenCalledWith('1111111111111111', '신입', '01012345678', expect.objectContaining({ employment_type: 'part_time', hourly_wage: 14000, weekly_rest_included: true, base_salary: 0, bank_name: '국민은행' }));
});
it('제출에 실패하면 답을 모두 두고 다시 제출할 수 있다', async () => {
  mockSubmit.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ store_name: '매장' });
  await renderJoin();
  fillRegular();
  await act(async () => { fireEvent.press(submitButton()); });
  expect(screen.getByText('신청하지 못했어요. 답은 그대로 있으니 다시 제출해 주세요.')).toBeTruthy();
  expect(screen.getByLabelText('계좌번호').props.value).toBe('123456123456');
  await act(async () => { fireEvent.press(submitButton()); });
  expect(mockSubmit).toHaveBeenCalledTimes(2);
  expect(screen.getByText('신청했어요')).toBeTruthy();
});
it('비과세가 월 급여보다 크면 비과세 질문에서 멈춘다', async () => {
  await renderJoin();
  identity();
  pick('직원'); next(); pick('근로자'); next();
  answer('월 기본급', '100000');
  answer('월 비과세 금액', '200000');
  expect(screen.getByRole('alert').props.children).toBe('비과세 금액은 월 급여를 넘을 수 없어요.');
  expect(screen.getByLabelText('월 비과세 금액')).toBeTruthy();
});
it('은행은 짧은 이름 버튼으로 고르고 목록에 없으면 직접 입력한다', async () => {
  await renderJoin();
  identity();
  pick('직원'); next(); pick('근로자'); next();
  answer('월 기본급', '3000000');
  answer('월 비과세 금액', '0');
  next(); // 입사일
  expect(screen.getByRole('radio', { name: '케이뱅크' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'iM뱅크(구 대구은행)' })).toBeTruthy();
  fireEvent.press(screen.getByRole('radio', { name: '직접 입력' }));
  fireEvent.changeText(screen.getByLabelText('은행 이름'), 'OO저축은행');
  next();
  fireEvent.changeText(screen.getByLabelText('계좌번호'), '001234567890');
  await act(async () => { fireEvent.press(submitButton()); });
  expect(mockSubmit).toHaveBeenCalledWith('1111111111111111', '신입', '01012345678', expect.objectContaining({ bank_name: 'OO저축은행', account_number: '001234567890' }));
});
it('미리보기에서 신청을 끝내도 실제 신청을 제출하지 않는다', async () => {
  mockMode = 'regular'; await renderJoin(); fillRegular();
  await act(async () => { fireEvent.press(submitButton()); }); expect(mockSubmit).not.toHaveBeenCalled();
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import JoinStoreScreen from '../../app/(auth)/join-store';
const mockSubmit = jest.fn();
const mockGetInvite = jest.fn();
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'applicant' } }) }));
jest.mock('../../lib/hooks/useConfirmLeave', () => ({ useConfirmLeave: () => jest.fn() }));
jest.mock('../../lib/services/storeMembers', () => ({ submitJoinOnboarding: (...args: unknown[]) => mockSubmit(...args), getStoreInviteCode: (...args: unknown[]) => mockGetInvite(...args) }));
beforeEach(() => { mockSubmit.mockReset().mockResolvedValue({ store_name: '매장', store_id: 'store' }); mockGetInvite.mockReset().mockResolvedValue({ store_name: '매장', store_id: 'store' }); });
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

function next() { fireEvent.press(screen.getByText('다음')); }
function answer(label: string, value: string) {
  const input = screen.getByLabelText(label);
  expect(input.props.returnKeyType).not.toBe('next');
  expect(input.props.onSubmitEditing).toBeUndefined();
  expect(input.props.autoFocus).not.toBe(true);
  fireEvent.changeText(input, value);
  next();
}
function identity() {
  answer('이름', '신입');
  answer('휴대폰 번호', '01012345678');
}
function common() {
  answer('입사일', '2026-10-01');
  fireEvent.press(screen.getByText('국민은행'));
  next();
  answer('급여 계좌번호', '123456123456');
}
function reviewRegular() {
  identity();
  fireEvent.press(screen.getByLabelText('직원'));
  next();
  answer('월 기본급', '3,000,000');
  answer('월 비과세 금액', '200,000');
  common();
}

it('한 번에 질문 하나만 표시하고 최종 확인 전에는 서버에 전송하지 않는다', async () => {
  await renderJoin();
  expect(screen.getByLabelText('신청 매장 매장')).toBeTruthy();
  expect(screen.getByLabelText('이름')).toBeTruthy();
  expect(screen.queryByLabelText('휴대폰 번호')).toBeNull();
  expect(screen.queryByLabelText('월 기본급')).toBeNull();
  reviewRegular();
  expect(mockSubmit).not.toHaveBeenCalled();
  expect(screen.getByText('입력한 내용을 확인해주세요')).toBeTruthy();
  expect(screen.getByText('3,000,000원')).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByText('관리자에게 제출')); });
  await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith('1111111111111111', '신입', '01012345678', expect.objectContaining({ employment_type: 'regular', base_salary: 3000000, non_taxable: 200000 })));
  expect(screen.getByText('관리자 확인을 기다려주세요')).toBeTruthy();
});
it('답이 잘못되면 해당 질문에서 멈추고 바로 수정할 수 있다', async () => {
  await renderJoin();
  next();
  expect(screen.getByRole('alert').props.children).toBe('이름을 입력해주세요.');
  expect(screen.getByLabelText('이름')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('이름'), '신입');
  expect(screen.queryByRole('alert')).toBeNull();
  next();
  expect(screen.getByLabelText('휴대폰 번호')).toBeTruthy();
  expect(mockSubmit).not.toHaveBeenCalled();
});
it('뒤로 가도 이전 답변을 유지한다', async () => {
  await renderJoin();
  answer('이름', '신입');
  fireEvent.changeText(screen.getByLabelText('휴대폰 번호'), '01012345678');
  fireEvent.press(screen.getByLabelText('뒤로가기'));
  expect(screen.getByLabelText('이름').props.value).toBe('신입');
  next();
  expect(screen.getByLabelText('휴대폰 번호').props.value).toBe('01012345678');
});
it('파트타이머에게 시급·주시간만 묻고 월급 질문은 건너뛴다', async () => {
  await renderJoin();
  identity();
  fireEvent.press(screen.getByLabelText('파트타이머'));
  next();
  expect(screen.queryByLabelText('월 기본급')).toBeNull();
  answer('시급', '13,000');
  answer('주 근무시간', '20');
  common();
  expect(screen.queryByLabelText(/^월 기본급, .* 수정$/)).toBeNull();
  await act(async () => { fireEvent.press(screen.getByText('관리자에게 제출')); });
  expect(mockSubmit).toHaveBeenCalledWith('1111111111111111', '신입', '01012345678', expect.objectContaining({ employment_type: 'part_time', hourly_wage: 13000, weekly_hours: 20, base_salary: 0 }));
});
it('최종 요약에서 하나만 수정하고 다른 답은 그대로 유지한다', async () => {
  await renderJoin();
  reviewRegular();
  fireEvent.press(screen.getByLabelText('급여 계좌번호, 123456123456, 수정'));
  fireEvent.changeText(screen.getByLabelText('급여 계좌번호'), '999999999999');
  fireEvent.press(screen.getByText('수정 완료'));
  expect(screen.getByText('입력한 내용을 확인해주세요')).toBeTruthy();
  expect(screen.getByText('3,000,000원')).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByText('관리자에게 제출')); });
  expect(mockSubmit).toHaveBeenCalledWith('1111111111111111', '신입', '01012345678', expect.objectContaining({ account_number: '999999999999', base_salary: 3000000 }));
});
it('검토 중 근무 형태를 바꾸면 새로운 급여 질문을 다시 거친다', async () => {
  await renderJoin();
  reviewRegular();
  fireEvent.press(screen.getByLabelText('근무 형태, 직원 · 월급제, 수정'));
  fireEvent.press(screen.getByLabelText('파트타이머'));
  next();
  expect(screen.getByLabelText('시급')).toBeTruthy();
  expect(screen.queryByText('관리자에게 제출')).toBeNull();
  answer('시급', '14000');
  answer('주 근무시간', '16');
  next(); // preserved joining date
  next(); // preserved bank
  next(); // preserved account
  expect(screen.getByText('14,000원')).toBeTruthy();
  expect(screen.queryByLabelText(/^월 기본급, .* 수정$/)).toBeNull();
});
it('제출 실패 시 요약과 모든 답변을 유지하고 재시도한다', async () => {
  mockSubmit.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ store_name: '매장' });
  await renderJoin();
  reviewRegular();
  await act(async () => { fireEvent.press(screen.getByText('관리자에게 제출')); });
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByText('3,000,000원')).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByText('관리자에게 제출')); });
  expect(mockSubmit).toHaveBeenCalledTimes(2);
  expect(screen.getByText('관리자 확인을 기다려주세요')).toBeTruthy();
});

it('급여를 줄여 기존 비과세가 더 커지면 비과세 질문에서 수정하게 한다', async () => {
  await renderJoin();
  reviewRegular();
  fireEvent.press(screen.getByLabelText('월 기본급, 3,000,000원, 수정'));
  fireEvent.changeText(screen.getByLabelText('월 기본급'), '100,000');
  fireEvent.press(screen.getByText('수정 완료'));
  expect(screen.getByLabelText('월 비과세 금액')).toBeTruthy();
  expect(screen.getByRole('alert').props.children).toBe('비과세 금액은 월 급여를 넘을 수 없어요.');
  fireEvent.changeText(screen.getByLabelText('월 비과세 금액'), '0');
  fireEvent.press(screen.getByText('수정 완료'));
  expect(screen.getByText('100,000원')).toBeTruthy();
});

it('추가 은행을 펼쳐 선택하고 제출할 수 있다', async () => {
  await renderJoin();
  identity();
  fireEvent.press(screen.getByLabelText('직원'));
  next();
  answer('월 기본급', '3000000');
  answer('월 비과세 금액', '0');
  answer('입사일', '2026-10-01');
  expect(screen.queryByText('케이뱅크')).toBeNull();
  fireEvent.press(screen.getByText('다른 은행·금융기관 보기'));
  expect(screen.getByText('NH농협은행')).toBeTruthy();
  expect(screen.getByText('지역농축협')).toBeTruthy();
  expect(screen.getByText('iM뱅크(구 대구은행)')).toBeTruthy();
  fireEvent.press(screen.getByText('케이뱅크'));
  expect(screen.getByLabelText('은행').props.value).toBe('케이뱅크');
  next();
  answer('급여 계좌번호', '001234567890');
  await act(async () => { fireEvent.press(screen.getByText('관리자에게 제출')); });
  expect(mockSubmit).toHaveBeenCalledWith('1111111111111111', '신입', '01012345678', expect.objectContaining({ bank_name: '케이뱅크', account_number: '001234567890' }));
});

import { fireEvent, render, waitFor } from '@testing-library/react-native';
const mockReveal = jest.fn();
jest.mock('../../lib/services/accountNumbers', () => ({ revealAccountNumber: (...args: unknown[]) => mockReveal(...args) }));
import { MemberApprovalModal } from '../../lib/components/MemberApprovalModal';
import type { JoinOnboardingProfile, MemberApprovalCandidate, StoreMember } from '../../types';
const member = { applicant_name: '신청자', phone: '01012345678' } as StoreMember;
const profile = { employment_type:'regular',hourly_wage:null,weekly_hours:null,base_salary:3000000,non_taxable:200000,joined_at:'2026-10-01',bank_name:'국민은행',account_number:'123456123456',revision:1 } as JoinOnboardingProfile;
const candidate: MemberApprovalCandidate = { id: 'old', name: '퇴사 직원', phone: '01012345678', is_active: false,
  joined_at: '2025-01-01', created_at: '2025-01-01T00:00:00Z', has_other_account: false, is_applicant_account: false };
it('선택한 기록을 재입사 승인으로 전달한다', () => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={profile} member={member} candidates={[candidate]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  fireEvent.press(screen.getByText('이 직원으로 최종 합류'));
  expect(choose).toHaveBeenCalledWith({ kind: 'rehire', employeeId: 'old' }, expect.objectContaining({base_salary:3000000}));
});
it('다른 계정에 연결된 기록은 재입사로 선택할 수 없다', () => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={profile} member={member} candidates={[{ ...candidate, has_other_account: true }]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  fireEvent.press(screen.getByText('이 직원으로 최종 합류'));
  expect(choose).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('새 직원으로 최종 합류'));
  expect(choose).toHaveBeenCalledWith({ kind: 'new' }, expect.objectContaining({base_salary:3000000}));
});
it('신청 계정의 기존 기록이 있으면 새 직원으로 중복 등록하지 않는다', () => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={profile} member={member} candidates={[{ ...candidate, is_applicant_account: true }]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  fireEvent.press(screen.getByText('새 직원으로 최종 합류'));
  expect(choose).not.toHaveBeenCalled();
});

it('관리자가 기본급과 계좌를 수정해 최종 합류 내용으로 전달한다', () => {
  const choose=jest.fn();
  const screen=render(<MemberApprovalModal profile={profile} member={member} candidates={[]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  fireEvent.changeText(screen.getByLabelText('월 기본급'),'3,200,000');
  fireEvent.changeText(screen.getByLabelText('급여 계좌번호'),'999999999999');
  fireEvent.press(screen.getByText('최종 합류'));
  expect(choose).toHaveBeenCalledWith({kind:'auto'},expect.objectContaining({base_salary:3200000,account_number:'999999999999'}));
});
it.each([null, 0, -1])('정규직 월급 %s이면 필드 안내와 함께 최종 합류를 막는다', base_salary => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={{ ...profile, base_salary } as JoinOnboardingProfile} member={member} candidates={[]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  expect(screen.getByText('월급을 입력해주세요')).toBeTruthy();
  expect(screen.getByRole('button', { name: '최종 합류' }).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByText('최종 합류')); expect(choose).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('월 기본급'), '3,000,000');
  expect(screen.queryByText('월급을 입력해주세요')).toBeNull();
  fireEvent.press(screen.getByText('최종 합류')); expect(choose).toHaveBeenCalledWith({ kind: 'auto' }, expect.objectContaining({ base_salary: 3000000 }));
});
it('파트타이머는 월급 값이 있어도 시급이 없으면 합류하지 못한다', () => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={{ ...profile, employment_type: 'part_time', hourly_wage: null, weekly_hours: 20 }} member={member} candidates={[]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  expect(screen.getByText('시급을 입력해주세요')).toBeTruthy(); fireEvent.press(screen.getByText('최종 합류')); expect(choose).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('시급'), '12,000'); fireEvent.press(screen.getByText('최종 합류'));
  expect(choose).toHaveBeenCalledWith({ kind: 'auto' }, expect.objectContaining({ employment_type: 'part_time', hourly_wage: 12000 }));
});
it('고용형태를 바꾸면 새 형태의 급여 조건을 검증하고 잘못된 숫자는 통과시키지 않는다', () => {
  const screen = render(<MemberApprovalModal profile={profile} member={member} candidates={[]} busy={false} onChoose={jest.fn()} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('radio', { name: /파트타이머/  }));
  expect(screen.getByText('시급을 입력해주세요')).toBeTruthy();
  for (const value of ['0', '-100', '12x', 'Infinity', '10000001']) {
    fireEvent.changeText(screen.getByLabelText('시급'), value);
    expect(screen.getByRole('button', { name: '최종 합류' }).props.accessibilityState.disabled).toBe(true);
  }
});
it('재합류·신규 선택도 유효 급여 조건 없이는 전송하지 않는다', () => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={{ ...profile, base_salary: 0 }} member={member} candidates={[candidate]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  fireEvent.press(screen.getByText('이 직원으로 최종 합류')); fireEvent.press(screen.getByText('새 직원으로 최종 합류')); expect(choose).not.toHaveBeenCalled();
});
const prior = { ...candidate, wage_condition_valid: true, wage_history_id: '11111111-1111-4111-8111-111111111111', existing_wage: { employment_type: 'part_time' as const, hourly_wage: 12000, base_salary: null, effective_date: '2025-01-01' } };
it('재합류에서 기존 급여를 선택하면 빈 신청 급여와 편집 필드를 보내지 않는다', () => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={null} member={member} candidates={[prior]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  expect(screen.getByText(/기존 시급 12,000원/)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('퇴사 직원님의 기존 급여 그대로'));
  expect(screen.queryByText('월급을 입력해주세요')).toBeNull(); expect(screen.queryByLabelText('월 기본급')).toBeNull();
  expect(screen.queryByLabelText('급여 계좌번호')).toBeNull(); expect(screen.queryByLabelText('입사일')).toBeNull();
  expect(screen.getByText(/기존 직원 정보와 급여 조건을 유지하고 계정만 연결해요/)).toBeTruthy();
  expect(screen.queryByText(/급여 조건 이력은 오늘부터 추가/)).toBeNull();
  fireEvent.press(screen.getByText('이 직원으로 최종 합류'));
  expect(choose).toHaveBeenCalledWith({ kind: 'rehire', employeeId: 'old' }, { preserve_existing_wage: true, wage_history_id: prior.wage_history_id });
  fireEvent.press(screen.getByText('새 직원으로 최종 합류')); expect(choose).toHaveBeenCalledTimes(1);
});
it('기존 급여 보존을 해제하면 관리자 신규 입력 검증으로 돌아온다', () => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={null} member={member} candidates={[prior]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  fireEvent.press(screen.getByLabelText('퇴사 직원님의 기존 급여 그대로')); fireEvent.press(screen.getByLabelText('퇴사 직원님의 기존 급여 그대로'));
  expect(screen.getByText('월급을 입력해주세요')).toBeTruthy(); fireEvent.press(screen.getByText('이 직원으로 최종 합류')); expect(choose).not.toHaveBeenCalled();
});
it.each([{ wage_condition_valid: false }, { wage_history_id: null }, { has_other_account: true }])('유효하지 않거나 연결할 수 없는 후보는 기존 조건 보존을 선택할 수 없다: %s', change => {
  const screen = render(<MemberApprovalModal profile={null} member={member} candidates={[{ ...prior, ...change }]} busy={false} onChoose={jest.fn()} onClose={jest.fn()} />);
  expect(screen.queryByLabelText('퇴사 직원님의 기존 급여 그대로')).toBeNull();
});
it('후보 이력이 바뀌면 이전 보존 선택을 새 이력에 자동 적용하지 않는다', () => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={null} member={member} candidates={[prior]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  fireEvent.press(screen.getByLabelText('퇴사 직원님의 기존 급여 그대로'));
  screen.rerender(<MemberApprovalModal profile={null} member={member} candidates={[{ ...prior, wage_history_id: '22222222-2222-4222-8222-222222222222' }]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  fireEvent.press(screen.getByText('이 직원으로 최종 합류')); expect(choose).not.toHaveBeenCalled();
});

it('암호화된 계좌번호는 화면에 보이지 않고 전체 번호를 받아 채운다', async () => {
  mockReveal.mockResolvedValueOnce('123456123456');
  const choose = jest.fn();
  const encrypted = { ...profile, account_number: 'enc:v1:3456:abc' } as JoinOnboardingProfile;
  const screen = render(<MemberApprovalModal profile={encrypted} member={{ ...member, id: 'm1' } as StoreMember} candidates={[]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  expect(screen.queryByDisplayValue('enc:v1:3456:abc')).toBeNull();
  await waitFor(() => expect(screen.getByDisplayValue('123456123456')).toBeTruthy());
  expect(mockReveal).toHaveBeenCalledWith('join_profile', 'm1');
  fireEvent.press(screen.getByText('최종 합류'));
  expect(choose).toHaveBeenCalledWith({ kind: 'auto' }, expect.objectContaining({ account_number: '123456123456' }));
});

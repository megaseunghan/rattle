import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
const mockReveal = jest.fn();
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../lib/services/accountNumbers', () => ({ revealAccountNumber: (...args: unknown[]) => mockReveal(...args) }));
import { MemberApprovalModal } from '../../lib/components/MemberApprovalModal';
import type { JoinOnboardingProfile, MemberApprovalCandidate, StoreMember } from '../../types';
const member = { applicant_name: '신청자', phone: '01012345678', created_at: '2026-11-27T00:00:00Z' } as StoreMember;
const profile = { employment_type:'regular',hourly_wage:null,weekly_hours:null,base_salary:3000000,non_taxable:200000,joined_at:'2026-10-01',bank_name:'국민은행',account_number:'123456123456',revision:1 } as JoinOnboardingProfile;
const partProfile = { ...profile, employment_type: 'part_time', hourly_wage: 12000, base_salary: 0, non_taxable: 0, weekly_minutes: 1230, weekly_rest_included: false, income_type: 'employee' } as JoinOnboardingProfile;
const candidate: MemberApprovalCandidate = { id: 'old', name: '퇴사 직원', phone: '01012345678', is_active: false,
  joined_at: '2025-01-01', created_at: '2025-01-01T00:00:00Z', has_other_account: false, is_applicant_account: false };
type Screen = ReturnType<typeof render>;
const row = (screen: Screen, label: RegExp) => screen.getByRole('button', { name: label });
function editSheet(screen: Screen, rowLabel: RegExp, inputs: Record<string, string>) {
  fireEvent.press(row(screen, rowLabel));
  for (const [label, value] of Object.entries(inputs)) fireEvent.changeText(screen.getByLabelText(label), value);
  fireEvent.press(screen.getByRole('button', { name: '확인' }));
}
const finalButton = (screen: Screen) => screen.getByRole('button', { name: '최종 합류' });

it('선택한 기록을 재입사 승인으로 전달한다', () => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={profile} member={member} candidates={[candidate]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  fireEvent.press(screen.getByText('이 직원으로 최종 합류'));
  expect(choose).toHaveBeenCalledWith({ kind: 'rehire', employeeId: 'old' }, expect.objectContaining({ base_salary: 3000000, income_type: 'employee', is_probation: false }));
});
it('다른 계정에 연결된 기록은 재입사로 선택할 수 없다', () => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={profile} member={member} candidates={[{ ...candidate, has_other_account: true }]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  fireEvent.press(screen.getByText('이 직원으로 최종 합류'));
  expect(choose).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('새 직원으로 최종 합류'));
  expect(choose).toHaveBeenCalledWith({ kind: 'new' }, expect.objectContaining({ base_salary: 3000000 }));
});
it('신청 계정의 기존 기록이 있으면 새 직원으로 중복 등록하지 않는다', () => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={profile} member={member} candidates={[{ ...candidate, is_applicant_account: true }]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  fireEvent.press(screen.getByText('새 직원으로 최종 합류'));
  expect(choose).not.toHaveBeenCalled();
});

it('관리자가 시트에서 기본급과 계좌를 고쳐 최종 합류 내용으로 전달한다', () => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={profile} member={member} candidates={[]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  editSheet(screen, /^월 기본급/, { '월 기본급': '3,200,000' });
  editSheet(screen, /^급여 계좌/, { '계좌번호': '999999999999' });
  expect(row(screen, /^급여 계좌/).props.accessibilityLabel).toContain('국민 ····9999');
  fireEvent.press(finalButton(screen));
  expect(choose).toHaveBeenCalledWith({ kind: 'auto' }, expect.objectContaining({ base_salary: 3200000, non_taxable: 200000, account_number: '999999999999', bank_name: '국민은행' }));
});
it.each([null, 0, -1])('정규직 월급 %s이면 필드 안내와 함께 최종 합류를 막는다', base_salary => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={{ ...profile, base_salary } as JoinOnboardingProfile} member={member} candidates={[]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  expect(screen.getByText('월급을 입력해주세요')).toBeTruthy();
  expect(finalButton(screen).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(finalButton(screen)); expect(choose).not.toHaveBeenCalled();
  editSheet(screen, /^월 기본급/, { '월 기본급': '3,000,000' });
  expect(screen.queryByText('월급을 입력해주세요')).toBeNull();
  fireEvent.press(finalButton(screen)); expect(choose).toHaveBeenCalledWith({ kind: 'auto' }, expect.objectContaining({ base_salary: 3000000 }));
});
it('파트타이머는 시급이 없으면 합류하지 못한다', () => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={{ ...partProfile, hourly_wage: null }} member={member} candidates={[]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  expect(screen.getByText('시급을 입력해주세요')).toBeTruthy(); fireEvent.press(finalButton(screen)); expect(choose).not.toHaveBeenCalled();
  editSheet(screen, /^시급/, { '시급': '12,000' }); fireEvent.press(finalButton(screen));
  expect(choose).toHaveBeenCalledWith({ kind: 'auto' }, expect.objectContaining({ employment_type: 'part_time', hourly_wage: 12000, weekly_minutes: 1230, weekly_hours: 20, weekly_rest_included: false }));
});
it('근무 형태를 바꾸면 새 형태의 급여 조건을 검증하고 잘못된 숫자는 통과시키지 않는다', () => {
  const screen = render(<MemberApprovalModal profile={profile} member={member} candidates={[]} busy={false} onChoose={jest.fn()} onClose={jest.fn()} />);
  fireEvent.press(row(screen, /^근무 형태/));
  fireEvent.press(screen.getByRole('radio', { name: '파트타이머' }));
  expect(screen.getByText('시급을 입력해주세요')).toBeTruthy();
  expect(finalButton(screen).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(row(screen, /^시급/));
  fireEvent.changeText(screen.getByLabelText('시급'), '0');
  expect(screen.getByRole('button', { name: '확인' }).props.accessibilityState.disabled).toBe(true);
  // 숫자가 아닌 글자(부호·문자)는 입력칸에 남지 않는다.
  for (const [typed, shown] of [['-100', '100'], ['12x', '12']]) {
    fireEvent.changeText(screen.getByLabelText('시급'), typed);
    expect(screen.getByLabelText('시급').props.value).toBe(shown);
  }
});
it('재합류·신규 선택도 유효 급여 조건 없이는 전송하지 않는다', () => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={{ ...profile, base_salary: 0 }} member={member} candidates={[candidate]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  fireEvent.press(screen.getByText('이 직원으로 최종 합류')); fireEvent.press(screen.getByText('새 직원으로 최종 합류')); expect(choose).not.toHaveBeenCalled();
});
const prior = { ...candidate, wage_condition_valid: true, wage_history_id: '11111111-1111-4111-8111-111111111111', existing_wage: { employment_type: 'part_time' as const, hourly_wage: 12000, base_salary: null, effective_date: '2025-01-01' } };
it('재합류에서 기존 급여를 선택하면 빈 신청 급여와 편집 줄을 보내지 않는다', () => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={null} member={member} candidates={[prior]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  expect(screen.getByText(/기존 시급 12,000원/)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('퇴사 직원님의 기존 급여 그대로'));
  expect(screen.queryByText('월급을 입력해주세요')).toBeNull(); expect(screen.queryByRole('button', { name: /^월 기본급/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /^급여 계좌/ })).toBeNull(); expect(screen.queryByRole('button', { name: /^입사일/ })).toBeNull();
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
  expect(screen.queryByText(/enc:v1/)).toBeNull();
  await waitFor(() => expect(row(screen, /^급여 계좌/).props.accessibilityLabel).toContain('····3456'));
  expect(mockReveal).toHaveBeenCalledWith('join_profile', 'm1');
  fireEvent.press(finalButton(screen));
  expect(choose).toHaveBeenCalledWith({ kind: 'auto' }, expect.objectContaining({ account_number: '123456123456' }));
});

it('계좌번호를 푸는 동안에는 확인 요청 대신 불러오는 중으로 안내하고 최종 합류를 막는다', async () => {
  let resolve: (value: string) => void = () => {};
  mockReveal.mockReturnValueOnce(new Promise<string>(r => { resolve = r; }));
  const encrypted = { ...profile, account_number: 'enc:v1:3456:abc' } as JoinOnboardingProfile;
  const screen = render(<MemberApprovalModal profile={encrypted} member={{ ...member, id: 'm2' } as StoreMember} candidates={[]} busy={false} onChoose={jest.fn()} onClose={jest.fn()} />);
  expect(screen.getByText('계좌번호를 불러오는 중이에요.')).toBeTruthy();
  expect(screen.queryByText('계좌번호를 확인해주세요.')).toBeNull();
  expect(finalButton(screen).props.accessibilityState.disabled).toBe(true);
  resolve('123456123456');
  await waitFor(() => expect(finalButton(screen).props.accessibilityState.disabled).toBe(false));
  expect(screen.queryByText('계좌번호를 불러오는 중이에요.')).toBeNull();
});

it('재직 직원에 연결되면 고르지 않은 수습·계약은 매장 기본값으로 덮지 않고 그대로 둔다', () => {
  const choose = jest.fn();
  const active = { ...candidate, id: 'cur', name: '재직 직원', is_active: true };
  const screen = render(<MemberApprovalModal profile={profile} member={member} candidates={[active]} busy={false} onChoose={choose} onClose={jest.fn()}
    storeDefaults={{ default_probation_months: 3, default_probation_rate: 0.9 }} />);
  expect(row(screen, /^수습 적용/).props.accessibilityLabel).toContain('지금 조건 그대로');
  expect(row(screen, /^계약/).props.accessibilityLabel).toContain('지금 조건 그대로');
  fireEvent.press(finalButton(screen));
  const review = choose.mock.calls[0][1];
  expect(review).not.toHaveProperty('is_probation');
  expect(review).not.toHaveProperty('probation_rate');
  expect(review).not.toHaveProperty('income_type');
  expect(review).toMatchObject({ base_salary: 3000000 });
});

it('새 직원이면 매장 기본 수습과 계약을 함께 보낸다', () => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={profile} member={member} candidates={[]} busy={false} onChoose={choose} onClose={jest.fn()}
    storeDefaults={{ default_probation_months: 3, default_probation_rate: 0.9 }} />);
  fireEvent.press(finalButton(screen));
  expect(choose.mock.calls[0][1]).toMatchObject({ is_probation: true, probation_rate: 0.9, income_type: 'employee' });
});

it('계약이 잘 모르겠어요면 관리자가 정해야 최종 합류가 켜진다', () => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={{ ...profile, income_type: 'unknown' }} member={member} candidates={[]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  const contract = row(screen, /^계약/);
  expect(within(contract).getByText('직원이 잘 모르겠대요')).toBeTruthy();
  expect(within(contract).getByText('정해 주세요')).toBeTruthy();
  expect(finalButton(screen).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(contract);
  expect(screen.getByText('근로계약서에 적힌 대로 골라 주세요.')).toBeTruthy();
  expect(screen.queryByRole('radio', { name: '잘 모르겠어요' })).toBeNull();
  fireEvent.press(screen.getByRole('radio', { name: '프리랜서' }));
  expect(within(row(screen, /^계약/)).queryByText('직원이 잘 모르겠대요')).toBeNull();
  fireEvent.press(finalButton(screen));
  expect(choose).toHaveBeenCalledWith({ kind: 'auto' }, expect.objectContaining({ income_type: 'freelancer' }));
});
it('직원이 고른 계약·주휴수당에는 직원이 고름을 표시한다', () => {
  const screen = render(<MemberApprovalModal profile={partProfile} member={member} candidates={[]} busy={false} onChoose={jest.fn()} onClose={jest.fn()} />);
  expect(within(row(screen, /^계약/)).getByText('직원이 고름')).toBeTruthy();
  expect(within(row(screen, /^주휴수당/)).getByText('직원이 고름')).toBeTruthy();
  expect(row(screen, /^주 근무시간/).props.accessibilityLabel).toContain('20시간 30분');
});
it('최저임금보다 적은 시급은 회색으로 안내만 하고 막지 않는다', () => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={{ ...partProfile, hourly_wage: 9000 }} member={member} candidates={[]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  expect(screen.getByText(/최저임금 시급 .*원보다 적어요. 그래도 저장할 수 있어요./)).toBeTruthy();
  fireEvent.press(finalButton(screen)); expect(choose).toHaveBeenCalled();
});
it('매장 기본 수습 기간·비율로 수습을 채우고 시트에서 끌 수 있다', () => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={{ ...profile, joined_at: '2026-12-01' }} member={member} candidates={[]} busy={false}
    storeDefaults={{ default_probation_months: 3, default_probation_rate: 0.9 }} onChoose={choose} onClose={jest.fn()} />);
  expect(row(screen, /^수습 적용/).props.accessibilityLabel).toContain('2027년 2월 28일까지 · 90%');
  fireEvent.press(finalButton(screen));
  expect(choose).toHaveBeenLastCalledWith({ kind: 'auto' }, expect.objectContaining({ is_probation: true, probation_ends_on: '2027-02-28', probation_rate: 0.9 }));
  fireEvent.press(row(screen, /^수습 적용/));
  expect(screen.getByText('매장 기본값')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '1개월' }));
  fireEvent.changeText(screen.getByLabelText('수습 중 급여 비율'), '95');
  expect(screen.queryByText('매장 기본값')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '확인' }));
  fireEvent.press(finalButton(screen));
  expect(choose).toHaveBeenLastCalledWith({ kind: 'auto' }, expect.objectContaining({ is_probation: true, probation_ends_on: '2026-12-31', probation_rate: 0.95 }));
  fireEvent.press(row(screen, /^수습 적용/));
  fireEvent.press(screen.getByRole('radio', { name: '적용 안 해요' }));
  fireEvent.press(screen.getByRole('button', { name: '확인' }));
  fireEvent.press(finalButton(screen));
  expect(choose).toHaveBeenLastCalledWith({ kind: 'auto' }, expect.objectContaining({ is_probation: false, probation_ends_on: null, probation_rate: null }));
});
it('수습 비율이 최저임금 90%보다 적으면 회색으로 안내한다', () => {
  const screen = render(<MemberApprovalModal profile={{ ...partProfile, hourly_wage: 10320, joined_at: '2026-12-01' }} member={member} candidates={[]} busy={false}
    storeDefaults={{ default_probation_months: 3, default_probation_rate: 0.9 }} onChoose={jest.fn()} onClose={jest.fn()} />);
  fireEvent.press(row(screen, /^수습 적용/));
  expect(screen.queryByText('최저임금의 90%보다 적어요. 수습이어도 이보다 적게 줄 수 없어요.')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('수습 중 급여 비율'), '80');
  expect(screen.getByText('최저임금의 90%보다 적어요. 수습이어도 이보다 적게 줄 수 없어요.')).toBeTruthy();
  expect(screen.getByText('1년 미만 계약이거나 단순노무 업무면 수습이어도 급여를 줄일 수 없어요.')).toBeTruthy();
});
it('매장 기본 수습이 없으면 수습 없이 보낸다', () => {
  const choose = jest.fn();
  const screen = render(<MemberApprovalModal profile={profile} member={member} candidates={[]} busy={false} onChoose={choose} onClose={jest.fn()} />);
  expect(row(screen, /^수습 적용/).props.accessibilityLabel).toContain('적용 안 함');
  fireEvent.press(finalButton(screen));
  expect(choose).toHaveBeenCalledWith({ kind: 'auto' }, expect.objectContaining({ is_probation: false }));
});
it('거절 버튼을 누르면 거절을 요청한다', () => {
  const reject = jest.fn();
  const screen = render(<MemberApprovalModal profile={profile} member={member} candidates={[]} busy={false} onChoose={jest.fn()} onReject={reject} onClose={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: '거절' }));
  expect(reject).toHaveBeenCalled();
});

import { fireEvent, render } from '@testing-library/react-native';
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

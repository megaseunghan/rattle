import { act, renderHook } from '@testing-library/react-native';
import { useMemberApproval } from '../../lib/hooks/useMemberApproval';
import type { JoinOnboardingInput, StoreMember } from '../../types';
let mockStore = { id: 'store' };
const mockProfile = jest.fn();
const mockReview = jest.fn();
const mockCandidates = jest.fn();
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin' }, store: mockStore }) }));
jest.mock('../../lib/services/storeMembers', () => ({
  getJoinOnboarding: (...args: unknown[]) => mockProfile(...args),
  approveJoinOnboarding: (...args: unknown[]) => mockReview(...args),
  getMemberApprovalCandidates: (...args: unknown[]) => mockCandidates(...args),
}));
const member = { id: 'request', store_id: 'store' } as StoreMember;
const review: JoinOnboardingInput = { employment_type: 'regular',hourly_wage:null,weekly_hours:null,base_salary:3000000,non_taxable:200000,joined_at:'2026-10-01',bank_name:'국민은행',account_number:'123456123456' };
beforeEach(() => { jest.clearAllMocks(); mockStore = { id: 'store' }; mockProfile.mockResolvedValue({ ...review, revision: 2 }); mockCandidates.mockResolvedValue([]); mockReview.mockResolvedValue({ employee_id: 'employee' }); });
it('일치 직원이 없어도 세부내역 확인 전에 자동 승인하지 않는다', async () => {
  const { result } = renderHook(() => useMemberApproval());
  await act(async () => { await result.current.prepare(member); });
  expect(result.current.selection?.profile?.revision).toBe(2);
  expect(mockReview).not.toHaveBeenCalled();
  await act(async () => { await result.current.confirm({ kind: 'auto' }, { ...review, base_salary:3200000 }); });
  expect(mockReview).toHaveBeenCalledWith('request',2,{ kind:'auto' },{...review,base_salary:3200000});
  expect(result.current.selection).toBeNull();
});
it('재입사 선택과 관리자 수정 조건을 같이 전달한다', async () => {
  mockCandidates.mockResolvedValue([{ id:'retired',is_active:false }]);
  const { result } = renderHook(() => useMemberApproval());
  await act(async () => { await result.current.prepare(member); });
  await act(async () => { await result.current.confirm({kind:'rehire',employeeId:'retired'},review); });
  expect(mockReview).toHaveBeenCalledWith('request',2,{kind:'rehire',employeeId:'retired'},review);
});
it('기존 신청에 제출 정보가 없으면 관리자가 입력해서 확정한다', async () => {
  mockProfile.mockResolvedValue(null);
  const { result } = renderHook(() => useMemberApproval());
  await act(async () => { await result.current.prepare(member); });
  expect(result.current.selection).not.toBeNull();
  await act(async () => { expect(await result.current.confirm({kind:'new'})).toBeNull(); });
  expect(mockReview).not.toHaveBeenCalled();
  await act(async () => { await result.current.confirm({kind:'new'},review); });
  expect(mockReview).toHaveBeenCalledWith('request',0,{kind:'new'},review);
});
it('매장 전환 후 늦게 도착한 후보 응답은 표시하지 않는다', async () => {
  let finish!: (rows: unknown[]) => void;
  mockCandidates.mockImplementationOnce(() => new Promise(resolve => { finish=resolve; }));
  const { result,rerender }=renderHook(() => useMemberApproval());
  let pending!: ReturnType<typeof result.current.prepare>;
  act(() => { pending=result.current.prepare(member); });
  mockStore={id:'other'};rerender({});
  await act(async () => { finish([]);await pending; });
  expect(result.current.selection).toBeNull();expect(mockReview).not.toHaveBeenCalled();
});
it('확정 실패 시 수정할 수 있도록 확인 화면을 유지한다', async () => {
  mockReview.mockRejectedValueOnce(new Error('changed'));
  const { result }=renderHook(() => useMemberApproval());
  await act(async () => { await result.current.prepare(member); });
  await act(async () => { await expect(result.current.confirm({kind:'auto'},review)).rejects.toThrow('changed'); });
  expect(result.current.selection).not.toBeNull();
});

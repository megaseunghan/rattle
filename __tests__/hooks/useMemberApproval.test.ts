import { act, renderHook } from '@testing-library/react-native';
import { useMemberApproval } from '../../lib/hooks/useMemberApproval';
import type { JoinOnboardingInput, StoreMember } from '../../types';
let mockStore = { id: 'store' };
let mockPreview='self';
const mockProfile = jest.fn();
const mockReview = jest.fn();
const mockCandidates = jest.fn();
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin' }, store: mockStore, canManageStore: true, devPreviewMode: mockPreview }) }));
jest.mock('../../lib/services/storeMembers', () => ({
  getJoinOnboarding: (...args: unknown[]) => mockProfile(...args),
  approveJoinOnboarding: (...args: unknown[]) => mockReview(...args),
  getMemberApprovalCandidates: (...args: unknown[]) => mockCandidates(...args),
}));
const member = { id: 'request', store_id: 'store' } as StoreMember;
const review: JoinOnboardingInput = { employment_type: 'regular',hourly_wage:null,weekly_hours:null,base_salary:3000000,non_taxable:200000,joined_at:'2026-10-01',bank_name:'국민은행',account_number:'123456123456' };
beforeEach(() => { jest.clearAllMocks(); mockPreview='self'; mockStore = { id: 'store' }; mockProfile.mockResolvedValue({ ...review, revision: 2 }); mockCandidates.mockResolvedValue([]); mockReview.mockResolvedValue({ employee_id: 'employee' }); });
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

it('확인 화면을 연 뒤 미리보기로 바뀌면 최종 합류를 실행하지 않는다',async()=>{
 const {result,rerender}=renderHook(useMemberApproval);
 await act(async()=>{await result.current.prepare(member);});const confirm=result.current.confirm;
 mockPreview='regular';rerender({});await expect(confirm({kind:'new'},review)).rejects.toThrow();
 expect(mockReview).not.toHaveBeenCalled();
});
it.each([
  ['JOIN_HOURLY_WAGE_REQUIRED', '시급을 입력해주세요'],
  ['JOIN_BASE_SALARY_REQUIRED', '월급을 입력해주세요'],
  ['JOIN_WAGE_HISTORY_REQUIRED', '기존 급여 조건이 없어요. 이번 합류에 적용할 급여를 입력해주세요'],
  ['JOIN_EMPLOYMENT_TYPE_REQUIRED', '근무 형태를 선택해주세요'],
])('서버 %s 거절은 내부 원문 대신 입력 안내로 바꾸고 선택을 유지한다', async (code, message) => {
  mockReview.mockRejectedValueOnce({ code: 'P0001', message: code });
  const { result } = renderHook(() => useMemberApproval());
  await act(async () => { await result.current.prepare(member); });
  await act(async () => { await expect(result.current.confirm({ kind: 'auto' }, review)).rejects.toThrow(message); });
  expect(result.current.selection).not.toBeNull();
});
const wageCandidate = { id: 'retired', is_active: false, has_other_account: false, is_applicant_account: false, wage_condition_valid: true,
  wage_history_id: '11111111-1111-4111-8111-111111111111', existing_wage: { employment_type: 'part_time', hourly_wage: 12000, base_salary: null, effective_date: '2025-01-01' } };
it('빈 신청 정보라도 유효한 후보의 기존 조건을 두 키 payload로 보존한다', async () => {
  mockProfile.mockResolvedValue(null); mockCandidates.mockResolvedValue([wageCandidate]);
  const { result } = renderHook(() => useMemberApproval()); await act(async () => { await result.current.prepare(member); });
  const payload = { preserve_existing_wage: true as const, wage_history_id: wageCandidate.wage_history_id };
  await act(async () => { await result.current.confirm({ kind: 'rehire', employeeId: 'retired' }, payload); });
  expect(mockReview).toHaveBeenCalledWith('request', 0, { kind: 'rehire', employeeId: 'retired' }, payload);
  expect(Object.keys(mockReview.mock.calls[0][3]).sort()).toEqual(['preserve_existing_wage', 'wage_history_id']);
});
it('보존 이력 ID가 현재 후보와 다르면 승인 요청 전에 막는다', async () => {
  mockCandidates.mockResolvedValue([wageCandidate]); const { result } = renderHook(() => useMemberApproval());
  await act(async () => { await result.current.prepare(member); });
  await act(async () => { await expect(result.current.confirm({ kind: 'rehire', employeeId: 'retired' }, { preserve_existing_wage: true, wage_history_id: 'changed' })).rejects.toThrow('후보를 다시 불러온'); });
  expect(mockReview).not.toHaveBeenCalled(); expect(result.current.selection).not.toBeNull();
});
it('서버가 조건 변경을 거절하면 재조회 안내와 선택 화면을 유지하고 자동 재승인하지 않는다', async () => {
  mockCandidates.mockResolvedValue([wageCandidate]); mockReview.mockRejectedValueOnce({ code: 'P0001', message: 'JOIN_WAGE_CONDITION_CHANGED' });
  const { result } = renderHook(() => useMemberApproval()); await act(async () => { await result.current.prepare(member); });
  await act(async () => { await expect(result.current.confirm({ kind: 'rehire', employeeId: 'retired' }, { preserve_existing_wage: true, wage_history_id: wageCandidate.wage_history_id })).rejects.toThrow('후보를 다시 불러온'); });
  expect(mockReview).toHaveBeenCalledTimes(1); expect(result.current.selection).not.toBeNull();
});

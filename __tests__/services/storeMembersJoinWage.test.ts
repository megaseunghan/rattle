jest.mock('../../lib/supabase', () => ({supabase:{rpc:jest.fn(),from:jest.fn()}}));
jest.mock('../../lib/services/cacheInvalidation', () => ({invalidateCachedStore:jest.fn().mockResolvedValue(undefined)}));
import {supabase} from '../../lib/supabase';
import {invalidateCachedStore} from '../../lib/services/cacheInvalidation';
import {approveJoinOnboarding,approveStoreMember,resolveStoreMemberApproval,getMemberApprovalCandidates} from '../../lib/services/storeMembers';
const rpc=supabase.rpc as jest.Mock;
const review={employment_type:'regular' as const,hourly_wage:null,weekly_hours:null,base_salary:3000000,non_taxable:200000,joined_at:'2026-11-18',bank_name:'가상은행',account_number:'test-only'};
beforeEach(()=>jest.clearAllMocks());
it.each(['JOIN_HOURLY_WAGE_REQUIRED','JOIN_BASE_SALARY_REQUIRED','JOIN_WAGE_HISTORY_REQUIRED','JOIN_EMPLOYMENT_TYPE_REQUIRED','JOIN_EMPLOYEE_REQUIRED','EMPLOYEE_FORBIDDEN','JOIN_PROFILE_INVALID','INVALID_EMPLOYEE_CONDITIONS'])('%s는 안정적인 서비스 코드와 안전한 안내만 전달한다',async code=>{
 rpc.mockResolvedValue({data:null,error:{code:code==='EMPLOYEE_FORBIDDEN'?'42501':'P0001',message:code,details:'private-condition'}});
 await expect(approveJoinOnboarding('member',1,{kind:'new'},review)).rejects.toMatchObject({code});
 try {await approveJoinOnboarding('member',1,{kind:'new'},review);} catch(error) {
  expect((error as Error).message).not.toContain(code);
  expect(JSON.stringify(error)).not.toContain('private-condition');
 }
 expect(invalidateCachedStore).not.toHaveBeenCalled();
});
it.each([()=>resolveStoreMemberApproval('m',{kind:'rehire',employeeId:'e'}),()=>approveStoreMember('m'),()=>getMemberApprovalCandidates('m')])('레거시 승인/후보 조회도 급여·권한 코드 매핑을 공유한다',async call=>{
 rpc.mockResolvedValue({data:null,error:{code:'P0001',message:'JOIN_WAGE_HISTORY_REQUIRED'}});
 await expect(call()).rejects.toMatchObject({code:'JOIN_WAGE_HISTORY_REQUIRED'});
});
it('알 수 없는 42501 권한 거절도 고정된 권한 코드로 돌린다',async()=>{
 rpc.mockResolvedValue({data:null,error:{code:'42501',message:'permission denied internal table'}});
 await expect(getMemberApprovalCandidates('m')).rejects.toMatchObject({code:'EMPLOYEE_FORBIDDEN'});
});

const historyId='00000000-0000-0000-0000-000000000009';
const candidate={id:'retired',name:'가상 직원',phone:null,is_active:false,joined_at:'2026-01-01',created_at:'2026-01-01T00:00:00Z',has_other_account:false,is_applicant_account:false,
 employment_type:'part_time',wage_condition_valid:true,wage_history_id:historyId,wage_effective_date:'2026-10-01',wage_hourly_wage:12000,wage_base_salary:0,
 existing_wage:{employment_type:'part_time',hourly_wage:12000,base_salary:0,effective_date:'2026-10-01'}};
it('관리자 전용 급여 후보 RPC만 사용하고 유효 조건 요약/이력 ID를 보존한다',async()=>{
 rpc.mockResolvedValue({data:[candidate,{...candidate,id:'missing',wage_condition_valid:false,wage_history_id:null,existing_wage:null}],error:null});
 const rows=await getMemberApprovalCandidates('member');
 expect(rpc).toHaveBeenCalledWith('get_member_approval_wage_candidates',{p_member_id:'member'});
 expect(rows[0]).toMatchObject({existing_wage:candidate.existing_wage,wage_history_id:historyId});
 expect(rows[1].existing_wage).toBeNull();
 expect(supabase.from).not.toHaveBeenCalled();
});
it('재합류 보존 payload에는 조회한 이력 ID와 보존 true만 보내고 급여 필드는 생략한다',async()=>{
 rpc.mockResolvedValue({data:[{employee_id:'retired',employee_name:'가상 직원'}],error:null});
 const payload={preserve_existing_wage:true as const,wage_history_id:historyId};
 await approveJoinOnboarding('member',3,{kind:'rehire',employeeId:'retired'},payload);
 expect(rpc).toHaveBeenCalledWith('approve_join_onboarding',{p_member_id:'member',p_revision:3,p_choice:'rehire',p_employee_id:'retired',p_review:payload});
 expect(invalidateCachedStore).toHaveBeenCalled();
});
it('보존과 급여 필드 혼합 또는 신규 합류 보존은 요청 전에 거절한다',async()=>{
 const payload={preserve_existing_wage:true as const,wage_history_id:historyId};
 await expect(approveJoinOnboarding('m',1,{kind:'new'},payload)).rejects.toMatchObject({code:'JOIN_WAGE_PRESERVE_INVALID'});
 await expect(approveJoinOnboarding('m',1,{kind:'rehire',employeeId:'e'},{...payload,base_salary:3000000} as any)).rejects.toMatchObject({code:'JOIN_WAGE_PRESERVE_INVALID'});
 expect(rpc).not.toHaveBeenCalled();
});
it.each(['JOIN_WAGE_CONDITION_CHANGED','JOIN_WAGE_PRESERVE_INVALID'])('재합류 %s는 재조회/재선택 안내로 매핑한다',async code=>{
 rpc.mockResolvedValue({data:null,error:{code:'P0001',message:code,details:'private'}});
 await expect(approveJoinOnboarding('m',1,{kind:'rehire',employeeId:'e'},{preserve_existing_wage:true,wage_history_id:historyId})).rejects.toMatchObject({code});
});
it('후보 조회 권한 오류는 호환/직접 테이블 조회로 우회하지 않는다',async()=>{
 rpc.mockResolvedValue({data:null,error:{code:'42501',message:'EMPLOYEE_FORBIDDEN'}});
 await expect(getMemberApprovalCandidates('m')).rejects.toMatchObject({code:'EMPLOYEE_FORBIDDEN'});
 expect(rpc).toHaveBeenCalledTimes(1);expect(supabase.from).not.toHaveBeenCalled();
});
it('후보 계약 누락을 기존 조건 없음으로 바꾸지 않는다',async()=>{
 const {existing_wage,...incomplete}=candidate;
 rpc.mockResolvedValue({data:[incomplete],error:null});
 await expect(getMemberApprovalCandidates('m')).rejects.toThrow();
});
it('새 급여를 확정하는 전체 검토 payload와 최초 revision 0 계약을 유지한다',async()=>{
 rpc.mockResolvedValue({data:[{employee_id:'new',employee_name:'가상 직원'}],error:null});
 await approveJoinOnboarding('member',0,{kind:'new'},review);
 expect(rpc).toHaveBeenCalledWith('approve_join_onboarding',{p_member_id:'member',p_revision:0,p_review:review,p_choice:'new',p_employee_id:null});
});

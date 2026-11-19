import { mapMemberApprovalError, MemberApprovalServiceError } from './memberApprovalErrors';
import { invalidateCachedStore } from './cacheInvalidation';
import { UserFacingError } from '../utils/error';
import { supabase } from '../supabase';
import type { JoinOnboardingInput, JoinOnboardingReview, JoinOnboardingProfile, MemberApprovalCandidate, MemberApprovalChoice, MemberApprovalResult, StoreJoinResult, StoreMember } from '../../types';

export async function requestStoreMembership(businessNumber: string, name: string, phone: string): Promise<StoreJoinResult> {
  const { data, error } = await supabase.rpc('request_store_membership', {
    p_business_number: businessNumber, p_name: name.trim(), p_phone: phone,
  });
  if (error) throw mapMemberApprovalError(error);
  if (!data?.[0]) throw new UserFacingError('참여 신청 결과를 확인하지 못했어요. 목록을 다시 확인해주세요.');
  return data[0] as StoreJoinResult;
}

export async function createStoreInviteCode(storeId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_store_invite_code', { p_store_id: storeId });
  if (error) throw mapMemberApprovalError(error);
  if (!data) throw new UserFacingError('초대코드를 만들지 못했어요.');
  return data as string;
}

export async function getStoreInviteCode(code: string): Promise<StoreJoinResult> {
  const { data, error } = await supabase.rpc('get_store_invite_code', { p_code: code });
  if (error) throw mapMemberApprovalError(error);
  if (!data?.[0]) throw new UserFacingError('초대코드를 확인하지 못했어요.');
  return data[0] as StoreJoinResult;
}

export async function submitJoinOnboarding(code: string, name: string, phone: string, profile: JoinOnboardingInput): Promise<StoreJoinResult> {
  const { data, error } = await supabase.rpc('submit_join_onboarding_code', {
    p_code: code, p_name: name.trim(), p_phone: phone, p_profile: profile,
  });
  if (error) throw mapMemberApprovalError(error);
  if (!data?.[0]) throw new UserFacingError('신청 결과를 확인하지 못했어요. 다시 확인해주세요.');
  return data[0] as StoreJoinResult;
}

export async function getJoinOnboarding(memberId: string): Promise<JoinOnboardingProfile | null> {
  const { data, error } = await supabase.from('store_join_profiles').select('*').eq('member_id', memberId).maybeSingle();
  if (error) throw mapMemberApprovalError(error);
  return data as JoinOnboardingProfile | null;
}

export async function approveJoinOnboarding(memberId: string, revision: number, choice: MemberApprovalChoice, review: JoinOnboardingReview): Promise<MemberApprovalResult> {
  if (Object.hasOwn(review, 'preserve_existing_wage')) {
    const preserve = review as {preserve_existing_wage:unknown;wage_history_id?:unknown};
    if (choice.kind !== 'rehire' || preserve.preserve_existing_wage !== true
      || typeof preserve.wage_history_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(preserve.wage_history_id)
      || Object.keys(review).some(key => key !== 'preserve_existing_wage' && key !== 'wage_history_id')) {
      throw new MemberApprovalServiceError('JOIN_WAGE_PRESERVE_INVALID');
    }
  }
  const { data, error } = await supabase.rpc('approve_join_onboarding', {
    p_member_id: memberId, p_revision: revision, p_review: review, p_choice: choice.kind,
    p_employee_id: choice.kind === 'rehire' ? choice.employeeId : null,
  });
  if (error) throw mapMemberApprovalError(error);
  if (!data?.[0]) throw new UserFacingError('승인 결과를 확인하지 못했어요. 다시 확인해주세요.');
  await invalidateCachedStore();
  return data[0] as MemberApprovalResult;
}

export async function getStoreMembers(storeId: string): Promise<StoreMember[]> {
  const { data, error } = await supabase.from('store_members').select('*')
    .eq('store_id', storeId).order('created_at', { ascending: true });
  if (error) throw mapMemberApprovalError(error);
  return (data ?? []) as StoreMember[];
}

export async function getMemberApprovalCandidates(memberId: string): Promise<MemberApprovalCandidate[]> {
  const { data, error } = await supabase.rpc('get_member_approval_wage_candidates', { p_member_id: memberId });
  if (error) throw mapMemberApprovalError(error);
  if (!Array.isArray(data)) throw new UserFacingError('후보의 급여 조건을 확인하지 못했어요. 다시 불러와주세요.');
  return data.map((candidate: MemberApprovalCandidate) => {
    if (!candidate || typeof candidate.id !== 'string' || typeof candidate.wage_condition_valid !== 'boolean'
      || !Object.hasOwn(candidate, 'existing_wage')) {
      throw new UserFacingError('후보의 급여 조건을 확인하지 못했어요. 다시 불러와주세요.');
    }
    const wage = candidate.existing_wage;
    if (wage !== null && (!wage || !['regular','part_time'].includes(wage.employment_type)
      || typeof wage.effective_date !== 'string'
      || (wage.employment_type === 'part_time' ? wage.hourly_wage == null || !Number.isFinite(Number(wage.hourly_wage)) || Number(wage.hourly_wage) <= 0
        : wage.base_salary == null || !Number.isFinite(Number(wage.base_salary)) || Number(wage.base_salary) <= 0))) {
      throw new UserFacingError('후보의 급여 조건을 확인하지 못했어요. 다시 불러와주세요.');
    }
    if (candidate.wage_condition_valid && (!wage || !candidate.wage_history_id || candidate.is_active || candidate.has_other_account)) {
      throw new UserFacingError('후보의 급여 조건을 확인하지 못했어요. 다시 불러와주세요.');
    }
    return candidate;
  });
}

export async function resolveStoreMemberApproval(memberId: string, choice: MemberApprovalChoice): Promise<MemberApprovalResult> {
  const { data, error } = await supabase.rpc('resolve_store_member_approval', {
    p_member_id: memberId,
    p_employee_id: choice.kind === 'rehire' ? choice.employeeId : null,
  });
  if (error) throw mapMemberApprovalError(error);
  if (!data?.[0]) throw new UserFacingError('승인 결과를 확인하지 못했어요. 목록을 다시 확인해주세요.');
  await invalidateCachedStore();
  return data[0] as MemberApprovalResult;
}

export async function approveStoreMember(memberId: string): Promise<MemberApprovalResult> {
  const { data, error } = await supabase.rpc('approve_store_member', { p_member_id: memberId });
  if (error) throw mapMemberApprovalError(error);
  if (!data?.[0]) throw new UserFacingError('연결된 직원을 확인하지 못했어요. 목록을 다시 확인해주세요.');
  await invalidateCachedStore();
  return data[0] as MemberApprovalResult;
}

export async function rejectStoreMember(storeId: string, memberId: string): Promise<void> {
  const { data, error } = await supabase.from('store_members').update({ status: 'rejected' })
    .eq('store_id', storeId).eq('id', memberId).eq('status', 'pending').select('id');
  if (error) throw mapMemberApprovalError(error);
  if (!data?.length) throw new UserFacingError('이미 처리된 신청이거나 권한이 없습니다. 목록을 새로고침해주세요.');
  await invalidateCachedStore(storeId);
}

export async function removeStoreMember(storeId: string, memberId: string): Promise<void> {
  const { error, count } = await supabase.from('store_members').delete({ count: 'exact' })
    .eq('store_id', storeId).eq('id', memberId);
  if (error) throw mapMemberApprovalError(error);
  if (!count) throw new UserFacingError('이미 제거된 멤버이거나 권한이 없습니다.');
  await invalidateCachedStore(storeId);
}

export async function transferStoreOwnership(storeId: string, memberId: string): Promise<void> {
  const { error } = await supabase.rpc('transfer_store_ownership', { p_store_id: storeId, p_member_id: memberId });
  if (error) throw mapMemberApprovalError(error);
  await invalidateCachedStore(storeId);
}

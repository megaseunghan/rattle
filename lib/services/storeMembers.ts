import { invalidateCachedStore } from './cacheInvalidation';
import { UserFacingError } from '../utils/error';
import { supabase } from '../supabase';
import type { JoinOnboardingInput, JoinOnboardingProfile, MemberApprovalCandidate, MemberApprovalChoice, MemberApprovalResult, StoreJoinResult, StoreMember } from '../../types';

export async function requestStoreMembership(businessNumber: string, name: string, phone: string): Promise<StoreJoinResult> {
  const { data, error } = await supabase.rpc('request_store_membership', {
    p_business_number: businessNumber, p_name: name.trim(), p_phone: phone,
  });
  if (error) throw error;
  if (!data?.[0]) throw new UserFacingError('참여 신청 결과를 확인하지 못했어요. 목록을 다시 확인해주세요.');
  return data[0] as StoreJoinResult;
}

export async function submitJoinOnboarding(businessNumber: string, name: string, phone: string, profile: JoinOnboardingInput): Promise<StoreJoinResult> {
  const { data, error } = await supabase.rpc('submit_join_onboarding', {
    p_business_number: businessNumber, p_name: name.trim(), p_phone: phone, p_profile: profile,
  });
  if (error) throw error;
  if (!data?.[0]) throw new UserFacingError('신청 결과를 확인하지 못했어요. 다시 확인해주세요.');
  return data[0] as StoreJoinResult;
}

export async function getJoinOnboarding(memberId: string): Promise<JoinOnboardingProfile | null> {
  const { data, error } = await supabase.from('store_join_profiles').select('*').eq('member_id', memberId).maybeSingle();
  if (error) throw error;
  return data as JoinOnboardingProfile | null;
}

export async function approveJoinOnboarding(memberId: string, revision: number, choice: MemberApprovalChoice, review: JoinOnboardingInput): Promise<MemberApprovalResult> {
  const { data, error } = await supabase.rpc('approve_join_onboarding', {
    p_member_id: memberId, p_revision: revision, p_review: review, p_choice: choice.kind,
    p_employee_id: choice.kind === 'rehire' ? choice.employeeId : null,
  });
  if (error) throw error;
  if (!data?.[0]) throw new UserFacingError('승인 결과를 확인하지 못했어요. 다시 확인해주세요.');
  await invalidateCachedStore();
  return data[0] as MemberApprovalResult;
}

export async function getStoreMembers(storeId: string): Promise<StoreMember[]> {
  const { data, error } = await supabase.from('store_members').select('*')
    .eq('store_id', storeId).order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as StoreMember[];
}

export async function getMemberApprovalCandidates(memberId: string): Promise<MemberApprovalCandidate[]> {
  const { data, error } = await supabase.rpc('get_member_approval_candidates', { p_member_id: memberId });
  if (error) throw error;
  return (data ?? []) as MemberApprovalCandidate[];
}

export async function resolveStoreMemberApproval(memberId: string, choice: MemberApprovalChoice): Promise<MemberApprovalResult> {
  const { data, error } = await supabase.rpc('resolve_store_member_approval', {
    p_member_id: memberId,
    p_employee_id: choice.kind === 'rehire' ? choice.employeeId : null,
  });
  if (error) throw error;
  if (!data?.[0]) throw new UserFacingError('승인 결과를 확인하지 못했어요. 목록을 다시 확인해주세요.');
  await invalidateCachedStore();
  return data[0] as MemberApprovalResult;
}

export async function approveStoreMember(memberId: string): Promise<MemberApprovalResult> {
  const { data, error } = await supabase.rpc('approve_store_member', { p_member_id: memberId });
  if (error) throw error;
  if (!data?.[0]) throw new UserFacingError('연결된 직원을 확인하지 못했어요. 목록을 다시 확인해주세요.');
  await invalidateCachedStore();
  return data[0] as MemberApprovalResult;
}

export async function rejectStoreMember(storeId: string, memberId: string): Promise<void> {
  const { data, error } = await supabase.from('store_members').update({ status: 'rejected' })
    .eq('store_id', storeId).eq('id', memberId).eq('status', 'pending').select('id');
  if (error) throw error;
  if (!data?.length) throw new UserFacingError('이미 처리된 신청이거나 권한이 없습니다. 목록을 새로고침해주세요.');
  await invalidateCachedStore(storeId);
}

export async function removeStoreMember(storeId: string, memberId: string): Promise<void> {
  const { error, count } = await supabase.from('store_members').delete({ count: 'exact' })
    .eq('store_id', storeId).eq('id', memberId);
  if (error) throw error;
  if (!count) throw new UserFacingError('이미 제거된 멤버이거나 권한이 없습니다.');
  await invalidateCachedStore(storeId);
}

export async function transferStoreOwnership(storeId: string, memberId: string): Promise<void> {
  const { error } = await supabase.rpc('transfer_store_ownership', { p_store_id: storeId, p_member_id: memberId });
  if (error) throw error;
  await invalidateCachedStore(storeId);
}

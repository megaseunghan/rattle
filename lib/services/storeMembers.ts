import { UserFacingError } from '../utils/error';
import { supabase } from '../supabase';
import type { MemberApprovalResult, StoreJoinResult, StoreMember } from '../../types';

export async function requestStoreMembership(businessNumber: string, name: string, phone: string): Promise<StoreJoinResult> {
  const { data, error } = await supabase.rpc('request_store_membership', {
    p_business_number: businessNumber, p_name: name.trim(), p_phone: phone,
  });
  if (error) throw error;
  if (!data?.[0]) throw new UserFacingError('참여 신청 결과를 확인하지 못했어요. 목록을 다시 확인해주세요.');
  return data[0] as StoreJoinResult;
}

export async function getStoreMembers(storeId: string): Promise<StoreMember[]> {
  const { data, error } = await supabase.from('store_members').select('*')
    .eq('store_id', storeId).order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as StoreMember[];
}

export async function approveStoreMember(memberId: string): Promise<MemberApprovalResult> {
  const { data, error } = await supabase.rpc('approve_store_member', { p_member_id: memberId });
  if (error) throw error;
  if (!data?.[0]) throw new UserFacingError('연결된 직원을 확인하지 못했어요. 목록을 다시 확인해주세요.');
  return data[0] as MemberApprovalResult;
}

export async function rejectStoreMember(storeId: string, memberId: string): Promise<void> {
  const { data, error } = await supabase.from('store_members').update({ status: 'rejected' })
    .eq('store_id', storeId).eq('id', memberId).eq('status', 'pending').select('id');
  if (error) throw error;
  if (!data?.length) throw new UserFacingError('이미 처리된 신청이거나 권한이 없습니다. 목록을 새로고침해주세요.');
}

export async function removeStoreMember(storeId: string, memberId: string): Promise<void> {
  const { error, count } = await supabase.from('store_members').delete({ count: 'exact' })
    .eq('store_id', storeId).eq('id', memberId);
  if (error) throw error;
  if (!count) throw new UserFacingError('이미 제거된 멤버이거나 권한이 없습니다.');
}

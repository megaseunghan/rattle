import { supabase } from '../supabase';
import { UserFacingError } from '../utils/error';

export interface StoreDetails {
  name: string;
  business_number: string | null;
  owner_phone: string | null;
  address: string | null;
  toss_merchant_id: string | null;
  closing_time: string | null;
  labor_ratio_target: number;
  cogs_ratio_target: number;
}

export async function getStoreDetails(storeId: string): Promise<StoreDetails> {
  const { data, error } = await supabase
    .from('stores')
    .select('name, business_number, owner_phone, address, toss_merchant_id, closing_time, labor_ratio_target, cogs_ratio_target')
    .eq('id', storeId)
    .single();

  if (error) throw new Error(error.message);
  return data as StoreDetails;
}

export async function updateStoreInfo(
  storeId: string,
  data: Partial<Pick<StoreDetails, 'name' | 'business_number' | 'owner_phone' | 'address' | 'toss_merchant_id' | 'labor_ratio_target' | 'cogs_ratio_target'>>,
): Promise<void> {
  const { error } = await supabase
    .from('stores')
    .update(data)
    .eq('id', storeId);

  if (error) throw new Error(error.message);
}

/** Whole-hour closing boundary; existing stores update contract. */
export async function updateStoreClosingTime(storeId: string, closingTime: string): Promise<void> {
  const { error } = await supabase.from('stores').update({ closing_time: closingTime }).eq('id', storeId);
  if (error) throw error;
}

export type StoreDeleteResult =
  | { mode: 'deleted'; purgeAfter: null }
  | { mode: 'scheduled'; purgeAfter: string };

export interface DeletedStore {
  id: string;
  name: string;
  deletedAt: string;
  purgeAfter: string;
}

function toUserFacing(error: { message: string }, messages: Record<string, string>): Error {
  const message = Object.entries(messages).find(([code]) => error.message.includes(code))?.[1];
  return message ? new UserFacingError(message) : new Error(error.message);
}

/**
 * Owner-only. A store without records is removed at once; any other store is
 * hidden from everyone and kept restorable for 7 days before it is purged.
 */
export async function deleteOwnedStore(storeId: string): Promise<StoreDeleteResult> {
  const { data, error } = await supabase.rpc('delete_owned_store', { p_store_id: storeId });
  if (error) {
    throw toUserFacing(error, {
      STORE_DELETE_AUTH_REQUIRED: '다시 로그인한 뒤 시도해주세요.',
      STORE_DELETE_OWNER_REQUIRED: '매장 소유자만 삭제할 수 있어요.',
      STORE_DELETE_ALREADY_SCHEDULED: '이미 삭제 예정인 매장이에요.',
      STORE_DELETE_POS_CONNECTED: 'POS 연결을 해제한 뒤 삭제해주세요.',
      STORE_DELETE_UNCHECKED_REFERENCE: '매장 자료를 안전하게 확인하지 못했어요. 고객센터에 문의해주세요.',
    });
  }
  if (data?.mode === 'deleted') return { mode: 'deleted', purgeAfter: null };
  if (data?.mode === 'scheduled' && typeof data.purge_after === 'string') {
    return { mode: 'scheduled', purgeAfter: data.purge_after };
  }
  throw new Error('Store deletion returned an unexpected result');
}

/** Stores the caller owns that are waiting to be purged and can still be restored. */
export async function listMyDeletedStores(): Promise<DeletedStore[]> {
  const { data, error } = await supabase.rpc('list_my_deleted_stores');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: { id: string; name: string; deleted_at: string; purge_after: string }) => ({
    id: row.id, name: row.name, deletedAt: row.deleted_at, purgeAfter: row.purge_after,
  }));
}

export async function restoreDeletedStore(storeId: string): Promise<void> {
  const { error } = await supabase.rpc('restore_deleted_store', { p_store_id: storeId });
  if (!error) return;
  throw toUserFacing(error, {
    STORE_RESTORE_AUTH_REQUIRED: '다시 로그인한 뒤 시도해주세요.',
    STORE_RESTORE_NOT_FOUND: '복구할 수 있는 매장이 아니에요.',
    STORE_RESTORE_EXPIRED: '복구 기간 7일이 지나 복구할 수 없어요.',
  });
}

/** Idempotent owner setup; no business number or payroll changes. */
export async function createStoreWithSetup(input: {
  name: string; posChoice: import('../../types').PosSetupChoice;
  shareScope: import('../../types').FinancialShareScope; requestId: string;
}): Promise<import('../../types').Store> {
  const { data, error } = await supabase.rpc('create_store_with_setup', {
    p_name: input.name.trim(), p_pos_choice: input.posChoice,
    p_share_scope: input.shareScope, p_request_id: input.requestId,
  });
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error('Store creation returned no store');
  return data;
}

export async function getFinancialAccess(storeIds: string[]): Promise<Record<string, boolean>> {
  if (!storeIds.length) return {};
  const { data, error } = await supabase.rpc('get_my_store_financial_access', { p_store_ids: storeIds });
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row: { store_id: string; allowed: boolean }) => [row.store_id, row.allowed === true]));
}

export async function updateFinancialSharing(storeId: string, scope: import('../../types').FinancialShareScope): Promise<void> {
  const { error } = await supabase.rpc('set_store_financial_sharing', { p_store_id: storeId, p_scope: scope });
  if (error) throw error;
}

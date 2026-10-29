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

/** Only a sole owner of a store without operational records can remove it. */
export async function deleteEmptyOwnedStore(storeId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_empty_owned_store', { p_store_id: storeId });
  if (!error) return;
  const messages: Record<string, string> = {
    STORE_DELETE_AUTH_REQUIRED: '다시 로그인한 뒤 시도해주세요.',
    STORE_DELETE_OWNER_REQUIRED: '매장 소유자만 삭제할 수 있어요.',
    STORE_DELETE_POS_CONNECTED: 'POS 연결을 해제한 뒤 삭제해주세요.',
    STORE_DELETE_HAS_MEMBERS: '다른 구성원이 있어요. 멤버 관리를 확인해주세요.',
    STORE_DELETE_HAS_DATA: '매장에 기록이 있어 삭제할 수 없어요. 소유권을 이전하거나 문의해주세요.',
    STORE_DELETE_UNCHECKED_REFERENCE: '매장 자료를 안전하게 확인하지 못했어요. 고객센터에 문의해주세요.',
  };
  const message = Object.entries(messages).find(([code]) => error.message.includes(code))?.[1];
  if (message) throw new UserFacingError(message);
  throw error;
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

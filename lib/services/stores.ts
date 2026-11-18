import { supabase } from '../supabase';
import { UserFacingError } from '../utils/error';
import type { Store } from '../../types';

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

export interface MyStores {
  stores: Store[];
  roles: Record<string, 'admin' | 'member'>;
  access: Record<string, boolean>;
}

/**
 * 앱 시작용 매장 목록·참여 역할·재무 열람 권한. get_my_store_bootstrap 한 번으로 받는다.
 * 서버에 함수가 아직 없을 때(PGRST202)만 기존 3단계 조회를 쓰고, 그 밖의 오류는 그대로 던진다.
 */
export async function loadMyStores(userId: string): Promise<MyStores> {
  const { data, error } = await supabase.rpc('get_my_store_bootstrap');
  if (error) {
    if (error.code === 'PGRST202') return loadMyStoresLegacy(userId);
    throw new Error(error.message);
  }
  const result: MyStores = { stores: [], roles: {}, access: {} };
  for (const row of (data ?? []) as { store: Store; member_role: 'admin' | 'member' | null; financial_access: boolean }[]) {
    result.stores.push(row.store);
    if (row.member_role) result.roles[row.store.id] = row.member_role;
    result.access[row.store.id] = row.financial_access === true;
  }
  return result;
}

async function loadMyStoresLegacy(userId: string): Promise<MyStores> {
  const [ownedRes, memberRes] = await Promise.all([
    supabase.from('stores').select('*').eq('owner_id', userId).order('created_at', { ascending: true }),
    supabase.from('store_members').select('store_id, role, stores(*)').eq('user_id', userId).eq('status', 'approved'),
  ]);
  if (ownedRes.error) throw new Error(ownedRes.error.message);
  if (memberRes.error) throw new Error(memberRes.error.message);
  const roles: Record<string, 'admin' | 'member'> = {};
  // 소유 매장 우선, 멤버 매장 중복 제거 후 병합
  const storeMap = new Map<string, Store>();
  ((ownedRes.data ?? []) as Store[]).forEach(store => storeMap.set(store.id, store));
  for (const m of (memberRes.data ?? []) as unknown as { store_id: string; role: 'admin' | 'member'; stores: Store | null }[]) {
    if (!m.stores) continue;
    roles[m.store_id] = m.role;
    if (!storeMap.has(m.stores.id)) storeMap.set(m.stores.id, m.stores);
  }
  const stores = Array.from(storeMap.values());
  // Missing migration/network error fails closed for members; owners remain usable.
  let access: Record<string, boolean> = {};
  try { access = await getFinancialAccess(stores.map(store => store.id)); } catch { /* No member financial reads without server confirmation. */ }
  return { stores, roles, access };
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

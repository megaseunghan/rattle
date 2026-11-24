import { supabase } from '../supabase';
import { UserFacingError } from '../utils/error';
import type { Store } from '../../types';
import { getMyStoreVisibility, setStoreVisibility } from './storeVisibility';
import { invalidateCachedStore } from './cacheInvalidation';

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
  // 매출 탭의 매장 연결 정보는 30분 재사용한다. POS 연결을 바꾸면 바로 다시 확인하게 한다.
  try { await invalidateCachedStore(storeId, ['pos']); } catch { /* 저장 성공을 조회 갱신 실패로 바꾸지 않는다. */ }
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
    throw Object.assign(new Error(error.message), { code: error.code });
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
  if (ownedRes.error) throw Object.assign(new Error(ownedRes.error.message), { code: ownedRes.error.code });
  if (memberRes.error) throw Object.assign(new Error(memberRes.error.message), { code: memberRes.error.code });
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

/** 쓰기 결과불명과 경합은 읽기 확인 없이 재저장하면 안 된다. */
export class FinancialSharingWriteError extends UserFacingError {
  constructor(readonly status: 'unknown' | 'conflict') {
    super(status === 'unknown' ? '저장 결과를 확인하지 못했어요. 다시 불러온 뒤 확인해주세요.' : '열람 설정이 변경됐어요. 다시 불러온 뒤 저장해주세요.');
  }
}

export async function updateFinancialSharing(storeId: string, scope: import('../../types').FinancialShareScope): Promise<void> {
  // 기존 단일 설정 화면의 호환 진입점. 새 화면은 로드한 revision으로 setStoreVisibility를 직접 호출한다.
  const current = await getMyStoreVisibility(storeId);
  if (current.status !== 'success') throw new UserFacingError('열람 설정을 확인하지 못했어요. 다시 불러와주세요.');
  const result = await setStoreVisibility(storeId, { ...current.data, financial_share_scope: scope }, current.data.visibility_revision);
  if (result.status === 'success') return;
  if (result.status === 'conflict') throw new FinancialSharingWriteError('conflict');
  if (result.status === 'unknown') throw new FinancialSharingWriteError('unknown');
  throw new UserFacingError('열람 설정을 저장하지 못했어요. 다시 불러와주세요.');
}

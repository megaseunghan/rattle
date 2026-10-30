import { UserFacingError } from '../utils/error';
import { supabase } from '../supabase';
import { invalidateCachedStore } from './cacheInvalidation';

export const DEFAULT_PURCHASE_TYPES = ['쿠팡', '네이버', '수기'];
export function validatePurchaseType(value: string): string {
  const name = value.trim();
  if (!name || name.length > 40 || name === '전체') throw new UserFacingError('유형은 1~40자로 입력해 주세요. 전체는 사용할 수 없어요.');
  return name;
}
export async function getPurchaseTypes(storeId: string): Promise<string[]> {
  const { data, error } = await supabase.from('store_taxonomies').select('name')
    .eq('store_id', storeId).eq('domain', 'purchase_type').eq('is_active', true).order('sort_order').order('id');
  if (error) throw error;
  return (data ?? []).map(row => row.name);
}
export async function changePurchaseType(storeId: string, oldName: string | null, value: string): Promise<string[]> {
  const name = validatePurchaseType(value);
  const { data, error } = await supabase.rpc('change_store_taxonomy', { p_store_id: storeId, p_domain: 'purchase_type', p_old_name: oldName, p_new_name: name, p_action: oldName == null ? 'add' : 'rename' });
  if (error) throw new Error(error.message);
  await invalidateCachedStore(storeId);
  return data as string[];
}

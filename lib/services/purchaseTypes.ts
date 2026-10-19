import { UserFacingError } from '../utils/error';
import { supabase } from '../supabase';

export const DEFAULT_PURCHASE_TYPES = ['쿠팡', '네이버', '수기'];
export function validatePurchaseType(value: string): string {
  const name = value.trim();
  if (!name || name.length > 40 || name === '전체') throw new UserFacingError('유형은 1~40자로 입력해 주세요. 전체는 사용할 수 없어요.');
  return name;
}
export async function getPurchaseTypes(storeId: string): Promise<string[]> {
  const { data, error } = await supabase.from('stores').select('purchase_types').eq('id', storeId).single();
  if (error) throw new Error(error.message);
  return data.purchase_types ?? DEFAULT_PURCHASE_TYPES;
}
export async function changePurchaseType(storeId: string, oldName: string | null, value: string): Promise<string[]> {
  const name = validatePurchaseType(value);
  const { data, error } = await supabase.rpc('change_purchase_type', { p_store_id: storeId, p_old_name: oldName, p_new_name: name });
  if (error) throw new Error(error.message);
  return data as string[];
}

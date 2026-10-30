import { supabase } from '../supabase';
import { TossOrder } from '../../types';
import { UserFacingError } from '../utils/error';
import { invalidateStoreData } from '../query/client';

export async function getTossMerchantId(storeId: string, known?: string | null): Promise<string> {
  if (known) return known;
  const { data, error } = await supabase.from('stores').select('toss_merchant_id').eq('id', storeId).single();
  if (error) throw error;
  if (!data?.toss_merchant_id) throw new UserFacingError('Toss Place 연동이 설정되지 않았습니다');
  return data.toss_merchant_id;
}
export async function hasPosOrders(storeId: string, from: string, to: string): Promise<boolean> {
  const { data, error } = await supabase.from('toss_orders').select('id')
    .eq('store_id', storeId).gte('order_at', from).lt('order_at', to).limit(1);
  if (error) throw error;
  return !!data?.length;
}
export async function savePosOrders(storeId: string, orders: TossOrder[]): Promise<void> {
  if (!orders.length) return;
  // Each bounded chunk is atomic, including payment splits and detail replacement.
  let attempted = false;
  try {
    for (let offset = 0; offset < orders.length; offset += 500) {
      attempted = true;
      const { error } = await supabase.rpc('upsert_pos_order_batch', {
        p_store_id: storeId, p_orders: orders.slice(offset, offset + 500),
      });
      if (error) throw error;
    }
  } finally {
    // Earlier chunks may have committed even when a later chunk failed.
    if (attempted) await invalidateStoreData(storeId);
  }
}

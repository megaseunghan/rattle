import { supabase } from '../supabase';

export interface StoreDetails {
  name: string;
  business_number: string | null;
  owner_phone: string | null;
  address: string | null;
  toss_merchant_id: string | null;
}

export async function getStoreDetails(storeId: string): Promise<StoreDetails> {
  const { data, error } = await supabase
    .from('stores')
    .select('name, business_number, owner_phone, address, toss_merchant_id')
    .eq('id', storeId)
    .single();

  if (error) throw new Error(error.message);
  return data as StoreDetails;
}

export async function updateStoreInfo(
  storeId: string,
  data: Partial<Pick<StoreDetails, 'name' | 'business_number' | 'owner_phone' | 'address'>>,
): Promise<void> {
  const { error } = await supabase
    .from('stores')
    .update(data)
    .eq('id', storeId);

  if (error) throw new Error(error.message);
}

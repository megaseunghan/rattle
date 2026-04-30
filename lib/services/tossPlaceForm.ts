import { supabase } from '../supabase';

interface StoreApplyInfo {
  name: string;
  address: string;
  businessNumber: string;
  ownerPhone: string;
}

export async function submitTossPlaceApplication(info: StoreApplyInfo): Promise<void> {
  const { error } = await supabase.functions.invoke('submit-toss-application', {
    body: {
      name: info.name,
      address: info.address,
      businessNumber: info.businessNumber,
      ownerPhone: info.ownerPhone,
    },
  });

  if (error) throw new Error(error.message);
}

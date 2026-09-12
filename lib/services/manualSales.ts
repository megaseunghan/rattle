import { supabase } from '../supabase';
import { ManualSale, ManualSalePaymentMethod } from '../../types';

export async function getManualSalesByMonth(storeId: string, yearMonth: string): Promise<ManualSale[]> {
  const from = `${yearMonth}-01`;
  const lastDay = new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)), 0).getDate();
  const to = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('manual_sales')
    .select('*')
    .eq('store_id', storeId)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ManualSale[];
}

export async function createManualSale(input: {
  storeId: string;
  date: string;
  amount: number;
  paymentMethod: ManualSalePaymentMethod;
  memo: string | null;
}): Promise<ManualSale> {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('manual_sales')
    .insert({
      store_id: input.storeId,
      date: input.date,
      amount: input.amount,
      payment_method: input.paymentMethod,
      memo: input.memo,
      created_by: userData.user?.id ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ManualSale;
}

export async function deleteManualSale(id: string): Promise<void> {
  const { error } = await supabase.from('manual_sales').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** 손익계산서용 — 카드/현금 매출 합계 (배달앱은 현금성으로 취급) */
export async function getManualSalesTotals(
  storeId: string,
  yearMonth: string,
): Promise<{ cardRevenue: number; cashRevenue: number; total: number }> {
  const rows = await getManualSalesByMonth(storeId, yearMonth);
  let cardRevenue = 0;
  let cashRevenue = 0;
  for (const r of rows) {
    if (r.payment_method === 'card') cardRevenue += Number(r.amount);
    else cashRevenue += Number(r.amount);
  }
  return { cardRevenue, cashRevenue, total: cardRevenue + cashRevenue };
}

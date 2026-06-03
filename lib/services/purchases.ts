import { supabase } from '../supabase';
import { Purchase, PurchaseCategory, PurchaseType } from '../../types';

export async function getPurchasesByMonth(
  storeId: string,
  yearMonth: string, // 'YYYY-MM'
): Promise<Purchase[]> {
  const from = `${yearMonth}-01`;
  const lastDay = new Date(
    Number(yearMonth.slice(0, 4)),
    Number(yearMonth.slice(5, 7)),
    0,
  ).getDate();
  const to = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('purchases')
    .select('*')
    .eq('store_id', storeId)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Purchase[];
}

export async function createPurchase(data: {
  store_id: string;
  date: string;
  supplier: string;
  amount: number;
  category: PurchaseCategory;
  type: PurchaseType;
  note?: string | null;
}): Promise<Purchase> {
  const { data: row, error } = await supabase
    .from('purchases')
    .insert(data)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return row as Purchase;
}

export async function deletePurchase(id: string): Promise<void> {
  const { error } = await supabase.from('purchases').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getPurchasesTotalByMonth(
  storeId: string,
  yearMonth: string,
): Promise<number> {
  const items = await getPurchasesByMonth(storeId, yearMonth);
  return items.reduce((sum, p) => sum + p.amount, 0);
}

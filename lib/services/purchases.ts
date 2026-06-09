import { supabase } from '../supabase';
import { Purchase, PurchaseCategory, PurchaseType, PurchaseItem, PurchaseItemInput } from '../../types';

// 품목 매입 등록: 카테고리별 매입 분할 + 재고 증가 + last_price 갱신 (원자적, RPC)
export async function createPurchaseWithItems(input: {
  store_id: string;
  date: string;
  supplier: string;
  type: PurchaseType;
  items: PurchaseItemInput[];
}): Promise<void> {
  const { error } = await supabase.rpc('create_purchase_with_items', {
    p_store_id: input.store_id,
    p_date: input.date,
    p_supplier: input.supplier,
    p_type: input.type,
    p_items: input.items,
  });
  if (error) throw new Error(error.message);
}

export async function getPurchaseById(id: string): Promise<Purchase> {
  const { data, error } = await supabase
    .from('purchases')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data as Purchase;
}

export async function getPurchaseItems(purchaseId: string): Promise<PurchaseItem[]> {
  const { data, error } = await supabase
    .from('purchase_items')
    .select('*')
    .eq('purchase_id', purchaseId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PurchaseItem[];
}

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

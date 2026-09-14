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

/** 여러 매입 건의 품목을 한 번에 조회 (손익 카테고리별 집계용) */
export async function getPurchaseItemsForPurchases(purchaseIds: string[]): Promise<PurchaseItem[]> {
  if (purchaseIds.length === 0) return [];
  const { data, error } = await supabase
    .from('purchase_items')
    .select('*')
    .in('purchase_id', purchaseIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as PurchaseItem[];
}

/** 매입 건별 품목 수 (목록에서 "N개 품목" 표시용) */
export async function getPurchaseItemCounts(purchaseIds: string[]): Promise<Record<string, number>> {
  if (purchaseIds.length === 0) return {};
  const { data, error } = await supabase
    .from('purchase_items')
    .select('purchase_id')
    .in('purchase_id', purchaseIds);
  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { purchase_id: string }[]) {
    counts[row.purchase_id] = (counts[row.purchase_id] ?? 0) + 1;
  }
  return counts;
}

/** 매입 품목 수량/단가 수정 — 재고 델타 반영 + last_price 갱신 + 매입 합계 재계산 (원자적, RPC) */
export async function updatePurchaseItem(
  itemId: string,
  quantity: number,
  unitPrice: number,
): Promise<void> {
  const { error } = await supabase.rpc('update_purchase_item', {
    p_item_id: itemId,
    p_quantity: quantity,
    p_unit_price: unitPrice,
  });
  if (error) throw new Error(error.message);
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

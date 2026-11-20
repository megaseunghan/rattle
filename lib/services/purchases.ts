import { UserFacingError } from '../utils/error';
import { discardParentEvidence } from './evidence';
import { readAllRows } from './readAllRows';
import { invalidateCachedStore } from './cacheInvalidation';
import { supabase } from '../supabase';
import { Purchase, PurchaseCategory, PurchaseType, PurchaseItem, PurchaseItemInput } from '../../types';

export class PurchaseWriteError extends Error {
  constructor(readonly outcome: 'rejected' | 'unknown', readonly original: unknown) {
    super('매입 등록 결과를 확인해주세요.');
    this.name = 'PurchaseWriteError';
  }
}

type BasePurchaseInput = { date: string; supplier: string; type: PurchaseType };
type ClassifiedItem = { ingredient_id: string | null; name: string; quantity: number; unit: string; amount: number; category: string };
export type PurchaseFormInput = BasePurchaseInput & (
  { mode: 'items'; returnId: true; rows: ClassifiedItem[] } |
  { mode: 'amounts'; returnId: true; rows: { category: string; amount: number }[] } |
  { category: string; returnId: true; items: { ingredient_id: string | null; name: string; quantity: number; unit: string; amount: number }[] } |
  { category?: undefined; returnId?: boolean; items: PurchaseItemInput[] }
);

export async function getPurchaseSuppliers(storeId: string, signal: AbortSignal) {
  const rows = await readAllRows<{ supplier: string }>((from, to) =>
    supabase.rpc('list_purchase_suppliers', { p_store_id: storeId }).range(from, to).abortSignal(signal));
  return rows.map(row => row.supplier);
}

export async function createPurchaseWithItems(input: PurchaseFormInput & { store_id: string }): Promise<{ refreshFailed: boolean; purchaseId?: string }> {
  let result;
  try {
    const common = { p_store_id: input.store_id, p_date: input.date, p_supplier: input.supplier, p_type: input.type };
    if ('mode' in input) {
      result = await supabase.rpc('create_purchase_entry', { ...common, p_mode: input.mode, p_rows: input.rows });
    } else {
      const rpc = input.category !== undefined ? 'create_purchase_with_amounts'
        : input.returnId ? 'create_purchase_with_evidence' : 'create_purchase_with_items';
      result = await supabase.rpc(rpc, { ...common, p_items: input.items, ...(input.category !== undefined && { p_category: input.category }) });
    }
  } catch (error) {
    throw new PurchaseWriteError('unknown', error);
  }
  if (result.error) {
    // SQL/PGRST rejection confirms the transaction did not succeed. Transport
    // errors and gateway timeouts can arrive after a committed write.
    const code = result.error.code ?? '';
    const rejected = (/^[0-9A-Z]{5}$/.test(code) && !code.startsWith('08')) || /^PGRST\d+$/.test(code);
    throw new PurchaseWriteError(rejected ? 'rejected' : 'unknown', result.error);
  }
  try {
    await invalidateCachedStore(input.store_id);
    return { refreshFailed: false, ...(input.returnId ? { purchaseId: result.data as string } : {}) };
  } catch {
    // The RPC already acknowledged success. Never turn refresh failure into a
    // failed write that encourages duplicate inventory increments.
    return { refreshFailed: true, ...(input.returnId ? { purchaseId: result.data as string } : {}) };
  }
}

export async function getPurchaseById(id: string): Promise<Purchase> {
  const { data, error } = await supabase
    .from('purchases')
    .select('*,category_amounts')
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
  const rows: PurchaseItem[] = [];
  for (let i = 0; i < purchaseIds.length; i += 100) {
    rows.push(...await readAllRows((start, end) => supabase.from('purchase_items').select('*')
      .in('purchase_id', purchaseIds.slice(i, i + 100)).order('id').range(start, end)) as PurchaseItem[]);
  }
  return rows;
}

/** 매입 건별 품목 수 (목록에서 "N개 품목" 표시용) */
/** 매입 품목 수량/단가 수정 — 재고 델타 반영 + last_price 갱신 + 매입 합계 재계산 (원자적, RPC) */
export async function updatePurchaseItem(
  itemId: string,
  quantity: number,
  unitPrice: number,
): Promise<{ refreshFailed: boolean }> {
  const { error } = await supabase.rpc('update_purchase_item', {
    p_item_id: itemId,
    p_quantity: quantity,
    p_unit_price: unitPrice,
  });
  if (error) throw new Error(error.message);
  try { await invalidateCachedStore(); return { refreshFailed: false }; }
  catch { return { refreshFailed: true }; }
}

function monthRange(yearMonth: string): { from: string; to: string } {
  const lastDay = new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)), 0).getDate();
  return { from: `${yearMonth}-01`, to: `${yearMonth}-${String(lastDay).padStart(2, '0')}` };
}

function readMonthPurchases<T>(storeId: string, yearMonth: string, columns: string): Promise<T[]> {
  const { from, to } = monthRange(yearMonth);
  return readAllRows<T>((start, end) => supabase
    .from('purchases')
    .select(columns)
    .eq('store_id', storeId)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false }).order('id').range(start, end) as unknown as PromiseLike<{ data: T[] | null; error: unknown }>);
}

export async function getPurchasesByMonth(
  storeId: string,
  yearMonth: string, // 'YYYY-MM'
): Promise<Purchase[]> {
  return readMonthPurchases<Purchase>(storeId, yearMonth, '*,category_amounts');
}

/** 매입 탭 목록용: 품목 수를 같은 조회에서 받아 별도 개수 조회를 하지 않는다. */
export async function getPurchasesWithItemCountsByMonth(storeId: string, yearMonth: string): Promise<Purchase[]> {
  type Row = Purchase & { purchase_items?: { count: number }[] | null };
  const rows = await readMonthPurchases<Row>(storeId, yearMonth, '*,category_amounts,purchase_items(count)');
  return rows.map(({ purchase_items, ...purchase }) => ({ ...purchase, item_count: Number(purchase_items?.[0]?.count ?? 0) }));
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
  await invalidateCachedStore(data.store_id);
  return row as Purchase;
}

export async function deletePurchase(id: string): Promise<void> {
  await discardParentEvidence('purchase', id);
  const { count, error } = await supabase.from('purchases').delete({ count: 'exact' }).eq('id', id);
  if (error) throw new Error(error.message);
  if (count !== 1) throw new UserFacingError('삭제를 확인하지 못했어요. 목록을 새로고침해주세요.');
  await invalidateCachedStore();
}

export async function getPurchasesTotalByMonth(
  storeId: string,
  yearMonth: string,
): Promise<number> {
  const items = await getPurchasesByMonth(storeId, yearMonth);
  return items.reduce((sum, p) => sum + p.amount, 0);
}

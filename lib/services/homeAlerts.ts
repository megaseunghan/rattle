import { supabase } from '../supabase';
import { HomeAlert, Ingredient } from '../../types';

type StockItem = Pick<Ingredient, 'id' | 'name' | 'current_stock' | 'min_stock' | 'unit' | 'updated_at'>;

export function buildHomeAlerts(input: {
  stock: StockItem[]; now: Date; fixedExpenseMissing?: boolean; tossNotSynced?: boolean;
}): HomeAlert[] {
  const month = `${input.now.getFullYear()}-${String(input.now.getMonth() + 1).padStart(2, '0')}`;
  const date = `${month}-${String(input.now.getDate()).padStart(2, '0')}`;
  const alerts: HomeAlert[] = input.stock
    .filter(item => item.current_stock <= 0 || (item.min_stock > 0 && item.current_stock <= item.min_stock))
    .map(item => ({
      key: `stock:${item.id}:${item.updated_at}`,
      kind: 'stock',
      message: item.current_stock <= 0
        ? `${item.name} · 현재 품절 상태를 확인해 주세요`
        : `${item.name} · ${item.current_stock}${item.unit} 남았어요`,
      actionLabel: '재고 확인', route: `/stock/${item.id}`,
    }));
  if (input.fixedExpenseMissing) alerts.push({ key: `fixedExpenseMissing:${month}`, kind: 'fixedExpenseMissing',
    message: `${input.now.getMonth() + 1}월 고정비가 아직 등록되지 않았어요`, actionLabel: '등록하기', route: '/expenses' });
  if (input.tossNotSynced) alerts.push({ key: `tossNotSynced:${date}`, kind: 'tossNotSynced',
    message: '오늘 토스 매출 동기화 상태를 확인해 주세요', actionLabel: '동기화', route: '/settings/pos-sync' });
  const daysLeft = new Date(input.now.getFullYear(), input.now.getMonth() + 1, 0).getDate() - input.now.getDate();
  if (input.fixedExpenseMissing !== undefined && daysLeft <= 3) alerts.push({ key: `monthClose:${date}`, kind: 'monthClose',
    message: daysLeft === 0 ? '오늘이 월마감일이에요' : `월마감까지 ${daysLeft}일 남았어요`, actionLabel: '손익 확인', route: '/profit-loss' });
  return alerts;
}

export async function getHomeAlertStock(storeId: string): Promise<StockItem[]> {
  const items: StockItem[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase.from('ingredients')
      .select('id,name,current_stock,min_stock,unit,updated_at').eq('store_id', storeId)
      .or('current_stock.lte.0,is_low_stock.eq.true').order('id')
      .range(page * 500, page * 500 + 499);
    if (error) throw new Error(error.message);
    items.push(...(data ?? []));
    if (!data || data.length < 500) return items;
  }
}

export async function hasMonthlyFixedExpense(storeId: string, yearMonth: string): Promise<boolean> {
  const { data, error } = await supabase.from('expenses').select('id').eq('store_id', storeId)
    .eq('year_month', yearMonth).eq('category', '고정비').limit(1);
  if (error) throw new Error(error.message);
  return !!data?.length;
}

export async function getHomeAlertReads(storeId: string, userId: string, keys: string[]): Promise<string[]> {
  if (keys.length === 0) return [];
  const result: string[] = [];
  for (let offset = 0; offset < keys.length; offset += 100) {
    const { data, error } = await supabase.from('home_alert_reads').select('alert_key')
      .eq('store_id', storeId).eq('user_id', userId).in('alert_key', keys.slice(offset, offset + 100));
    if (error) throw new Error(error.message);
    result.push(...(data ?? []).map(row => row.alert_key));
  }
  return result;
}

export async function markHomeAlertRead(storeId: string, userId: string, key: string): Promise<void> {
  const { error } = await supabase.from('home_alert_reads').upsert({ store_id: storeId, user_id: userId, alert_key: key },
    { onConflict: 'store_id,user_id,alert_key', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

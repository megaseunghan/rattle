import { supabase } from '../supabase';
import { DailySummary, DailyItem } from '../../types';

/** Business dates are Korean dates regardless of device timezone. Half-open [from,to). */
export function getBusinessDayRange(date: string, closingTime: string): { from: string; to: string } {
  const from = new Date(`${date}T${closingTime.slice(0, 5)}:00+09:00`);
  return { from: from.toISOString(), to: new Date(from.getTime() + 86_400_000).toISOString() };
}
export function getAutoSyncRange(closingTime: string): { from: string; to: string } {
  const now = new Date();
  const date = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  let { from } = getBusinessDayRange(date, closingTime);
  if (new Date(from) > now) from = new Date(new Date(from).getTime() - 86_400_000).toISOString();
  return { from, to: now.toISOString() };
}
export async function getDailySummaries(storeId: string, closingTime: string, days = 14, offsetDays = 0): Promise<DailySummary[]> {
  const current = getAutoSyncRange(closingTime);
  const to = offsetDays > 0 ? new Date(new Date(current.from).getTime() - (offsetDays - 1) * 86_400_000) : new Date(current.to);
  const from = new Date(new Date(current.from).getTime() - (offsetDays + days - 1) * 86_400_000);
  return getDailySummariesByRange(storeId, closingTime, from, to);
}
export async function getDailySummariesByRange(storeId: string, _closingTime: string, from: Date, to: Date): Promise<DailySummary[]> {
  const { data, error } = await supabase.rpc('get_pos_daily_summaries', {
    p_store_id: storeId, p_from: from.toISOString(), p_to: to.toISOString(),
  });
  if (error) throw error;
  return (data ?? []).map((row: { date: string; date_from: string; date_to: string; total_amount: number; order_count: number }) => ({
    date: row.date, dateFrom: row.date_from, dateTo: row.date_to,
    totalAmount: Number(row.total_amount), orderCount: Number(row.order_count),
  }));
}
export async function getDailyItems(storeId: string, dateFrom: string, dateTo: string): Promise<DailyItem[]> {
  const { data, error } = await supabase.rpc('get_pos_daily_items', { p_store_id: storeId, p_from: dateFrom, p_to: dateTo });
  if (error) throw error;
  return (data ?? []).map((row: { item_id: string; item_name: string; category_name: string; quantity: number; total_amount: number }) => ({
    itemId: row.item_id, itemName: row.item_name, categoryName: row.category_name,
    quantity: Number(row.quantity), totalAmount: Number(row.total_amount),
  }));
}

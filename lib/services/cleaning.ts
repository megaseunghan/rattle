import { UserFacingError } from '../utils/error';
import { supabase } from '../supabase';
import { CleaningItem, CleaningLog, CleaningSegment } from '../../types';

/** 오픈/마감 항목은 매일, 요일별 항목은 해당 요일에만 적용 */
export function isCleaningItemApplicableToday(item: CleaningItem, todayWeekday: number): boolean {
  return item.segment !== 'weekday' || item.weekday === todayWeekday;
}

export async function listCleaningItems(storeId: string): Promise<CleaningItem[]> {
  const { data, error } = await supabase
    .from('cleaning_items')
    .select('*')
    .eq('store_id', storeId)
    .order('segment', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return data as CleaningItem[];
}

export async function listCleaningLogsByDate(storeId: string, date: string): Promise<CleaningLog[]> {
  const { data, error } = await supabase
    .from('cleaning_logs')
    .select('*')
    .eq('store_id', storeId)
    .eq('date', date);
  if (error) throw new Error(error.message);
  return data as CleaningLog[];
}

export async function checkCleaningItem(
  storeId: string,
  itemId: string,
  date: string,
  checkedByName: string,
): Promise<CleaningLog> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new UserFacingError('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('cleaning_logs')
    .insert({ store_id: storeId, item_id: itemId, date, checked_by: userId, checked_by_name: checkedByName })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CleaningLog;
}

export async function uncheckCleaningItem(itemId: string, date: string): Promise<void> {
  const { error } = await supabase
    .from('cleaning_logs')
    .delete()
    .eq('item_id', itemId)
    .eq('date', date);
  if (error) throw new Error(error.message);
}

export async function addCleaningItem(
  storeId: string,
  segment: CleaningSegment,
  title: string,
  sortOrder: number,
  weekday: number | null = null,
): Promise<CleaningItem> {
  const { data, error } = await supabase
    .from('cleaning_items')
    .insert({ store_id: storeId, segment, title, sort_order: sortOrder, weekday })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CleaningItem;
}

export async function updateCleaningItem(id: string, title: string): Promise<void> {
  const { error } = await supabase.from('cleaning_items').update({ title }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function removeCleaningItem(id: string): Promise<void> {
  const { error } = await supabase.from('cleaning_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function reorderCleaningItems(items: { id: string; sort_order: number }[]): Promise<void> {
  await Promise.all(
    items.map(item => supabase.from('cleaning_items').update({ sort_order: item.sort_order }).eq('id', item.id)),
  );
}

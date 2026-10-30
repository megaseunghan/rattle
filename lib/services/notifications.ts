import { supabase } from '../supabase';
import { AppNotification, NotificationCategory } from '../../types';

export interface NotificationSettingDef {
  key: string;
  group: '재고' | '매출·손익';
  label: string;
  description: string;
  default: boolean;
}

export const NOTIFICATION_SETTING_DEFS: NotificationSettingDef[] = [
  { key: 'stock_low', group: '재고', label: '품절 임박 알림', description: '설정한 안전 수량 이하로 떨어졌을 때', default: true },
  { key: 'stock_reported', group: '재고', label: '품절 보고 알림', description: '직원이 품절 품목을 보고했을 때', default: false },
  { key: 'sales_daily_report', group: '매출·손익', label: '일일 마감 리포트', description: '영업 마감 시각에 그날의 매출·손익 요약', default: true },
  { key: 'sales_margin_drop', group: '매출·손익', label: '마진율 급락 알림', description: '전월 대비 마진율이 5%p 이상 떨어졌을 때', default: false },
];

export async function getNotifications(storeId: string, category?: NotificationCategory, allowFinancial = true): Promise<AppNotification[]> {
  let query = supabase.from('notifications').select('*').eq('store_id', storeId).neq('category', 'attendance').order('created_at', { ascending: false });
  if (!allowFinancial) query = query.neq('category', 'sales').neq('category', 'profit');
  if (category) query = query.eq('category', category);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as AppNotification[];
}

export async function getUnreadCount(storeId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('is_read', false)
    .neq('category', 'attendance');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(storeId: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('store_id', storeId).eq('is_read', false);
  if (error) throw new Error(error.message);
}

export async function getNotificationSettings(storeId: string): Promise<Record<string, boolean>> {
  const { data, error } = await supabase.from('notification_settings').select('setting_key, enabled').eq('store_id', storeId);
  if (error) throw new Error(error.message);
  const map: Record<string, boolean> = {};
  NOTIFICATION_SETTING_DEFS.forEach(d => { map[d.key] = d.default; });
  (data ?? []).forEach((row: any) => { map[row.setting_key] = row.enabled; });
  return map;
}

export async function setNotificationSetting(storeId: string, key: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('notification_settings')
    .upsert({ store_id: storeId, setting_key: key, enabled }, { onConflict: 'store_id,setting_key' });
  if (error) throw new Error(error.message);
}

/** 설정이 켜져 있을 때만, dedupe_key 기준으로 중복 없이 알림 생성. 이미 존재하면 조용히 무시 */
export async function notifyIfEnabled(input: {
  storeId: string;
  settingKey: string;
  category: NotificationCategory;
  type: string;
  title: string;
  message: string;
  dedupeKey: string;
}): Promise<void> {
  const settings = await getNotificationSettings(input.storeId);
  if (!settings[input.settingKey]) return;

  await supabase.from('notifications').upsert(
    {
      store_id: input.storeId,
      category: input.category,
      type: input.type,
      title: input.title,
      message: input.message,
      dedupe_key: input.dedupeKey,
    },
    { onConflict: 'store_id,dedupe_key', ignoreDuplicates: true },
  );
}

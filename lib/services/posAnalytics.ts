import { supabase } from '../supabase';
import { DailySummary, DailyItem } from '../../types';

/** 영업일 날짜 레이블 계산
 * closing_time이 23:00이면 23:00 이후 주문은 다음 날 영업일로 분류
 * getHours()/getMinutes()는 로컬 시간 기준 — closingHour/closingMin과 동일 기준
 */
function getBusinessDateLabel(orderAt: Date, closingHour: number, closingMin: number): string {
  const orderMins = orderAt.getHours() * 60 + orderAt.getMinutes();
  const closingMins = closingHour * 60 + closingMin;

  const label = new Date(orderAt);
  if (orderMins >= closingMins) {
    label.setDate(label.getDate() + 1);
  }
  // 로컬 날짜로 반환 (toISOString()은 UTC 기준이라 KST에서 날짜 오차 발생)
  const y = label.getFullYear();
  const mo = String(label.getMonth() + 1).padStart(2, '0');
  const d = String(label.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/** 특정 날짜의 영업일 범위 반환
 * date 'YYYY-MM-DD' → { from: 전날 closingTime ISO, to: 당일 closingTime ISO }
 */
export function getBusinessDayRange(
  date: string,
  closingTime: string
): { from: string; to: string } {
  const [h, m] = closingTime.split(':').map(Number);

  const to = new Date(date);
  to.setHours(h, m, 0, 0);

  const from = new Date(date);
  from.setDate(from.getDate() - 1);
  from.setHours(h, m, 0, 0);

  return { from: from.toISOString(), to: to.toISOString() };
}

/** 오늘 기준 자동 동기화용 범위: 전날 closingTime ~ 지금 */
export function getAutoSyncRange(closingTime: string): { from: string; to: string } {
  const [h, m] = closingTime.split(':').map(Number);

  const from = new Date();
  from.setDate(from.getDate() - 1);
  from.setHours(h, m, 0, 0);

  return { from: from.toISOString(), to: new Date().toISOString() };
}

/** 최근 N일 영업일 요약 목록 */
export async function getDailySummaries(
  storeId: string,
  closingTime: string,
  days: number = 14
): Promise<DailySummary[]> {
  const [h, m] = closingTime.split(':').map(Number);

  const earliest = new Date();
  earliest.setDate(earliest.getDate() - days);
  earliest.setHours(h, m, 0, 0);

  const { data, error } = await supabase
    .from('toss_orders')
    .select('order_at, total_amount, status')
    .eq('store_id', storeId)
    .eq('status', 'COMPLETED')
    .gte('order_at', earliest.toISOString())
    .order('order_at', { ascending: false });

  if (error) throw new Error(error.message);

  const dayMap = new Map<string, DailySummary>();

  for (const sale of data ?? []) {
    const orderAt = new Date(sale.order_at);
    const dateLabel = getBusinessDateLabel(orderAt, h, m);
    const { from, to } = getBusinessDayRange(dateLabel, closingTime);

    if (!dayMap.has(dateLabel)) {
      dayMap.set(dateLabel, {
        date: dateLabel,
        dateFrom: from,
        dateTo: to,
        totalAmount: 0,
        orderCount: 0,
      });
    }

    const day = dayMap.get(dateLabel)!;
    day.totalAmount += Number(sale.total_amount);
    day.orderCount += 1;
  }

  return Array.from(dayMap.values()).sort((a, b) => b.date.localeCompare(a.date));
}

/** 특정 영업일 범위의 상품별 집계 */
export async function getDailyItems(
  storeId: string,
  dateFrom: string,
  dateTo: string
): Promise<DailyItem[]> {
  // Step 1: 해당 범위의 완료된 주문 ID 조회
  // (PostgREST FK embed 대신 2-step 쿼리로 스키마 캐시 의존성 제거)
  const { data: orders, error: ordersError } = await supabase
    .from('toss_orders')
    .select('id')
    .eq('store_id', storeId)
    .eq('status', 'COMPLETED')
    .gte('order_at', dateFrom)
    .lte('order_at', dateTo);

  if (ordersError) throw new Error(ordersError.message);
  if (!orders || orders.length === 0) return [];

  const orderIds = orders.map(o => o.id);

  // Step 2: 해당 주문의 상세 항목 조회
  const { data, error } = await supabase
    .from('toss_order_items')
    .select('item_id, item_name, quantity, total_price')
    .in('order_id', orderIds);

  if (error) throw new Error(error.message);

  // 카탈로그 정보(카테고리명) 가져오기
  const { data: catalogData } = await supabase
    .from('toss_catalog')
    .select('item_id, category_name')
    .eq('store_id', storeId);

  const catalogMap = new Map<string, string>();
  for (const row of catalogData ?? []) {
    if (row.item_id) catalogMap.set(row.item_id, row.category_name);
  }

  // 상품별 집계 수행
  const itemMap = new Map<string, DailyItem>();

  for (const row of data ?? []) {
    const key = row.item_id || row.item_name;
    if (!itemMap.has(key)) {
      itemMap.set(key, {
        itemId: row.item_id || '',
        itemName: row.item_name,
        categoryName: row.item_id ? (catalogMap.get(row.item_id) ?? '') : '',
        quantity: 0,
        totalAmount: 0,
      });
    }
    const agg = itemMap.get(key)!;
    agg.quantity += Number(row.quantity);
    agg.totalAmount += Number(row.total_price);
  }

  return Array.from(itemMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);
}

import { supabase } from '../supabase';
import { DailySummary, DailyItem } from '../../types';

/** 영업일 날짜 레이블 계산 (토스포스 정산 기준: 마감시간이 하루의 시작)
 * closing_time이 16:00이면 영업일 D = [D 16:00, D+1 16:00).
 * 즉 마감시간 이전 주문은 전날 영업일에 속한다.
 * getHours()/getMinutes()는 로컬 시간 기준 — closingHour/closingMin과 동일 기준
 */
function getBusinessDateLabel(orderAt: Date, closingHour: number, closingMin: number): string {
  const orderMins = orderAt.getHours() * 60 + orderAt.getMinutes();
  const closingMins = closingHour * 60 + closingMin;

  const label = new Date(orderAt);
  // 마감시간 이전 주문은 전날 영업일에 포함
  if (orderMins < closingMins) {
    label.setDate(label.getDate() - 1);
  }
  // 로컬 날짜로 반환 (toISOString()은 UTC 기준이라 KST에서 날짜 오차 발생)
  const y = label.getFullYear();
  const mo = String(label.getMonth() + 1).padStart(2, '0');
  const d = String(label.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/** 특정 날짜의 영업일 범위 반환 (토스 기준: 마감시간이 하루의 시작)
 * date 'YYYY-MM-DD' → { from: 당일 closingTime ISO, to: 익일 closingTime ISO }
 */
export function getBusinessDayRange(
  date: string,
  closingTime: string
): { from: string; to: string } {
  const [h, m] = closingTime.split(':').map(Number);

  const from = new Date(date);
  from.setHours(h, m, 0, 0);

  const to = new Date(date);
  to.setDate(to.getDate() + 1);
  to.setHours(h, m, 0, 0);

  return { from: from.toISOString(), to: to.toISOString() };
}

/** 현재 영업일 자동 동기화용 범위: 현재 영업일 시작(직전 마감시간) ~ 지금
 * (토스 기준이므로 지금이 마감 이후면 오늘 마감시간, 이전이면 어제 마감시간이 시작)
 */
export function getAutoSyncRange(closingTime: string): { from: string; to: string } {
  const [h, m] = closingTime.split(':').map(Number);

  const now = new Date();
  const from = new Date(now);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) {
    from.setDate(from.getDate() - 1);
  }
  from.setHours(h, m, 0, 0);

  return { from: from.toISOString(), to: now.toISOString() };
}

/** 최근 N일 영업일 요약 목록
 * @param offsetDays 페이지네이션용 일 오프셋 (0 = 가장 최근, 14 = 14~28일 전 등)
 */
export async function getDailySummaries(
  storeId: string,
  closingTime: string,
  days: number = 14,
  offsetDays: number = 0
): Promise<DailySummary[]> {
  const [h, m] = closingTime.split(':').map(Number);

  // 상한: 페이지 0은 지금까지(진행 중인 영업일 포함), 과거 페이지는 마감 경계로 스냅
  const latest = new Date();
  if (offsetDays > 0) {
    latest.setDate(latest.getDate() - offsetDays);
    latest.setHours(h, m, 0, 0);
  }

  const earliest = new Date(latest);
  earliest.setDate(earliest.getDate() - days);
  earliest.setHours(h, m, 0, 0);

  const { data, error } = await supabase
    .from('toss_orders')
    .select('order_at, total_amount, status')
    .eq('store_id', storeId)
    .eq('status', 'COMPLETED')
    .gte('order_at', earliest.toISOString())
    .lte('order_at', latest.toISOString())
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

/** 특정 날짜 범위의 영업일 요약 목록 (월별 조회용) */
export async function getDailySummariesByRange(
  storeId: string,
  closingTime: string,
  from: Date,
  to: Date
): Promise<DailySummary[]> {
  const [h, m] = closingTime.split(':').map(Number);

  const { data, error } = await supabase
    .from('toss_orders')
    .select('order_at, total_amount, status')
    .eq('store_id', storeId)
    .eq('status', 'COMPLETED')
    .gte('order_at', from.toISOString())
    .lte('order_at', to.toISOString())
    .order('order_at', { ascending: false });

  if (error) throw new Error(error.message);

  const dayMap = new Map<string, DailySummary>();
  for (const sale of data ?? []) {
    const orderAt = new Date(sale.order_at);
    const dateLabel = getBusinessDateLabel(orderAt, h, m);
    const { from: dayFrom, to: dayTo } = getBusinessDayRange(dateLabel, closingTime);

    if (!dayMap.has(dateLabel)) {
      dayMap.set(dateLabel, {
        date: dateLabel,
        dateFrom: dayFrom,
        dateTo: dayTo,
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

import { supabase } from '../supabase';
import { TossOrder, TossCatalogItem } from '../../types';

async function tossProxyRequest<T>(path: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('toss-proxy', {
    body: { path },
  });

  if (error) throw new Error(error.message ?? 'Toss Place API 오류');
  return data as T;
}

export async function fetchTossOrders(
  merchantId: string,
  dateFrom: string,
  dateTo: string,
): Promise<TossOrder[]> {
  const params = new URLSearchParams({ dateFrom, dateTo });
  const data = await tossProxyRequest<unknown>(
    `/merchants/${merchantId}/order/orders?${params}`,
  );
  if (!data) throw new Error('Toss Place API 응답이 없습니다');

  if (__DEV__) {
    console.log('[TossOrders] 응답 최상위 키:', Object.keys(data as object));
  }

  // 배열 직접 반환
  if (Array.isArray(data)) return data as TossOrder[];

  const d = data as Record<string, unknown>;

  // 가능한 응답 구조 순차 탐색
  const nested = d.data;
  if (Array.isArray(nested)) return nested as TossOrder[];
  if (nested && typeof nested === 'object') {
    const nd = nested as Record<string, unknown>;
    const inner = nd.orders ?? nd.content ?? nd.items ?? nd.results;
    if (Array.isArray(inner)) return inner as TossOrder[];
  }

  const flat = d.success ?? d.orders ?? d.content ?? d.items ?? d.results;
  if (Array.isArray(flat)) return normalizeTossOrders(flat);

  if (__DEV__) {
    console.warn('[TossOrders] 알 수 없는 응답 구조:', JSON.stringify(data).slice(0, 300));
  }
  return [];
}

function normalizeTossOrders(raw: unknown[]): TossOrder[] {
  return raw.map((o: any) => ({
    orderId:     o.orderId     ?? o.id          ?? '',
    orderAt:     o.orderAt     ?? o.createdAt   ?? o.openedAt ?? '',
    totalAmount: o.totalAmount ?? o.totalOrderAmount ?? o.totalPrice ?? 0,
    status:      normalizeOrderStatus(o.status  ?? o.orderState ?? ''),
    items:       normalizeOrderItems(o.items    ?? o.orderItems ?? o.menuItems ?? []),
  }));
}

function normalizeOrderStatus(raw: string): TossOrder['status'] {
  if (raw === 'COMPLETED' || raw === 'CANCELLED' || raw === 'REFUNDED') return raw;
  if (raw === 'CANCELED') return 'CANCELLED';
  return 'COMPLETED';
}

function normalizeOrderItems(raw: unknown[]): TossOrder['items'] {
  return raw.map((i: any) => ({
    itemId:     i.itemId    ?? i.id       ?? '',
    itemName:   i.itemName  ?? i.name     ?? i.title ?? '',
    quantity:   i.quantity  ?? i.qty      ?? 1,
    unitPrice:  i.unitPrice ?? i.price    ?? 0,
    totalPrice: i.totalPrice ?? (i.unitPrice ?? i.price ?? 0) * (i.quantity ?? i.qty ?? 1),
  }));
}

export async function fetchTossCatalog(merchantId: string): Promise<TossCatalogItem[]> {
  const data = await tossProxyRequest<unknown>(
    `/merchants/${merchantId}/catalog/items`,
  );
  if (!data) throw new Error('Toss Place API 응답이 없습니다');

  // 배열 직접 응답 또는 래핑된 응답 처리
  let list: unknown[];
  if (Array.isArray(data)) {
    list = data;
  } else {
    const wrapped = data as Record<string, unknown>;
    // 가능한 모든 필드 확인 (items, content, data, results)
    const raw = wrapped.items ?? wrapped.content ?? wrapped.data ?? wrapped.results ?? [];
    list = Array.isArray(raw) ? raw : [];
  }

  return list.map((item: any) => {
    // 가격 정보 추출 (객체 형태인 경우 priceValue, 아니면 숫자)
    let price = 0;
    if (typeof item.price === 'object' && item.price !== null) {
      price = item.price.priceValue ?? 0;
    } else if (typeof item.price === 'number') {
      price = item.price;
    } else if (typeof item.price === 'string') {
      price = parseInt(item.price, 10) || 0;
    }

    return {
      itemId: item.id ?? item.itemId ?? '',
      itemName: item.title ?? item.itemName ?? '',
      categoryName: item.categoryName ?? item.category?.name ?? '',
      price: price,
      isAvailable: item.isAvailable ?? item.isActive ?? true,
    };
  });
}

export async function saveCatalog(
  storeId: string,
  items: TossCatalogItem[]
): Promise<void> {
  if (items.length === 0) return;

  const rows = items.map(item => ({
    store_id: storeId,
    item_id: item.itemId,
    item_name: item.itemName,
    category_name: item.categoryName,
    price: item.price,
    is_available: item.isAvailable,
    synced_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('toss_catalog')
    .upsert(rows, { onConflict: 'store_id,item_id' });

  if (error) throw new Error(error.message);
}

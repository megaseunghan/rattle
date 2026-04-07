import { supabase } from '../supabase';
import { TossOrder, TossCatalogItem } from '../../types';

async function tossProxyRequest<T>(path: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('toss-proxy', {
    body: { path },
  });

  if (error) throw new Error(error.message ?? 'Toss Place API 오류');
  return data as T;
}

/** 개별 주문 상세 정보 가져오기 (항목 정보 누락 시 사용) */
export async function fetchTossOrderDetail(
  merchantId: string,
  orderId: string,
): Promise<TossOrder | null> {
  try {
    const data = await tossProxyRequest<any>(
      `/merchants/${merchantId}/order/orders/${orderId}`,
    );
    if (!data) return null;
    
    // 개별 상세 응답도 목록 응답과 유사하게 노멀라이즈
    return {
      orderId:     data.orderId     ?? data.id          ?? orderId,
      orderAt:     data.orderAt     ?? data.createdAt   ?? data.openedAt ?? '',
      totalAmount: data.totalAmount ?? data.totalOrderAmount ?? data.totalPrice ?? 0,
      status:      normalizeOrderStatus(data.status  ?? data.orderState ?? ''),
      items:       normalizeOrderItems(data.items    ?? data.orderItems ?? data.menuItems ?? []),
    };
  } catch (e) {
    console.error(`[TossOrderDetail] 주문 상세 조회 실패 (${orderId}):`, e);
    return null;
  }
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
    console.log('[TossOrders] 응답 데이터 확인');
  }

  let rawOrders: any[] = [];
  if (Array.isArray(data)) {
    rawOrders = data;
  } else {
    const d = data as Record<string, unknown>;
    const list = d.data ?? d.success ?? d.orders ?? d.content ?? d.items ?? d.results;
    if (Array.isArray(list)) rawOrders = list;
  }

  if (rawOrders.length === 0) return [];

  const orders = normalizeTossOrders(rawOrders);

  // 주문 항목(items)이 비어있는 경우 상세 조회를 통해 채워넣기
  const processedOrders = await Promise.all(
    orders.map(async (order) => {
      if (order.items.length === 0 && order.status === 'COMPLETED') {
        const detail = await fetchTossOrderDetail(merchantId, order.orderId);
        if (detail && detail.items.length > 0) {
          return detail;
        }
      }
      return order;
    })
  );

  return processedOrders;
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
  const s = String(raw).toUpperCase();
  if (s === 'COMPLETED' || s === 'SUCCESS' || s === 'PAID') return 'COMPLETED';
  if (s.includes('CANCEL') || s.includes('VOID')) return 'CANCELLED';
  if (s.includes('REFUND')) return 'REFUNDED';
  return 'COMPLETED';
}

function normalizeOrderItems(raw: unknown[]): TossOrder['items'] {
  if (!Array.isArray(raw)) return [];
  return raw.map((i: any) => ({
    itemId:     i.itemId    ?? i.id       ?? '',
    itemName:   i.itemName  ?? i.name     ?? i.title ?? '',
    quantity:   Number(i.quantity ?? i.qty ?? 1),
    unitPrice:  Number(i.unitPrice ?? i.price ?? 0),
    totalPrice: Number(i.totalPrice ?? (i.unitPrice ?? i.price ?? 0) * (i.quantity ?? i.qty ?? 1)),
  }));
}

export async function fetchTossCatalog(merchantId: string): Promise<TossCatalogItem[]> {
  const data = await tossProxyRequest<unknown>(
    `/merchants/${merchantId}/catalog/items`,
  );
  if (!data) throw new Error('Toss Place API 응답이 없습니다');

  let list: unknown[];
  if (Array.isArray(data)) {
    list = data;
  } else {
    const wrapped = data as Record<string, unknown>;
    const raw = wrapped.items ?? wrapped.content ?? wrapped.data ?? wrapped.results ?? [];
    list = Array.isArray(raw) ? raw : [];
  }

  return list.map((item: any) => {
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

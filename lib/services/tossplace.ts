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
    const detailItems = normalizeOrderItems(data.lineItems ?? data.items ?? data.orderItems ?? data.menuItems ?? []);
    const rawTotal = (() => {
      if (data.chargePrice) {
        const t = Number(data.chargePrice.totalAmount ?? 0);
        if (t > 0) return t;
        return Number(data.chargePrice.listPrice ?? 0) + Number(data.chargePrice.discountAmount ?? 0);
      }
      return Number(data.totalAmount ?? data.totalOrderAmount ?? data.totalPrice ?? data.totalOrderPrice ?? data.amount ?? 0);
    })();
    const detailTotal = rawTotal || detailItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const { cardAmount, cashAmount } = parsePaymentAmounts(data, detailTotal);
    return {
      orderId:     data.orderId     ?? data.id          ?? orderId,
      orderAt:     data.orderAt     ?? data.createdAt   ?? data.openedAt ?? '',
      totalAmount: detailTotal,
      cardAmount,
      cashAmount,
      status:      normalizeOrderStatus(data.status  ?? data.orderState ?? ''),
      items:       detailItems,
    };
  } catch (e) {
    console.error(`[TossOrderDetail] 주문 상세 조회 실패 (${orderId}):`, e);
    return null;
  }
}

const ORDER_PAGE_SIZE = 100;

export async function fetchTossOrders(
  merchantId: string,
  dateFrom: string,
  dateTo: string,
): Promise<TossOrder[]> {
  const allOrders: TossOrder[] = [];
  let page = 1;

  while (true) {
    const params = new URLSearchParams({
      from: dateFrom,
      to: dateTo,
      page: String(page),
      size: String(ORDER_PAGE_SIZE),
    });
    const data = await tossProxyRequest<unknown>(
      `/merchants/${merchantId}/order/orders?${params}`,
    );
    if (!data) throw new Error('Toss Place API 응답이 없습니다');

    let rawOrders: any[] = [];
    let isLast = false;

    if (Array.isArray(data)) {
      rawOrders = data;
      isLast = rawOrders.length < ORDER_PAGE_SIZE;
    } else {
      const d = data as Record<string, unknown>;
      const list = d.data ?? d.success ?? d.orders ?? d.content ?? d.items ?? d.results;
      if (Array.isArray(list)) rawOrders = list;
      // last/hasNext 필드 또는 데이터 수로 마지막 페이지 감지
      isLast = d.last === true || d.hasNext === false || rawOrders.length < ORDER_PAGE_SIZE;
    }

    if (rawOrders.length === 0) break;

    const orders = normalizeTossOrders(rawOrders);

    // 주문 항목(items)이 비어있는 경우 상세 조회를 통해 채워넣기
    const processedOrders = await Promise.all(
      orders.map(async (order) => {
        if (order.items.length === 0 && order.status === 'COMPLETED') {
          const detail = await fetchTossOrderDetail(merchantId, order.orderId);
          if (detail && detail.items.length > 0) return detail;
        }
        return order;
      })
    );

    allOrders.push(...processedOrders);

    if (isLast) break;
    page++;
  }

  return allOrders;
}

const CASH_TYPES = new Set(['CASH', 'ACCOUNT_TRANSFER']);

function parsePaymentAmounts(o: any, totalAmount: number): { cardAmount: number; cashAmount: number } {
  const sources: any[] = o.paymentSources ?? o.payments ?? o.paymentSource ?? [];
  if (!Array.isArray(sources) || sources.length === 0) {
    return { cardAmount: totalAmount, cashAmount: 0 };
  }
  let cash = 0;
  let card = 0;
  for (const s of sources) {
    const type = String(s.paymentSourceType ?? s.type ?? '').toUpperCase();
    const amount = Number(s.amount ?? s.price ?? 0);
    if (CASH_TYPES.has(type)) cash += amount;
    else card += amount;
  }
  return { cardAmount: card, cashAmount: cash };
}

function normalizeTossOrders(raw: unknown[]): TossOrder[] {
  return raw.map((o: any) => {
    const items = normalizeOrderItems(o.lineItems ?? o.items ?? o.orderItems ?? o.menuItems ?? []);
    const rawTotal = (() => {
      if (o.chargePrice) {
        const t = Number(o.chargePrice.totalAmount ?? 0);
        if (t > 0) return t;
        return Number(o.chargePrice.listPrice ?? 0) + Number(o.chargePrice.discountAmount ?? 0);
      }
      return Number(o.totalAmount ?? o.totalOrderAmount ?? o.totalPrice ?? o.totalOrderPrice ?? o.amount ?? 0);
    })();
    const totalAmount = o.chargePrice != null
      ? rawTotal
      : (rawTotal || items.reduce((sum, item) => sum + item.totalPrice, 0));
    const { cardAmount, cashAmount } = parsePaymentAmounts(o, totalAmount);
    return {
      orderId:     o.orderId     ?? o.id          ?? '',
      orderAt:     o.orderAt     ?? o.createdAt   ?? o.openedAt ?? '',
      totalAmount,
      cardAmount,
      cashAmount,
      status:      normalizeOrderStatus(o.status  ?? o.orderState ?? ''),
      items,
    };
  });
}

function normalizeOrderStatus(raw: string): TossOrder['status'] {
  const s = String(raw).toUpperCase();
  if (s === 'COMPLETED' || s === 'SUCCESS' || s === 'PAID') return 'COMPLETED';
  if (s.includes('CANCEL') || s.includes('VOID') || s === 'OPEN' || s === 'PARTIAL_CANCEL') return 'CANCELLED';
  if (s.includes('REFUND')) return 'REFUNDED';
  return 'CANCELLED';
}

function normalizeOrderItems(raw: unknown[]): TossOrder['items'] {
  if (!Array.isArray(raw)) return [];
  return raw.map((i: any) => {
    // OrderLineItem 구조: item(OrderItem), quantity, optionChoices, itemPrice
    const orderItem = i.item;
    const itemName = orderItem?.title ?? i.itemName ?? i.name ?? i.title ?? '';
    const itemId   = orderItem?.code  ?? i.itemId   ?? i.id   ?? '';
    const categoryName = orderItem?.category?.title ?? i.categoryName ?? '';

    const unitPrice  = Number(i.itemPrice?.priceValue ?? i.unitPrice ?? i.price ?? 0);
    const quantity   = Number(i.quantity ?? i.qty ?? 1);
    const totalPrice = Number(i.totalPrice ?? unitPrice * quantity);

    const optionChoices = Array.isArray(i.optionChoices)
      ? i.optionChoices.map((o: any) => ({
          title:      o.title      ?? '',
          code:       o.code,
          priceValue: Number(o.priceValue ?? 0),
          quantity:   Number(o.quantity   ?? 1),
        }))
      : [];

    return { itemId, itemName, categoryName, quantity, unitPrice, totalPrice, optionChoices };
  });
}

const CATALOG_PAGE_SIZE = 100;

function normalizeCatalogPage(data: unknown): TossCatalogItem[] {
  let list: unknown[];
  if (Array.isArray(data)) {
    list = data;
  } else {
    const wrapped = data as Record<string, unknown>;
    const raw = wrapped.success ?? wrapped.items ?? wrapped.content ?? wrapped.data ?? wrapped.results ?? [];
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
      price,
      isAvailable: item.isAvailable ?? item.isActive ?? true,
    };
  });
}

export async function fetchTossCatalog(merchantId: string): Promise<TossCatalogItem[]> {
  const allItems: TossCatalogItem[] = [];
  let page = 1;

  while (true) {
    const params = new URLSearchParams({ page: String(page), size: String(CATALOG_PAGE_SIZE) });
    const data = await tossProxyRequest<unknown>(
      `/merchants/${merchantId}/catalog/items?${params}`,
    );
    if (!data) throw new Error('Toss Place API 응답이 없습니다');

    const items = normalizeCatalogPage(data);

    allItems.push(...items);

    // 마지막 페이지이면 종료
    if (items.length < CATALOG_PAGE_SIZE) break;
    page++;
  }

  return allItems;
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

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
  const data = await tossProxyRequest<Record<string, unknown>>(
    `/merchants/${merchantId}/order/orders?${params}`,
  );
  if (!data) throw new Error('Toss Place API 응답이 없습니다');
  const list = data.orders ?? data.content ?? [];
  if (!Array.isArray(list)) return [];
  return list as TossOrder[];
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

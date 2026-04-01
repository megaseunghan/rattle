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
  const data = await tossProxyRequest<{ orders: TossOrder[] }>(
    `/merchants/${merchantId}/order/orders?${params}`,
  );
  return data.orders ?? [];
}

export async function fetchTossCatalog(merchantId: string): Promise<TossCatalogItem[]> {
  const data = await tossProxyRequest<{ items: TossCatalogItem[] }>(
    `/merchants/${merchantId}/catalog/items`,
  );
  return data.items ?? [];
}

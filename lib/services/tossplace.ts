import { TossOrder, TossCatalogItem } from '../../types';

const TOSS_BASE_URL = 'https://api.tossplace.com/api-public/openapi/v1';
const ACCESS_KEY = process.env.EXPO_PUBLIC_TOSS_ACCESS_KEY ?? '';
const ACCESS_SECRET = process.env.EXPO_PUBLIC_TOSS_ACCESS_SECRET ?? '';

async function tossRequest<T>(path: string): Promise<T> {
  const response = await fetch(`${TOSS_BASE_URL}${path}`, {
    headers: {
      'x-access-key': ACCESS_KEY,
      'x-secret-key': ACCESS_SECRET,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.message ?? `Toss Place API 오류: ${response.status}`);
  }

  return response.json();
}

export async function fetchTossOrders(
  merchantId: string,
  dateFrom: string,
  dateTo: string,
): Promise<TossOrder[]> {
  const params = new URLSearchParams({ dateFrom, dateTo });
  const data = await tossRequest<{ orders: TossOrder[] }>(
    `/merchants/${merchantId}/order/orders?${params}`,
  );
  return data.orders ?? [];
}

export async function fetchTossCatalog(merchantId: string): Promise<TossCatalogItem[]> {
  const data = await tossRequest<{ items: TossCatalogItem[] }>(
    `/merchants/${merchantId}/catalog/items`,
  );
  return data.items ?? [];
}

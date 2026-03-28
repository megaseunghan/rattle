import { TossOrder, TossCatalogItem } from '../../types';

// 사업자번호 등록 후 false로 변경
const TOSS_USE_MOCK = true;

const TOSS_BASE_URL = 'https://api.tossplace.com/api-public/openapi/v1';

// ─── Mock 데이터 ──────────────────────────────────────────────
const MOCK_ORDERS: TossOrder[] = [
  {
    orderId: 'mock-order-001',
    orderAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    totalAmount: 45000,
    status: 'COMPLETED',
    items: [
      { itemId: 'item-1', itemName: '아메리카노', quantity: 2, unitPrice: 4500, totalPrice: 9000 },
      { itemId: 'item-2', itemName: '카페라떼', quantity: 2, unitPrice: 5500, totalPrice: 11000 },
      { itemId: 'item-3', itemName: '치즈케이크', quantity: 1, unitPrice: 7500, totalPrice: 7500 },
    ],
  },
  {
    orderId: 'mock-order-002',
    orderAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    totalAmount: 13000,
    status: 'COMPLETED',
    items: [
      { itemId: 'item-1', itemName: '아메리카노', quantity: 1, unitPrice: 4500, totalPrice: 4500 },
      { itemId: 'item-4', itemName: '바닐라라떼', quantity: 1, unitPrice: 6000, totalPrice: 6000 },
    ],
  },
  {
    orderId: 'mock-order-003',
    orderAt: new Date(Date.now() - 1000 * 60 * 150).toISOString(),
    totalAmount: 9000,
    status: 'CANCELLED',
    items: [
      { itemId: 'item-2', itemName: '카페라떼', quantity: 1, unitPrice: 5500, totalPrice: 5500 },
      { itemId: 'item-3', itemName: '치즈케이크', quantity: 1, unitPrice: 7500, totalPrice: 7500 },
    ],
  },
];

const MOCK_CATALOG: TossCatalogItem[] = [
  { itemId: 'item-1', itemName: '아메리카노', categoryName: '커피', price: 4500, isAvailable: true },
  { itemId: 'item-2', itemName: '카페라떼', categoryName: '커피', price: 5500, isAvailable: true },
  { itemId: 'item-3', itemName: '치즈케이크', categoryName: '디저트', price: 7500, isAvailable: true },
  { itemId: 'item-4', itemName: '바닐라라떼', categoryName: '커피', price: 6000, isAvailable: true },
  { itemId: 'item-5', itemName: '녹차라떼', categoryName: '논커피', price: 5500, isAvailable: false },
];

// ─── 실제 API 호출 ────────────────────────────────────────────
async function tossRequest<T>(
  path: string,
  accessKey: string,
  secretKey: string,
): Promise<T> {
  const response = await fetch(`${TOSS_BASE_URL}${path}`, {
    headers: {
      'x-access-key': accessKey,
      'x-secret-key': secretKey,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.message ?? `Toss Place API 오류: ${response.status}`);
  }

  return response.json();
}

// ─── 공개 API ────────────────────────────────────────────────
export async function fetchTossOrders(
  merchantId: string,
  accessKey: string,
  secretKey: string,
  dateFrom: string,
  dateTo: string,
): Promise<TossOrder[]> {
  if (TOSS_USE_MOCK) {
    await new Promise(r => setTimeout(r, 600)); // 네트워크 지연 시뮬레이션
    return MOCK_ORDERS;
  }

  const params = new URLSearchParams({ dateFrom, dateTo });
  const data = await tossRequest<{ orders: TossOrder[] }>(
    `/merchants/${merchantId}/order/orders?${params}`,
    accessKey,
    secretKey,
  );
  return data.orders ?? [];
}

export async function fetchTossCatalog(
  merchantId: string,
  accessKey: string,
  secretKey: string,
): Promise<TossCatalogItem[]> {
  if (TOSS_USE_MOCK) {
    await new Promise(r => setTimeout(r, 400));
    return MOCK_CATALOG;
  }

  const data = await tossRequest<{ items: TossCatalogItem[] }>(
    `/merchants/${merchantId}/catalog/items`,
    accessKey,
    secretKey,
  );
  return data.items ?? [];
}

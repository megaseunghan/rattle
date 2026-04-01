// 매장
export interface Store {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  // Toss Place 가맹점 신청 정보
  business_number?: string | null;
  owner_phone?: string | null;
  address?: string | null;
  toss_merchant_id?: string | null;
}

// 발주
export interface Order {
  id: string;
  store_id: string;
  supplier_name: string;
  order_date: string;
  total_amount: number;
  status: 'pending' | 'confirmed' | 'delivered';
  created_at: string;
}

// 발주 항목
export interface OrderItem {
  id: string;
  order_id: string;
  ingredient_id: string;
  quantity: number;
  unit: string;
  unit_price: number;
  subtotal: number;
}

// 재고 (식자재)
export interface Ingredient {
  id: string;
  store_id: string;
  name: string;
  category: string;
  current_stock: number;
  unit: string;
  min_stock: number;  // 품절 임박 기준
  last_price: number;
  container_unit: string | null;
  container_size: number | null;
  supplier_name: string | null;
  updated_at: string;
  created_at: string;
}

// 레시피
export interface Recipe {
  id: string;
  store_id: string;
  name: string;
  category: string;
  selling_price: number;
  cost: number;         // 자동 계산
  margin_rate: number;  // 자동 계산
  created_at: string;
}

// 레시피 재료
export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
  unit: string;
}

// OCR 결과
export interface OcrResult {
  id: string;
  store_id: string;
  image_url: string;
  raw_text: string;
  parsed_items: OcrParsedItem[];
  status: 'processing' | 'completed' | 'failed';
  created_at: string;
}

export interface OcrParsedItem {
  name: string;
  quantity: number;
  unit: string;
  price: number;
}

// Toss Place POS 연동
export interface TossOrderItem {
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface TossOrder {
  orderId: string;
  orderAt: string;
  totalAmount: number;
  status: 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
  items: TossOrderItem[];
}

export interface TossCatalogItem {
  itemId: string;
  itemName: string;
  categoryName: string;
  price: number;
  isAvailable: boolean;
}

export interface TossSale {
  id: string;
  store_id: string;
  toss_order_id: string;
  order_at: string;
  total_amount: number;
  status: 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
  items: TossOrderItem[];
  synced_at: string;
}

// OCR 라인 아이템 (리뷰 화면용)
export interface OcrLineItem {
  raw: string;                          // Gemini 응답 원본 아이템 (JSON.stringify된 문자열)
  name: string;                         // 파싱된 품목명
  quantity: number;
  unit: string;
  unit_price: number;
  confidence: 'high' | 'low';           // low = 주황색 하이라이트
  matched_ingredient: Ingredient | null; // 재고 자동 매칭 결과
  match_candidates: Ingredient[];        // 후보 2개 이상일 때
  prev_price: number | null;            // 이전 발주 단가 (변동 표시용)
}

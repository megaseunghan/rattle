// 매장
export interface Store {
  id: string;
  name: string;
  owner_id: string;
  categories?: string[];
  closing_time?: string | null;
  created_at: string;
  business_number?: string | null;
  owner_phone?: string | null;
  address?: string | null;
  toss_merchant_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export type AttendanceType = 'clock_in' | 'clock_out';

export interface Attendance {
  id: string;
  store_id: string;
  employee_id: string;
  type: AttendanceType;
  timestamp: string;
  latitude: number;
  longitude: number;
  distance_m: number;
  note: string | null;
  created_at: string;
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
export interface TossOrderItemOptionChoice {
  title: string;
  code?: string;
  priceValue: number;
  quantity: number;
}

export interface TossOrderItem {
  itemId: string;
  itemName: string;
  categoryName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  optionChoices: TossOrderItemOptionChoice[];
}

export interface TossOrder {
  orderId: string;
  orderAt: string;
  totalAmount: number;
  cardAmount: number;   // CASH, ACCOUNT_TRANSFER 제외
  cashAmount: number;   // CASH + ACCOUNT_TRANSFER
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

export interface TossOrderRecord {
  id: string;
  store_id: string;
  toss_order_id: string;
  order_at: string;
  total_amount: number;
  card_amount: number;
  cash_amount: number;
  status: 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
  synced_at: string;
}

export interface TossOrderItemRecord {
  id: string;
  order_id: string;
  store_id: string;
  item_id: string | null;
  item_name: string;
  category_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  option_choices: TossOrderItemOptionChoice[];
  created_at: string;
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

// Toss Place 카탈로그 (DB row)
export interface TossCatalogEntry {
  id: string;
  store_id: string;
  item_id: string;
  item_name: string;
  category_name: string;
  price: number;
  is_available: boolean;
  synced_at: string;
}

// POS 일별 요약
export interface DailySummary {
  date: string;       // 'YYYY-MM-DD' (영업일 기준 날짜 레이블)
  dateFrom: string;   // ISO — 영업일 시작 (전날 closing_time)
  dateTo: string;     // ISO — 영업일 종료 (당일 closing_time)
  totalAmount: number;
  orderCount: number;
}

// 매장 멤버
export interface StoreMember {
  id: string;
  store_id: string;
  user_id: string;
  user_email: string | null;
  role: 'admin' | 'member';
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

// 직원
export type EmploymentType = 'regular' | 'part_time';

export interface Employee {
  id: string;
  store_id: string;
  user_id: string | null;              // 연결된 로그인 계정 (출퇴근 본인 확인용)
  name: string;
  employment_type: EmploymentType;
  base_salary: number;
  non_taxable: number;
  joined_at: string | null;            // 'YYYY-MM-DD' 입사일 (61일 수습 자동 적용)
  phone: string | null;
  bank_name: string | null;
  account_number: string | null;
  is_probation: boolean;
  probation_started_at: string | null;
  is_resigned_during_probation: boolean;
  weekly_hours: number | null;
  dependents: number;
  is_active: boolean;
  created_at: string;
}

// 급여 명세
export interface Payroll {
  id: string;
  store_id: string;
  employee_id: string;
  year_month: string;              // 'YYYY-MM'
  gross: number;                   // 세전 총 지급액
  taxable_base: number;            // 과세기준액
  national_pension: number;
  health_insurance: number;
  long_term_care: number;
  employment_insurance: number;
  income_tax: number;
  local_income_tax: number;
  withholding_tax: number;         // 3.3% 원천징수 (파트타임 주15h 미만)
  net_pay: number;
  created_at: string;
}

// 매입
export type PurchaseCategory = '식자재' | '비품' | '소모품' | '주류' | '기타';
export type PurchaseType = '전자세금계산서' | '쿠팡' | '네이버' | '수기';

export interface Purchase {
  id: string;
  store_id: string;
  date: string;           // 'YYYY-MM-DD'
  supplier: string;
  amount: number;
  category: PurchaseCategory;
  type: PurchaseType;
  note: string | null;
  created_at: string;
}

// 비용
export type ExpenseCategory = '마케팅' | '고정비' | '시설보수' | '공과금';

export interface Expense {
  id: string;
  store_id: string;
  year_month: string;     // 'YYYY-MM'
  category: ExpenseCategory;
  name: string;
  amount: number;
  created_at: string;
}

// 손익계산서
export interface ProfitLoss {
  yearMonth: string;
  // 1. 매출
  cardRevenue: number;
  cashRevenue: number;
  revenue: number;
  // 2. 매입 (카테고리별)
  purchaseByCategory: Partial<Record<PurchaseCategory, number>>;
  purchaseCost: number;
  grossProfit: number;
  // 3. 인건비
  regularGross: number;       // 직원 인건비 (세전)
  regularWithholding: number; // 직원 원천징수 (4대보험+소득세)
  partTimeGross: number;      // 파트타이머 인건비
  partTimeWithholding: number;// 파트타이머 3.3% 원천징수
  laborCost: number;          // 합계
  // 4. 비용 (카테고리별)
  fixedExpense: number;
  marketingExpense: number;
  maintenanceExpense: number;
  utilitiesExpense: number;
  variableExpense: number;    // 마케팅+시설보수+공과금 합계
  // 5. 이익
  operatingProfit: number;
  taxReserve: number;
  netProfit: number;
}

// POS 상품별 집계 (일별 상세)
export interface DailyItem {
  itemId: string;
  itemName: string;
  categoryName: string;  // 카탈로그 미동기화 시 ''
  quantity: number;
  totalAmount: number;
}

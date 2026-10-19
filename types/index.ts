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
  labor_ratio_target?: number;
  cogs_ratio_target?: number;
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
  unit_volume?: number | null;       // 개수 재고의 1개당 용량 (레시피 원가 환산용)
  unit_volume_unit?: string | null;  // 개당 용량의 단위 (g / mL)
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
  applicant_name: string | null;      // 참여 신청 시 입력한 이름
  phone: string | null;
  role: 'admin' | 'member';
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface StoreJoinResult {
  store_id: string;
  store_name: string;
}

export interface MemberApprovalResult {
  employee_id: string;
  employee_name: string;
}

// 직원
export type EmploymentType = 'regular' | 'part_time';

export interface Employee {
  id: string;
  store_id: string;
  user_id: string | null;              // 연결된 로그인 계정 (급여 명세서·스케줄 본인 확인용)
  name: string;
  employment_type: EmploymentType;
  base_salary: number;
  hourly_wage: number | null;          // 파트타이머 시급 (분 단위 급여 계산용)
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

// 급여 이력 (effective_date 기준 시급/월급 변경 보존)
export interface WageHistory {
  id: string;
  store_id: string;
  employee_id: string;
  effective_date: string;          // 'YYYY-MM-DD' 적용 시작일
  base_salary: number;             // 정규직 월급
  hourly_wage: number | null;      // 파트타이머 시급
  non_taxable: number;
  memo: string | null;             // 사유 (인상/인하/징계 등)
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
  is_settled: boolean;
  settled_at: string | null;
  worked_minutes?: number | null;  // 월별 급여 작성용 수기 입력 (0분과 미입력 구분)
  applied_hourly_wage?: number | null;
  work_note?: string | null;
  work_source?: 'manual' | 'legacy_attendance' | null;
  work_submission_id?: string | null;
  revision?: number;
  updated_at?: string;
  updated_by?: string | null;
  created_at: string;
}

export interface PayrollWorkSubmission {
  id: string;
  store_id: string;
  employee_id: string;
  year_month: string;
  worked_minutes: number;
  note: string;
  version: number;
  status: 'pending' | 'approved' | 'rejected' | 'superseded';
  submitted_by: string | null;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
}

export interface PayrollWorkHistory {
  id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  old_record: Payroll | null;
  new_record: Payroll | null;
  changed_at: string;
  changed_by: string | null;
}

// 매입
// 매장별로 자유롭게 추가/수정/삭제 가능 (stores.purchase_categories) — 고정 enum이 아님
export type PurchaseCategory = string;
export type PurchaseType = string;

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

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  store_id: string;
  ingredient_id: string | null;
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  subtotal: number;
  category: string | null;
  created_at: string;
}

// 매입 등록 입력용 품목 라인 (재고 연결 시 ingredient_id 채움)
export interface PurchaseItemInput {
  ingredient_id: string | null;
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  category: string;
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
  cardFeeExpense: number;     // 카드 수수료 (카드매출 × 1.25%, 자동 계산)
  variableExpense: number;    // 마케팅+시설보수+공과금+카드수수료 합계
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

// 매출 수기 입력 (화면 10/11)
export interface ManualSale {
  id: string;
  store_id: string;
  date: string; // 'YYYY-MM-DD' — 매장당 하루 1건
  cash_amount: number;
  card_amount: number;
  discount_amount: number;
  memo: string | null;
  created_by: string | null;
  created_at: string;
}

// 알림 센터 (화면 38/52)
export type NotificationCategory = 'attendance' | 'stock' | 'sales';

export interface HomeAlert {
  key: string;
  kind: 'stock' | 'fixedExpenseMissing' | 'tossNotSynced' | 'monthClose';
  message: string;
  actionLabel: string;
  route: string;
}

export interface AppNotification {
  id: string;
  store_id: string;
  category: NotificationCategory;
  type: string;
  title: string;
  message: string;
  dedupe_key: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationSetting {
  id: string;
  store_id: string;
  setting_key: string;
  enabled: boolean;
}

// 청소 체크리스트 (화면 27/28)
export type CleaningSegment = 'open' | 'close' | 'weekday';

export interface CleaningItem {
  id: string;
  store_id: string;
  segment: CleaningSegment;
  weekday: number | null; // segment='weekday'일 때만 사용 (0=일요일)
  title: string;
  sort_order: number;
  created_at: string;
}

// 주간 스케줄 (화면 21/22)
export interface EmployeeSchedule {
  id: string;
  store_id: string;
  employee_id: string;
  day_of_week: number;       // 0=일요일 ~ 6=토요일
  is_working: boolean;
  start_time: string | null; // 'HH:mm:ss'
  end_time: string | null;
  updated_at: string;
}

export interface ScheduleDayInput {
  day_of_week: number;
  is_working: boolean;
  start_time: string | null;
  end_time: string | null;
}

export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface ScheduleRequest {
  id: string;
  store_id: string;
  employee_id: string;
  days: ScheduleDayInput[];
  status: RequestStatus;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export interface CleaningLog {
  id: string;
  store_id: string;
  item_id: string;
  date: string; // 'YYYY-MM-DD'
  checked_by: string;
  checked_by_name: string;
  checked_at: string;
}

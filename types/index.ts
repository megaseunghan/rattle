export type FinancialShareScope = 'none' | 'regular_only' | 'all_staff';
export type PosSetupChoice = 'now' | 'later';

// 매장
export interface Store {
  id: string;
  name: string;
  owner_id: string;
  financial_share_scope?: FinancialShareScope;
  pos_setup_choice?: PosSetupChoice | null;
  setup_request_id?: string | null;
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
  /** 매장 기본 수습 기간. 둘 다 null이면 '없음'. 직원별 기간은 합류 승인 때 정한다. */
  default_probation_months?: 1 | 2 | 3 | null;
  default_probation_days?: number | null;
  /** 산재보험 사업종류(업종 요율 표 코드). 마저 채우기 4대보험 묶음에서 고른다. null이면 손익에 '산재보험 미포함'. */
  industrial_accident_industry?: string | null;
}

/** 매장별 관리 항목의 ID는 이름 변경 후에도 유지한다. */
export interface StoreTaxonomy {
  id: string;
  store_id: string;
  domain: 'ingredient' | 'purchase' | 'purchase_type';
  name: string;
  sort_order: number;
  is_active: boolean;
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
  category_id?: string | null;
  name: string;
  category: string;
  current_stock: number;
  unit: string;
  min_stock: number;  // 품절 임박 기준
  last_price: number | null;
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

export interface MemberApprovalExistingWage {
  employment_type: 'regular' | 'part_time';
  hourly_wage: number | null;
  base_salary: number | null;
  effective_date: string;
}

export interface MemberApprovalCandidate {
  id: string;
  name: string;
  phone: string | null;
  is_active: boolean;
  joined_at: string | null;
  created_at: string;
  has_other_account: boolean;
  is_applicant_account: boolean;
  /** 관리자 후보 조회에서만 제공. 현재 유효 최신 조건이 없거나 잘못되었으면 null. */
  existing_wage?: MemberApprovalExistingWage | null;
  employment_type?: 'regular' | 'part_time' | null;
  wage_condition_valid?: boolean;
  wage_history_id?: string | null;
  wage_effective_date?: string | null;
  wage_hourly_wage?: number | null;
  wage_base_salary?: number | null;
}

export type MemberApprovalChoice =
  | { kind: 'auto' }
  | { kind: 'rehire'; employeeId: string }
  | { kind: 'new' };

export interface JoinOnboardingInput {
  employment_type: 'regular' | 'part_time';
  hourly_wage: number | null;
  weekly_hours: number | null;
  base_salary: number;
  non_taxable: number;
  joined_at: string;
  bank_name: string;
  account_number: string;
}

/** 재합류에서만 사용. 전체 조건 입력과 섞지 않고 조회한 이력 ID를 전달한다. */
export interface PreserveJoinOnboardingWage {
  preserve_existing_wage: true;
  wage_history_id: string;
}
export type JoinOnboardingReview = JoinOnboardingInput | PreserveJoinOnboardingWage;

export interface JoinOnboardingProfile extends JoinOnboardingInput {
  member_id: string;
  store_id: string;
  applicant_user_id: string;
  revision: number;
  reviewed_revision: number | null;
  reviewed_profile?: JoinOnboardingInput | null;
}

export interface MemberApprovalResult {
  employee_id: string;
  employee_name: string;
}

// 직원
export type EmploymentType = 'regular' | 'part_time';

/** 소득 구분. 일용근로자는 계정 없는 일용근로자 명단(DailyLaborer)으로 따로 관리한다. */
export type IncomeType = 'employee' | 'freelancer';

export interface Employee {
  wage_history_missing?: boolean;
  id: string;
  store_id: string;
  user_id: string | null;              // 연결된 로그인 계정 (급여 명세서·스케줄 본인 확인용)
  name: string;
  employment_type: EmploymentType;
  base_salary: number;
  hourly_wage: number | null;          // 파트타이머 시급 (분 단위 급여 계산용)
  non_taxable: number;
  joined_at: string | null;            // 'YYYY-MM-DD' 입사일
  phone: string | null;
  bank_name: string | null;
  /** 암호화 토큰(enc:v1:…). 화면에 그대로 보이지 않는다. 전체 번호는 revealAccountNumber('employee', id). */
  account_number: string | null;
  /** 계좌번호 끝 4자리(서버 생성 열) */
  account_last4?: string | null;
  is_probation: boolean;               // 사장님이 수습으로 표시한 직원만 수습 감액
  probation_started_at: string | null; // 수습 시작일(없으면 입사일)
  probation_ends_on: string | null;    // 수습 마지막 날(포함). is_probation이어도 없으면 감액하지 않는다
  /** @deprecated 2026-v2부터 계산에 쓰지 않는다(수습 중 퇴사 80% 규칙 제거). */
  is_resigned_during_probation: boolean;
  /** @deprecated weekly_minutes를 쓴다. 기존 정수 시간 컬럼은 보존만 한다. */
  weekly_hours: number | null;
  weekly_minutes: number | null;       // 주 소정 근무시간(분, 10분 단위). 비면 공제하지 않고 입력 안내
  weekly_rest_included: boolean | null; // 시급에 주휴수당 포함 여부(파트타이머). null=정하지 않음
  income_type: IncomeType;             // 근로자 / 프리랜서(3.3%)
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
  calculation_version?: string | null;
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
  daily_work_snapshot?: DailyWorkSnapshot[] | null;
  regular_wage_snapshot?: import('../lib/utils/regularWages').RegularWageSnapshot | null;
  revision?: number;
  updated_at?: string;
  updated_by?: string | null;
  created_at: string;
}

export interface DailyWorkSnapshot {
  id: string;
  revision: number;
  work_date: string;
  worked_minutes: number;
  applied_hourly_wage: number;
  gross: number;
  status: 'pending' | 'approved' | 'rejected';
}
export interface DailyWorkRecord extends DailyWorkSnapshot {
  store_id: string;
  employee_id: string;
  note: string;
  submitted_by: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  updated_at: string;
}
export interface DailyWorkHistory {
  id: string;
  store_id: string;
  employee_id: string;
  work_date: string;
  old_record: DailyWorkRecord | null;
  new_record: DailyWorkRecord;
  changed_by: string | null;
  changed_at: string;
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
  category_amounts?: Record<string, number>;
  id: string;
  store_id: string;
  category_id?: string | null;
  purchase_type_id?: string | null;
  date: string;           // 'YYYY-MM-DD'
  supplier: string;
  amount: number;
  category: PurchaseCategory;
  type: PurchaseType;
  note: string | null;
  created_at: string;
  /** 매입 목록 조회에서만 채워지는 품목 수 */
  item_count?: number;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  store_id: string;
  category_id?: string | null;
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
  missingWageEmployeeIds?: string[]; // 적용 이력과 월 급여가 모두 없는 재직 직원
  // 1. 매출
  cardRevenue: number;
  cashRevenue: number;
  revenue: number;
  // 2. 매입 (카테고리별)
  purchaseByCategory: Partial<Record<PurchaseCategory, number>>;
  purchaseBySupplier?: Record<string, number>;
  purchaseCost: number;
  grossProfit: number;
  // 3. 인건비
  regularGross: number | null;       // 직원 인건비 (세전)
  regularWithholding: number; // 직원 원천징수 (4대보험+소득세)
  partTimeGross: number;      // 파트타이머 인건비
  partTimeWithholding: number;// 파트타이머 공제(3.3%·4대보험·소득세)
  dailyLaborGross?: number;        // 일용근로자 세전 합계(계정 없는 일용근로자 명단)
  laborCost: number | null;          // 합계
  /** 사업주 부담 4대보험(예상). 작성한 급여 명세·일용 기록 기준. 영업이익에는 빼지 않는다. 기준이 없으면 null. */
  employerInsurance?: number | null;
  employerInsuranceIncludesAccident?: boolean;
  /** 사업주 부담 추정에서 빠진(이 달 명세 미작성) 재직 직원 수 */
  employerInsuranceMissingSlips?: number; // false면 '산재보험 미포함'
  // 4. 비용 (카테고리별)
  fixedExpense: number;
  marketingExpense: number;
  maintenanceExpense: number;
  utilitiesExpense: number;
  cardFeeExpense: number;     // 카드 수수료 (카드매출 × 1.25%, 자동 계산)
  variableExpense: number;    // 마케팅+시설보수+공과금+카드수수료 합계
  // 5. 이익
  operatingProfit: number | null;
  taxReserve: number;
  netProfit: number | null;
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
export type NotificationCategory = 'attendance' | 'stock' | 'sales' | 'members';

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
  attendance_employee_id?: string | null;
  attendance_punch_id?: string | null;
  attendance_work_date?: string | null;
  resolved_at?: string | null;
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
  checked_by: string | null;
  checked_by_name: string;
  checked_at: string;
}

/** 홈 공유용 매장 합계. 직원 개인 급여·공제 내역은 포함하지 않는다. */
export interface HomeFinancialSummary {
  yearMonth: string;
  revenue: number;
  purchaseCost: number;
  laborCost: number | null;
  fixedExpense: number;
  variableExpense: number;
  operatingProfit: number | null;
}

/** Store-wide home shortcuts; ordering is persisted separately for each part of the day. */
export type HomePhase = 'open' | 'business' | 'close';
export type HomeActionId = 'open_check' | 'close_check' | 'weekday_check' | 'stock' | 'stock_edit' | 'schedule' | 'purchase' | 'recipes' | 'sales' | 'expenses';
export type HomeWorkflow = Record<HomePhase, HomeActionId[]>;

// QR 출퇴근 1차 — 급여·일별 근무 자료와 분리된 서버 계약.
export type AttendancePunchKind = 'clock_in' | 'clock_out';
export type AttendancePunchSource = 'scan' | 'manual' | 'correction';
export type AttendanceDeviceStatus = 'active' | 'pending' | 'revoked';
export type AttendanceFlag = 'no_schedule' | 'early_clock_in' | 'late_clock_out' | 'previous_open_over_16h' | 'new_device';
export type AttendanceCorrectionAction = 'add' | 'change' | 'void';
export type AttendanceCorrectionStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export interface AttendanceEmployeeName { id: string; name: string }
/** qr_nonce는 화면·캐시에 전달하지 않는다. 직원 조인은 이름·ID만 읽는다. */
export interface AttendancePunch {
  id: string;
  /** 서버 동일 punched_at 순서. UUID로 대체 정렬하지 않는다. */
  event_order: number;
  store_id: string;
  employee_id: string;
  kind: AttendancePunchKind;
  punched_at: string;
  work_date: string;
  source: AttendancePunchSource;
  is_void: boolean;
  supersedes_id: string | null;
  scanner_id: string | null;
  device_id: string | null;
  flags: AttendanceFlag[];
  note: string | null;
  created_by: string | null;
  created_at: string;
}
export interface AttendancePunchWithEmployee extends AttendancePunch {
  employee: AttendanceEmployeeName | null;
}
export interface AttendancePairedSnapshot {
  punch_id: string;
  kind: AttendancePunchKind;
  punched_at: string;
  work_date: string;
}
export interface AttendanceOriginalSnapshot extends AttendancePairedSnapshot {
  source: AttendancePunchSource;
  paired_original?: AttendancePairedSnapshot | null;
  paired_before_apply?: AttendancePairedSnapshot | null;
}
export interface AttendanceCorrectionRequest {
  id: string;
  store_id: string;
  employee_id: string;
  action: AttendanceCorrectionAction;
  target_punch_id: string | null;
  kind: AttendancePunchKind | null;
  requested_time: string | null;
  reason: string;
  status: AttendanceCorrectionStatus;
  original_snapshot: AttendanceOriginalSnapshot | null;
  requested_by: string;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  applied_punch_id: string | null;
  paired_applied_punch_id: string | null;
}
export interface AttendanceCorrectionWithHistory extends AttendanceCorrectionRequest {
  employee: AttendanceEmployeeName | null;
  /** 원본 attendance_punches와 연결하므로 후속 정정·무효 처리 뒤에도 조회된다. */
  applied_punch: AttendancePunch | null;
  paired_applied_punch: AttendancePunch | null;
}
export interface StoreAttendanceDevice {
  device_id: string;
  employee_id: string;
  employee_name: string;
  label: string;
  status: AttendanceDeviceStatus;
  requested_at: string;
  activated_at: string | null;
  first_punch_at: string | null;
}
export interface AttendanceScanner {
  id: string;
  store_id: string;
  label: string;
  created_by: string;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
}
export interface AttendanceScanReceipt {
  punch_id: string;
  kind: AttendancePunchKind;
  punched_at: string;
  flags: AttendanceFlag[];
  duplicate: boolean;
  employee_name: string;
}
/** RPC명·인자·반환을 한 곳에서 대조한다. void RPC의 JSON 응답은 null이다. */
export interface AttendanceRpcContracts {
  register_attendance_device: { args: { p_label: string }; result: { device_id: string; status: 'active' | 'pending'; secret: string } };
  issue_attendance_qr: { args: { p_device_id: string }; result: { nonce: string; expires_at: string } };
  approve_attendance_device: { args: { p_device_id: string }; result: null };
  revoke_attendance_device: { args: { p_device_id: string; p_reason: string | null }; result: null };
  list_store_attendance_devices: { args: { p_store_id: string }; result: StoreAttendanceDevice[] };
  register_attendance_scanner: { args: { p_store_id: string; p_label: string }; result: { scanner_id: string; token: string } };
  revoke_attendance_scanner: { args: { p_scanner_id: string }; result: null };
  attendance_scanner_status: { args: { p_scanner_token: string }; result: { scanner_id: string; store_name: string; label: string } };
  punch_attendance: { args: { p_scanner_token: string; p_qr: string }; result: AttendanceScanReceipt };
  record_manual_attendance: { args: { p_store_id: string; p_employee_id: string; p_kind: AttendancePunchKind; p_at: string; p_reason: string }; result: string };
  request_attendance_correction: { args: { p_store_id: string; p_employee_id: string; p_action: AttendanceCorrectionAction; p_target_punch_id: string | null; p_kind: AttendancePunchKind | null; p_time: string | null; p_reason: string }; result: string };
  /** NULL은 반려/대상 변경 자동 반려도 포함한다. 승인으로 간주하지 말고 요청 상태를 재조회한다. */
  review_attendance_correction: { args: { p_request_id: string; p_approve: boolean; p_note: string | null }; result: string | null };
  cancel_attendance_correction: { args: { p_request_id: string }; result: null };
}
export type AttendanceRpcArgs<N extends keyof AttendanceRpcContracts> = AttendanceRpcContracts[N]['args'];
export type AttendanceRpcResult<N extends keyof AttendanceRpcContracts> = AttendanceRpcContracts[N]['result'];
export interface AttendancePage<T> { rows: T[]; nextOffset: number | null }
export interface AttendancePeriodQuery {
  storeId: string;
  fromDate: string;
  toDate: string;
  employeeId?: string;
  offset?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

// 매장 역할·열람 계약: legacy StoreMember.role은 권한 근거가 아니다.
export type StoreRole = 'owner' | 'manager' | 'employee' | 'part_timer';
export interface StoreAccess {
  store_id: string;
  role: StoreRole | null;
  employee_id: string | null;
  is_owner: boolean;
  is_manager: boolean;
  can_manage_store: boolean;
  can_manage_managers: boolean;
  can_manage_visibility: boolean;
  can_transfer_ownership: boolean;
  can_delete_store: boolean;
  can_view_owner_dashboard: boolean;
  manager_member_id: string | null;
  manager_employee_id: string | null;
  /** bigint를 number로 변환하지 않는다. null은 조회 불가이며 CAS에 쓰지 않는다. */
  manager_revision: string | null;
}
export interface StoreManagerState {
  store_id: string;
  member_id: string | null;
  employee_id: string | null;
  user_id: string | null;
  assigned_at: string | null;
  revision: string;
}
export interface StoreVisibilityScopes {
  financial_share_scope: FinancialShareScope;
  attendance_share_scope: FinancialShareScope;
  payroll_share_scope: FinancialShareScope;
}
export interface StoreVisibility extends StoreVisibilityScopes {
  store_id: string;
  visibility_revision: string;
  can_manage_visibility: boolean;
  can_read_financials: boolean;
  can_read_other_attendance: boolean;
  can_read_other_payroll: boolean;
}
export interface SharedAttendance {
  employee_id: string; employee_name: string; kind: string; punched_at: string;
  work_date: string; flags: string[]; status: string;
}
export interface SharedAttendanceRequest {
  employee_id: string; employee_name: string; kind: string; requested_time: string | null;
  work_date: string | null; status: string;
}
export interface SharedPayroll {
  employee_id: string; employee_name: string; year_month: string;
  gross: number | null; applied_hourly_wage: number | null;
}
export interface SharedEmployeePay {
  employee_id: string; employee_name: string; base_salary: number | null; hourly_wage: number | null;
}
export interface SharedFinancialSummary {
  store_id: string; year_month: string; revenue: number | null; purchase_cost: number | null;
  labor_cost: number | null; fixed_expense: number | null; variable_expense: number | null; operating_profit: number | null;
}

/** QR-A02/A04/A05: get/retry_attendance_work_record JSON (20261118120000). */
export interface AttendanceWorkRecord {
  punch_id: string;
  effective_punch_id: string;
  employee_id: string;
  eligible: boolean;
  state: 'pending' | 'completed' | 'failed' | 'not_applicable';
  error_code: string | null;
  clock_in_id: string | null;
  clock_out_id: string | null;
  work_date: string;
  shift_minutes: number | null;
  daily_work_id: string | null;
  daily_minutes: number | null;
  daily_revision: number | null;
  daily_gross: number | null;
  applied_hourly_wage: number | null;
  review_status: 'pending' | 'approved' | 'rejected' | null;
  updated_at: string | null;
}
export interface AttendanceAutoRecord {
  punchId: string;
  minutes: number | null;
  status: 'pending' | 'saved' | 'unknown' | 'error';
  /** 정정/재계산의 늦은 응답 검증용. */
  effectivePunchId?: string;
  dailyRevision?: number | null;
}

/** 관리자만 조회하는 QR 자동 인건비 반영 실패 목록. null 재시도 ID는 직접 원본 확인이 필요하다. */
export interface AttendanceWorkFailure {
  employee_id: string;
  employee_name: string;
  work_date: string;
  error_code: string;
  updated_at: string;
  retry_punch_id: string | null;
}

/** 일용근로자 명단(계정 없음, 사장·점장 입력). 주민번호 등 고유식별정보는 저장하지 않는다. */
export interface DailyLaborer {
  id: string;
  store_id: string;
  name: string;
  phone: string | null;
  bank_name: string | null;
  /** 암호화 토큰(enc:v1:…). 화면에 그대로 보이지 않는다. 전체 번호는 revealAccountNumber로 받는다. */
  account_number: string | null;
  account_last4?: string | null;
  weekday_wage: number | null;
  weekend_wage: number | null;
  memo: string | null;
  is_active: boolean;
  revision: number;
  created_at: string;
  updated_at: string;
}

/** 일용근로자 하루 근무 기록. 소득세는 지급 묶음(DailyLaborPayment)에서 정한다. */
export interface DailyLaborEntry {
  id: string;
  store_id: string;
  laborer_id: string;
  work_date: string;
  is_weekend: boolean;
  daily_wage: number;
  extra_pay: number;
  gross: number;
  /** 하루치 산출세액(미징수 판단 전) */
  day_income_tax: number;
  employment_insurance: number;
  calculation_version: string;
  memo: string | null;
  /** 지급 묶음 ID. null = 미지급 */
  payment_id: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

/** 일용근로자 지급 묶음. 소득세 1,000원 미만 미징수는 묶음 합계 기준. */
export interface DailyLaborPayment {
  id: string;
  store_id: string;
  laborer_id: string;
  paid_on: string;
  gross: number;
  income_tax: number;
  local_income_tax: number;
  employment_insurance: number;
  net_pay: number;
  calculation_version: string;
  canceled_at: string | null;
  created_at: string;
}

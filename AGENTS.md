# Rattle — Codex Context

매장 손익 관리 앱 (Expo SDK 55 + React Native + TypeScript + Supabase)

**앱 목적**: 다매장 손익을 한 곳에서 관리.
매출(TossPos) · 매입(전자세금계산서/수기) · 비용 · 인건비 · 재고·발주·레시피 · 매장별 손익계산서

## 제품 범위 결정 (2026-10-16)

- **종합평가·인센티브**: 앱에서 구현하지 않는다. 개발 예정 기능에 포함하지 않는다.
- **출퇴근**: Rattle에는 출퇴근 등록·GPS 검증을 구현하지 않는다.
- **인건비**: 파트타이머만 직원별·월별 총 실근무 분을 폼으로 입력한다. 세전 금액은 입력 분 × 적용 시급 ÷ 60 (원 단위 반올림)이다. 월급제 정규직은 근무 분 입력 없이 기존 월급 계산으로 급여를 작성한다. 과거에 입력한 정규직 근무 분은 선택 정보로 보존한다.
- **급여 이력**: 파트타이머의 미입력과 0분을 구분한다. 작성·수정·삭제 이력과 작성 계정을 보관하고, 근무시간·금액 변경 시 정산 확정을 해제한다.
- **전환**: `20261016_manual_work_minutes.sql`과 `20261018_part_time_minutes_settlement.sql`을 앱 배포 전에 순서대로 적용한다. 기존 출퇴근 DB 기록은 삭제하지 않고 과거 파트타이머 급여로 이전한다. 이전된 자료는 공제 검토가 필요하다.
## 운영 입력 흐름 변경 (2026-10-19)

- 파트타이머는 연결된 본인 계정으로 월별 총 실근무 분과 근거를 제출한다. 관리자가 확인·반려하고, 시급·공제를 검토해 최종 급여에 반영한다. 제출·확인·급여 반영·정산 확정을 구분한다.
- 직원 제출은 `payroll_work_submissions`의 버전별 내역으로 보관하며 최종 급여 직접 수정은 관리자만 허용한다. 재제출은 기존 금액을 유지하면서 정산 확정을 해제한다.
- 매입 유형은 매장별 추가·이름 변경을 지원한다. 기존 매입 이력과 유형 목록은 함께 갱신한다.
- 재고 숫자 배지 대신 홈 상단 품목별 알림을 사용한다. 홈 알림 읽음은 사용자·매장·이벤트별로 보관한다.
- 새 `20261019_*` SQL 4개는 로컬 검증만 마쳤으며 원격 DB에는 미적용이다. 세부 적용 조건은 `docs/운영-입력-개선-2026-10-19.md`를 따른다.
- 레시피 목록 상단에는 항상 레시피 추가 버튼을 제공한다. 매입서 스캔·OCR 등록은 제공하지 않는다.
- 신규 수기 매입은 품목별로 고정하며 ‘금액만’ 입력은 제공하지 않는다. 과거 이력은 보존한다. 토스 포스 메뉴 변경은 이번 범위에서 제외한다.
- 직원은 사업자번호·이름·휴대폰 번호로 참여 신청하고, 관리자 승인 시 유일하게 일치하는 재직 직원에 자동 연결한다. 겹침·퇴사·다른 계정 연결은 자동 승인/덮어쓰기하지 않는다. 기존 급여 정보를 보존한다.
- SQL 변경이 있으면 작업 종료 시 사용자에게 **“Supabase에서 SQL 적용을 진행해줘”**라고 요청하고, 적용할 파일·순서·미적용 상태를 명시한다. 사용자가 별도로 실행을 맡기기 전에는 원격 DB 적용 완료로 보고하지 않는다.

---
## 기술 스택

- Expo Router (파일 기반 라우팅, Stack + Tabs)
- Supabase (Auth + DB + Storage + Edge Functions), RLS 적용
- React Context (AuthContext) + 도메인별 custom hooks
- Toss Place Open API (`toss-proxy` Edge Function으로 프록시)

---

## 화면 구성

### 일반 사용자 (하단 탭 5개)

| 탭 | 내용 |
|----|------|
| 홈 | 오늘 매출 + 이번 달 손익 요약 + 품절 임박 알림 |
| 매입 | 전자세금계산서 자동 수취 / 쿠팡·네이버 수기 구분 |
| 인건비 | 직원별 실수령액 + 4대보험 자동 계산 + 수습 뱃지 |
| 재고 | 잔여량 프로그레스 바 + 발주 탭 + 레시피 탭 |
| 더보기 | 매장 전환 + TossPos·세금계산서 연동 설정 |

### 최고 관리자 (별도 진입점)

- 전체 매장 손익 대시보드 (매장별 비교)
- 전 매장 직원 관리
- 연동 설정 (TossPos, 전자세금계산서)

---

## 디렉토리 구조

```
app/
  _layout.tsx                  # Root: AuthProvider, 인증 분기
  (auth)/login.tsx, signup.tsx, select-store.tsx
  (tabs)/
    index.tsx                  # 홈 (매출 요약 + 손익 요약 + 품절 알림)
    purchases.tsx              # 매입 (전자세금계산서 + 수기)
    payroll.tsx                # 인건비 (4대보험 자동계산)
    stock.tsx                  # 재고 (프로그레스 바 + 발주 + 레시피)
    more.tsx                   # 더보기 (매장 전환 + 연동 설정)
  admin/                       # 최고 관리자 (별도 진입점)
    index.tsx                  # 전체 손익 대시보드
    employees.tsx              # 직원 관리
  purchases/new.tsx, [id].tsx
  recipes/new.tsx, [id].tsx
  stock/new.tsx, [id].tsx
  pos/[date].tsx               # 날짜별 POS 상세 (품목별 매출)
  settings/
    profile.tsx                # 프로필 설정
    pos-sync.tsx               # Toss Place 가맹점 연동 설정

lib/
  supabase.ts                  # 싱글턴 클라이언트
  contexts/AuthContext.tsx     # user, session, store, loading, signOut, refreshStore
  hooks/
    useDashboard.ts
    useIngredients.ts
    useOrders.ts
    useRecipes.ts
    useCategories.ts
    useTossSync.ts             # 카탈로그·주문 동기화
    usePosAnalytics.ts         # POS 일별 요약·상세 분석
    usePayroll.ts              # 인건비 계산 (4대보험·소득세)
    usePurchases.ts            # 매입 내역
    useProfitLoss.ts           # 손익계산서
  services/                   # DB 호출 전담 — 컴포넌트에서 supabase 직접 호출 금지
    ingredients.ts
    orders.ts
    recipes.ts                 # upsertRecipesFromCatalog 포함
    categories.ts
    stores.ts
    tossplace.ts               # Toss Place API 호출
    posAnalytics.ts            # 영업일 범위 계산, 일별/상품별 집계
    tossPlaceForm.ts           # Toss Place 가맹점 신청 폼 저장
    payroll.ts                 # 급여·4대보험·소득세 계산
    purchases.ts               # 매입 내역 CRUD
    profitLoss.ts              # 손익계산서 집계
  components/
    ErrorMessage.tsx
    LoadingSpinner.tsx
    CatalogImportModal.tsx

types/index.ts                 # 모든 타입 정의
constants/colors.ts            # 디자인 토큰 (매장별 컬러 포함)
supabase/migrations/           # 마이그레이션 SQL
```

---

## 인증 & 라우팅 흐름

```
앱 시작 → user 없음 → /(auth)/login
        → user 있음 + store 없음 → /(auth)/select-store
        → user + store 있음 → /(tabs)/index
        → 최고 관리자 → /admin/index (별도 진입점)
```

`useAuth()` → `{ user, session, store, loading, signOut, refreshStore }`
- `store`: owner_id 기준 첫 번째 매장 (toss_merchant_id, closing_time 포함)

---

## 개발 컨벤션

- **서비스 레이어**: DB 접근은 `lib/services/`에서만. 컴포넌트에서 supabase 직접 호출 금지
- **훅**: 도메인별 hook이 service를 wrapping
- **색상**: `Colors.*` 사용 + 매장별 컬러는 store.id 기준으로 매핑, 하드코딩 금지
- **사용자 문구**: 외부 도구 도입·대조 절차 설명은 표시하지 않는다. 내부 DB/API 오류 원문은 사용자에게 표시하지 않고, 실패 여부와 필요한 다음 행동만 짧게 안내한다.
- **화면 헤더**: 기본 Stack 헤더는 숨기고 화면 자체 AppBar/헤더만 사용한다. `(tabs)` 같은 내부 경로명을 뒤로가기 라벨로 노출하지 않는다.
- **에러/로딩**: `ErrorMessage`, `LoadingSpinner` 공통 컴포넌트 사용
- **새 도메인 추가 순서**: `types/index.ts` → `lib/services/` → `lib/hooks/` → `app/`
- **Toss API**: 모든 호출은 `toss-proxy` Edge Function 경유 (`tossProxyRequest` 헬퍼)
- **수습 직원**: `is_probation` 플래그 → UI에서 뱃지 표시 + 급여 계산 시 90% 적용

---

## 인건비 계산 로직 (2026년 기준)

```
과세기준액 = 기본급 - 비과세 (수습: × 0.9 / 일용직: ÷ 30 × 근무일수)

국민연금  = min(max(과세기준액, 390,000), 6,170,000) × 4.5%  → 천 원 미만 버림
건강보험  = 과세기준액 × 3.545%                               → 10원 미만 버림
장기요양  = 건강보험료 × 12.95%                               → 10원 미만 버림
고용보험  = 과세기준액 × 0.9%                                 → 10원 미만 버림
소득세    = income_tax_table 조회 (부양가족 수 반영)
지방소득세 = 소득세 × 10%
```

소득세 간이세액표는 `income_tax_table`로 별도 관리 (매년 업데이트).

---

## 핵심 타입

| 타입 | 주요 필드 |
|------|-----------|
| `Store` | id, name, owner_id, toss_merchant_id, closing_time, toss_token |
| `Order` | status: pending/confirmed/delivered |
| `OrderItem` | order_id, ingredient_id, quantity, unit_price |
| `Ingredient` | current_stock, min_stock, unit, last_price |
| `Recipe` | selling_price, cost, margin_rate(자동계산) |
| `RecipeIngredient` | recipe_id, ingredient_id, quantity |
| `OcrResult` | image_url, raw_text, parsed_items(JSONB) |
| `Employee` | store_id, name, base_salary, non_taxable, is_probation, dependents |
| `Payroll` | store_id, employee_id, year_month, gross, national_pension, health_insurance, long_term_care, employment_insurance, income_tax, local_income_tax, net_pay |
| `Purchase` | store_id, date, supplier, amount, type(전자세금계산서/쿠팡/네이버/기타) |
| `Expense` | store_id, date, category, amount, type(fixed/variable) |
| `ProfitLoss` | store_id, year_month, revenue, purchase_cost, labor_cost, fixed_expense, variable_expense, net_profit |
| `TossOrder` | orderId, orderAt, totalAmount, status(COMPLETED/CANCELLED/REFUNDED), items[] |
| `TossCatalogItem` | itemId, itemName, categoryName, price, isAvailable |
| `DailySummary` | date, dateFrom, dateTo, totalAmount, orderCount |
| `DailyItem` | itemId, itemName, categoryName, quantity, totalAmount |

---

## Supabase 스키마

### 기존 테이블

| 테이블 | 주요 컬럼 |
|--------|-----------|
| `stores` | id, owner_id, name, closing_time(TIME), toss_merchant_id, toss_token, business_number, owner_phone, address |
| `ingredients` | store_id, name, category, current_stock, unit, min_stock, last_price |
| `orders` | store_id, supplier_name, order_date, total_amount, status |
| `order_items` | order_id, ingredient_id, quantity, unit, unit_price, subtotal |
| `recipes` | store_id, name, category, selling_price, cost, margin_rate |
| `recipe_ingredients` | recipe_id, ingredient_id, quantity, unit |
| `ocr_results` | 과거 OCR 보관 테이블. 앱 스캔 기능은 제거했으며 기존 기록은 보존 |

### Toss Place 테이블

| 테이블 | 주요 컬럼 |
|--------|-----------|
| `toss_orders` | id, store_id, toss_order_id(UNIQUE), order_at, total_amount, status, synced_at |
| `toss_order_items` | id, order_id, store_id, item_id, item_name, category_name, quantity, unit_price, total_price, option_choices(JSONB) |
| `toss_catalog` | id, store_id, item_id, item_name, category_name, price, is_available, synced_at |

### 손익 관리 테이블 (신규 추가 예정)

| 테이블 | 주요 컬럼 |
|--------|-----------|
| `employees` | store_id, name, base_salary, non_taxable, is_probation, dependents |
| `payroll` | store_id, employee_id, year_month, 4대보험 항목별, income_tax, local_income_tax, net_pay |
| `income_tax_table` | year, salary_from, salary_to, dependents_1..N (간이세액표) |
| `purchases` | store_id, date, supplier, amount, type, tax_invoice_id |
| `expenses` | store_id, date, category, amount, type(fixed/variable), note |
| `profit_loss` | store_id, year_month, revenue, purchase_cost, labor_cost, expenses, net_profit |

### RPC 함수 (트랜잭션 보장)

| 함수 | 역할 |
|------|------|
| `create_order_with_items(store_id, supplier_name, order_date, items JSONB)` | 발주 + 항목 원자적 생성 |
| `create_recipe_with_ingredients(store_id, name, category, selling_price, ingredients JSONB)` | 레시피 + 재료 원자적 생성 |
| `deliver_order(order_id)` | delivered 처리 + 재고 자동 증가 + last_price 업데이트 |
| `upsert_toss_order_with_items(store_id, toss_order_id, order_at, total_amount, status, items JSONB)` | Toss 주문 + 상세항목 원자적 Upsert |

---

## Toss Place POS 연동 흐름

```
pos.tsx → useTossSync()
    → syncByDate(date) / autoSync() / syncCatalog()
  → usePosAnalytics()
    → fetchSummaries() / fetchDailyItems()

toss-proxy Edge Function
  → /merchants/{merchantId}/order/orders?from=&to=
  → /merchants/{merchantId}/catalog/items
```

**영업일 기준**: `stores.closing_time`(기본 23:00) → 전날 closing_time ~ 당일 closing_time

---

## GitHub Flow

**레포**: https://github.com/megaseunghan/rattle | **기본 브랜치**: `main`

**main 보호**: force push 금지 · PR 필수 · Linear history (squash/rebase만)

**브랜치**: `feature/설명` · `fix/설명` · `refactor/설명`

**커밋**: `feat:` · `fix:` · `refactor:` · `chore:` · `docs:`

# Rattle — Claude Code Context

매장 손익 관리 앱 (Expo SDK 55 + React Native + TypeScript + Supabase)

**앱 목적**: 다매장 손익을 한 곳에서 관리.
매출(TossPos) · 매입(전자세금계산서/수기) · 비용 · 인건비(4대보험 자동계산) · 재고·발주·레시피 · 매장별 손익계산서 · 종합평가 & 인센티브
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
- 매장별 종합평가 점수 현황 및 인센티브 등급(GO/FO/O/P) 자동 산출
- 전 매장 직원 관리
- 인센티브 지급 내역
- 연동 설정 (TossPos, 전자세금계산서)

**종합평가 배점**: 목표 매출 달성률(20) · 인건비율(15) · 매출원가율(15) · 예상 매출 적중률(+5 가산) · 마케팅(20) · 청소(10) · 시설관리(10)

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
    evaluation.tsx             # 종합평가
    employees.tsx              # 직원 관리
    incentives.tsx             # 인센티브 내역
  orders/new.tsx, [id].tsx, ocr-review.tsx
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
    useEvaluation.ts           # 종합평가
  services/                   # DB 호출 전담 — 컴포넌트에서 supabase 직접 호출 금지
    ingredients.ts
    orders.ts
    recipes.ts                 # upsertRecipesFromCatalog 포함
    categories.ts
    stores.ts
    ocr.ts
    tossplace.ts               # Toss Place API 호출
    posAnalytics.ts            # 영업일 범위 계산, 일별/상품별 집계
    tossPlaceForm.ts           # Toss Place 가맹점 신청 폼 저장
    payroll.ts                 # 급여·4대보험·소득세 계산
    purchases.ts               # 매입 내역 CRUD
    profitLoss.ts              # 손익계산서 집계
    evaluation.ts              # 종합평가 CRUD
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
| `Evaluation` | store_id, year_month, 각 항목 점수, total_score, incentive_grade, incentive_amount |
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
| `ocr_results` | store_id, image_url, raw_text, parsed_items(JSONB), status |

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
| `evaluation` | store_id, year_month, 항목별 점수, total_score, incentive_grade, incentive_amount |

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

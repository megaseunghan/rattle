# Rattle — Claude Code Context

식당/매장 관리 앱 (Expo SDK 55 + React Native + TypeScript + Supabase)

**기능**: 발주(Orders) · 재고(Ingredients/Stock) · 레시피(Recipes, 원가/마진 자동계산) · 대시보드 · OCR 납품서 파싱 · **Toss Place POS 연동** (매출 조회 · 카탈로그 동기화 · 레시피 가져오기)

---

## 기술 스택

- Expo Router (파일 기반 라우팅, Stack + Tabs)
- Supabase (Auth + DB + Storage + Edge Functions), RLS 적용
- React Context (AuthContext) + 도메인별 custom hooks
- Toss Place Open API (`toss-proxy` Edge Function으로 프록시)

---

## 디렉토리 구조

```
app/
  _layout.tsx                  # Root: AuthProvider, 인증 분기
  (auth)/login.tsx, signup.tsx, select-store.tsx
  (tabs)/
    index.tsx                  # 홈 대시보드
    orders.tsx                 # 발주 목록
    stock.tsx                  # 재고 목록
    recipes.tsx                # 레시피 목록
    pos.tsx                    # Toss Place POS (매출·카탈로그 동기화)
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
    useTossSync.ts             # 카탈로그·주문 동기화 (syncOrders, syncCatalog, syncByDate, autoSync)
    usePosAnalytics.ts         # POS 일별 요약·상세 분석
  services/                   # DB 호출 전담 — 컴포넌트에서 supabase 직접 호출 금지
    ingredients.ts
    orders.ts
    recipes.ts                 # upsertRecipesFromCatalog 포함
    categories.ts
    stores.ts
    ocr.ts
    tossplace.ts               # Toss Place API 호출 (fetchTossOrders, fetchTossCatalog, saveCatalog)
    posAnalytics.ts            # 영업일 범위 계산, 일별/상품별 집계
    tossPlaceForm.ts           # Toss Place 가맹점 신청 폼 저장
  components/
    ErrorMessage.tsx
    LoadingSpinner.tsx
    CatalogImportModal.tsx     # 카탈로그 품목 선택 → 레시피 가져오기 모달

types/index.ts                 # 모든 타입 정의
constants/colors.ts            # 디자인 토큰
supabase/migrations/           # 마이그레이션 SQL
```

---

## 인증 & 라우팅 흐름

```
앱 시작 → user 없음 → /(auth)/login
        → user 있음 + store 없음 → /(auth)/select-store
        → user + store 있음 → /(tabs)/index
```

`useAuth()` → `{ user, session, store, loading, signOut, refreshStore }`
- `store`: owner_id 기준 첫 번째 매장 (toss_merchant_id, closing_time 포함)

---

## 개발 컨벤션

- **서비스 레이어**: DB 접근은 `lib/services/`에서만. 컴포넌트에서 supabase 직접 호출 금지
- **훅**: 도메인별 hook이 service를 wrapping
- **색상**: `Colors.*` 사용, 하드코딩 금지
- **에러/로딩**: `ErrorMessage`, `LoadingSpinner` 공통 컴포넌트 사용 (인라인 버튼 로딩은 `ActivityIndicator` 직접 사용)
- **새 도메인 추가 순서**: `types/index.ts` → `lib/services/` → `lib/hooks/` → `app/`
- **Toss API**: 모든 호출은 `toss-proxy` Edge Function 경유 (`tossProxyRequest` 헬퍼)

---

## 핵심 타입

| 타입 | 주요 필드 |
|------|-----------|
| `Store` | id, name, owner_id, toss_merchant_id, closing_time |
| `Order` | status: pending/confirmed/delivered |
| `OrderItem` | order_id, ingredient_id, quantity, unit_price |
| `Ingredient` | current_stock, min_stock, unit, last_price |
| `Recipe` | selling_price, cost, margin_rate(자동계산) |
| `RecipeIngredient` | recipe_id, ingredient_id, quantity |
| `OcrResult` | image_url, raw_text, parsed_items(JSONB) |
| `TossOrderItemOptionChoice` | title, code?, priceValue, quantity |
| `TossOrderItem` | itemId, itemName, categoryName, quantity, unitPrice, totalPrice, optionChoices[] |
| `TossOrder` | orderId, orderAt, totalAmount, status(COMPLETED/CANCELLED/REFUNDED), items[] |
| `TossCatalogItem` | itemId, itemName, categoryName, price, isAvailable |
| `TossOrderRecord` | DB row of toss_orders |
| `TossOrderItemRecord` | DB row of toss_order_items (category_name, option_choices 포함) |
| `TossCatalogEntry` | DB row of toss_catalog |
| `DailySummary` | date, dateFrom, dateTo, totalAmount, orderCount |
| `DailyItem` | itemId, itemName, categoryName, quantity, totalAmount |

---

## Supabase 스키마

### 기존 테이블

| 테이블 | 주요 컬럼 |
|--------|-----------|
| `stores` | id, owner_id, name, closing_time(TIME), toss_merchant_id, business_number, owner_phone, address |
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
| `toss_catalog` | id, store_id, item_id, item_name, category_name, price, is_available, synced_at — UNIQUE(store_id, item_id) |

### RPC 함수 (트랜잭션 보장)

| 함수 | 역할 |
|------|------|
| `create_order_with_items(store_id, supplier_name, order_date, items JSONB)` | 발주 + 항목 원자적 생성 → order_id |
| `create_recipe_with_ingredients(store_id, name, category, selling_price, ingredients JSONB)` | 레시피 + 재료 원자적 생성 → recipe_id |
| `deliver_order(order_id)` | delivered 처리 + 재고 자동 증가 + last_price 업데이트 |
| `upsert_toss_order_with_items(store_id, toss_order_id, order_at, total_amount, status, items JSONB)` | Toss 주문 + 상세항목 원자적 Upsert → internal UUID |

---

## Toss Place POS 연동 흐름

```
pos.tsx
  → useTossSync()
      → syncByDate(date)        # 특정 날짜 수동 동기화
      → autoSync()              # 오늘 데이터 없으면 자동 동기화
      → syncCatalog()           # 카탈로그 동기화 → toss_catalog 저장 → CatalogImportModal 오픈
  → usePosAnalytics()
      → fetchSummaries()        # 일별 요약 목록 (영업일 기준)
      → fetchDailyItems()       # 날짜별 상품 집계

CatalogImportModal
  → 카탈로그 품목 전체 체크리스트 (categoryName 기준 그룹핑)
  → 선택 확인 → upsertRecipesFromCatalog()
      → 동명 레시피 있으면 selling_price만 업데이트 (재료 보존)
      → 없으면 신규 insert (cost=0, margin_rate=0)

toss-proxy Edge Function
  → /merchants/{merchantId}/order/orders?from=&to=   # 주문 목록
  → /merchants/{merchantId}/catalog/items            # 카탈로그 품목
```

**영업일 기준**: `stores.closing_time`(기본 23:00) 기준으로 전날 closing_time ~ 당일 closing_time

---

## GitHub Flow

**레포**: https://github.com/megaseunghan/rattle | **기본 브랜치**: `main`

**main 보호**: force push 금지 · PR 필수 · Linear history (squash/rebase만)

**브랜치**: `feature/설명` · `fix/설명` · `refactor/설명`

**커밋**: `feat:` · `fix:` · `refactor:` · `chore:` · `docs:`

# Rattle — Claude Code Context

식당/매장 관리 앱 (Expo SDK 55 + React Native + TypeScript + Supabase)

**기능**: 발주(Orders) · 재고(Ingredients/Stock) · 레시피(Recipes, 원가/마진 자동계산) · 대시보드 · OCR 납품서 파싱

---

## 기술 스택

- Expo Router (파일 기반 라우팅, Stack + Tabs)
- Supabase (Auth + DB + Storage), RLS 적용
- React Context (AuthContext) + 도메인별 custom hooks

---

   ## 디렉토리 구조

```
app/
  _layout.tsx           # Root: AuthProvider, 인증 분기
  (auth)/login.tsx, select-store.tsx
  (tabs)/index.tsx, orders.tsx, stock.tsx, recipes.tsx
lib/
  supabase.ts           # 싱글턴 클라이언트
  contexts/AuthContext.tsx   # user, session, store, loading, signOut, refreshStore
  hooks/useDashboard.ts, useIngredients.ts, useOrders.ts, useRecipes.ts
  services/             # DB 호출 전담 (ingredients.ts, orders.ts, recipes.ts)
  components/ErrorMessage.tsx, LoadingSpinner.tsx
types/index.ts          # 모든 타입 정의
constants/colors.ts     # 디자인 토큰
supabase/               # 마이그레이션/스키마
```

---

## 인증 & 라우팅 흐름

```
앱 시작 → user 없음 → /(auth)/login
        → user 있음 + store 없음 → /(auth)/select-store
        → user + store 있음 → /(tabs)/index
```

`useAuth()` → `{ user, session, store, loading, signOut, refreshStore }` (store: owner_id 기준 첫 번째 매장)

---

## 개발 컨벤션

- **서비스 레이어**: DB 접근은 `lib/services/`에서만. 컴포넌트에서 supabase 직접 호출 금지
- **훅**: 도메인별 hook이 service를 wrapping
- **색상**: `Colors.*` 사용, 하드코딩 금지
- **에러/로딩**: `ErrorMessage`, `LoadingSpinner` 공통 컴포넌트 사용
- **새 도메인 추가 순서**: `types/index.ts` → `lib/services/` → `lib/hooks/` → `app/`

---

## 핵심 타입

| 타입 | 주요 필드 |
|------|-----------|
| `Store` | id, name, owner_id |
| `Order` | status: pending/confirmed/delivered |
| `OrderItem` | order_id, ingredient_id, quantity, unit_price |
| `Ingredient` | current_stock, min_stock, unit, last_price |
| `Recipe` | selling_price, cost, margin_rate(자동계산) |
| `RecipeIngredient` | recipe_id, ingredient_id, quantity |
| `OcrResult` | image_url, raw_text, parsed_items(JSONB) |

---

## Supabase 스키마

| 테이블 | 주요 컬럼 |
|--------|-----------|
| `stores` | id, owner_id, name |
| `ingredients` | store_id, name, category, current_stock, unit, min_stock, last_price |
| `orders` | store_id, supplier_name, order_date, total_amount, status |
| `order_items` | order_id, ingredient_id, quantity, unit, unit_price, subtotal |
| `recipes` | store_id, name, category, selling_price, cost, margin_rate |
| `recipe_ingredients` | recipe_id, ingredient_id, quantity, unit |
| `ocr_results` | store_id, image_url, raw_text, parsed_items(JSONB), status |

**RPC 함수** (트랜잭션 보장):
- `create_order_with_items(store_id, supplier_name, order_date, items JSONB)` → order_id
- `create_recipe_with_ingredients(store_id, name, category, selling_price, ingredients JSONB)` → recipe_id
- `deliver_order(order_id)` → delivered 처리 + 재고 자동 증가 + last_price 업데이트

---

## GitHub Flow

**레포**: https://github.com/megaseunghan/rattle | **기본 브랜치**: `main`

**main 보호**: force push 금지 · PR 필수 · Linear history (squash/rebase만)

**브랜치**: `feature/설명` · `fix/설명` · `refactor/설명`

**커밋**: `feat:` · `fix:` · `refactor:` · `chore:` · `docs:`

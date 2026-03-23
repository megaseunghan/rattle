# Rattle — Claude Code Context

식당/매장 관리 앱 (Expo + React Native + Supabase)

---

## 프로젝트 개요

소규모 식당/카페 사장님을 위한 모바일 관리 앱.
- **발주** 관리 (Orders)
- **재고** 관리 (Ingredients/Stock)
- **레시피** 관리 (Recipes + 원가/마진 자동 계산)
- **대시보드** (홈)
- **OCR** 납품서 파싱 (types에 정의됨, 구현 예정)

---

## 기술 스택

- **Framework**: Expo SDK 55 + Expo Router (파일 기반 라우팅)
- **Language**: TypeScript
- **Backend**: Supabase (Auth + DB + Storage)
- **State**: React Context (AuthContext) + custom hooks
- **Navigation**: expo-router (Stack + Tabs)

---

## 디렉토리 구조

```
rattle/
├── app/                        # 라우트 (expo-router)
│   ├── _layout.tsx             # Root: AuthProvider 감싸기, 인증 분기
│   ├── (auth)/
│   │   ├── login.tsx
│   │   ├── select-store.tsx    # 매장 선택/생성
│   │   └── _layout.tsx
│   └── (tabs)/
│       ├── _layout.tsx         # 탭 바 (홈/발주/재고/레시피)
│       ├── index.tsx           # 대시보드
│       ├── orders.tsx          # 발주 목록
│       ├── stock.tsx           # 재고 목록
│       └── recipes.tsx         # 레시피 목록
├── lib/
│   ├── supabase.ts             # Supabase 클라이언트 (싱글턴)
│   ├── contexts/
│   │   └── AuthContext.tsx     # user, session, store, loading, signOut, refreshStore
│   ├── hooks/
│   │   ├── useDashboard.ts
│   │   ├── useIngredients.ts
│   │   ├── useOrders.ts
│   │   └── useRecipes.ts
│   ├── services/               # Supabase DB 호출 로직
│   │   ├── ingredients.ts
│   │   ├── orders.ts
│   │   └── recipes.ts
│   └── components/
│       ├── ErrorMessage.tsx
│       └── LoadingSpinner.tsx
├── types/index.ts              # 모든 타입 정의 (Store, Order, Ingredient, Recipe 등)
├── constants/colors.ts         # 디자인 토큰
└── supabase/                   # DB 마이그레이션/스키마
```

---

## 핵심 타입 (`types/index.ts`)

| 타입 | 설명 |
|------|------|
| `Store` | 매장 (id, name, owner_id) |
| `Order` | 발주 (status: pending/confirmed/delivered) |
| `OrderItem` | 발주 항목 |
| `Ingredient` | 식자재/재고 (current_stock, min_stock) |
| `Recipe` | 레시피 (selling_price, cost, margin_rate 자동계산) |
| `RecipeIngredient` | 레시피 재료 매핑 |
| `OcrResult` / `OcrParsedItem` | OCR 납품서 파싱 결과 |

---

## 인증 & 라우팅 흐름

```
앱 시작
  → loading=true (AuthContext 초기화)
  → user 없음 → /(auth)/login
  → user 있음 + store 없음 → /(auth)/select-store
  → user + store 있음 → /(tabs)/index (대시보드)
```

- `useAuth()` 훅으로 어디서든 `{ user, session, store, loading, signOut, refreshStore }` 접근
- `store`는 `owner_id`로 조회, 한 유저당 첫 번째 매장 사용

---

## 개발 컨벤션

- **서비스 레이어**: DB 직접 접근은 `lib/services/` 에서만. 컴포넌트에서 supabase 직접 호출 금지
- **훅**: 각 도메인별 커스텀 훅 (`useOrders`, `useIngredients` 등)이 서비스 레이어를 wrapping
- **환경변수**: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (`.env` 파일)
- **색상**: `constants/colors.ts`의 `Colors.*` 사용. 하드코딩 금지
- **에러/로딩**: `ErrorMessage`, `LoadingSpinner` 공통 컴포넌트 사용

---

## 개발 명령어

```bash
npm start          # Expo dev server
npm run ios        # iOS 시뮬레이터
npm run android    # Android 에뮬레이터
```

---

## Supabase 스키마 (`supabase/schema.sql`)

| 테이블 | 주요 컬럼 |
|--------|-----------|
| `stores` | id, owner_id, name |
| `ingredients` | id, store_id, name, category, current_stock, unit, min_stock, last_price |
| `orders` | id, store_id, supplier_name, order_date, total_amount, status(pending/confirmed/delivered) |
| `order_items` | id, order_id, ingredient_id, quantity, unit, unit_price, subtotal |
| `recipes` | id, store_id, name, category, selling_price, cost, margin_rate |
| `recipe_ingredients` | id, recipe_id, ingredient_id, quantity, unit |
| `ocr_results` | id, store_id, image_url, raw_text, parsed_items(JSONB), status(processing/completed/failed) |

**RLS**: 모든 테이블에 적용. `owner_id = auth.uid()` 기반으로 본인 매장 데이터만 접근 가능.

**RPC 함수** (트랜잭션 보장):
- `create_order_with_items(store_id, supplier_name, order_date, items JSONB)` → order_id
- `create_recipe_with_ingredients(store_id, name, category, selling_price, ingredients JSONB)` → recipe_id
- `deliver_order(order_id)` → 상태를 delivered로 변경 + 재고 자동 증가 + last_price 업데이트

---

## 작업 시 주의사항

- 새 화면 추가 시 `app/` 아래 expo-router 파일 기반 라우팅 사용
- 새 도메인 기능 추가 시: `types/index.ts` → `lib/services/` → `lib/hooks/` → `app/` 순서
- OCR 기능은 타입만 정의됨, 미구현 상태

---

## GitHub Flow

**레포**: https://github.com/megaseunghan/rattle
**기본 브랜치**: `main` (항상 배포 가능 상태 유지)

### 브랜치 보호 규칙 (main)
- force push 금지
- 브랜치 삭제 금지
- Linear history 필수 (merge commit 금지 → squash or rebase)
- PR 필수 (직접 push 불가)

### 브랜치 네이밍
| 타입 | 형식 | 예시 |
|------|------|------|
| 기능 | `feature/설명` | `feature/order-form` |
| 버그 수정 | `fix/설명` | `fix/stock-negative` |
| 리팩토링 | `refactor/설명` | `refactor/auth-context` |

### 작업 흐름
```
1. main에서 브랜치 생성
   git checkout -b feature/my-feature

2. 작업 후 커밋 (작고 명확하게)

3. PR 생성 → main으로 머지
   gh pr create --title "feat: ..." --body "..."

4. 머지 후 브랜치 삭제
```

### 커밋 메시지 컨벤션
```
feat: 새 기능
fix: 버그 수정
refactor: 리팩토링
chore: 설정/의존성
docs: 문서
```

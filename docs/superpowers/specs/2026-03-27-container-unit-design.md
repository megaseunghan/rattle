# 컨테이너 단위 기능 설계

**날짜:** 2026-03-27
**상태:** 승인됨

---

## 배경 및 목적

현재 재고는 기본 단위(g, ml, 개)로만 표시된다. 발주 시 "고추장 10통"을 입력해도 재고에 "50,000g"으로 저장·표시되어 실제 사용자가 직관적으로 파악하기 어렵다.

**목표:** 구매 단위(컨테이너)와 기본 단위를 분리하여, 사용자에게는 컨테이너 단위로 표시하고 내부적으로는 기본 단위로 정확하게 관리한다.

---

## 데이터 모델

### ingredients 테이블 컬럼 추가

```sql
ALTER TABLE ingredients ADD COLUMN container_unit TEXT;    -- "통", "박스", "봉" 등
ALTER TABLE ingredients ADD COLUMN container_size NUMERIC; -- 1컨테이너 = N 기본단위
```

- `container_unit`, `container_size`는 선택 필드 (NULL 허용)
- 두 값 모두 설정된 경우에만 컨테이너 변환 활성화
- 내부 저장은 항상 기본단위, 변환은 앱/RPC 레이어에서만 처리

**예시:**

| name | unit | container_unit | container_size |
|------|------|----------------|----------------|
| 고추장 | g | 통 | 5000 |
| 간장 | ml | 통 | 640 |
| 소주 | 병 | (null) | (null) |
| 양파 | 개 | (null) | (null) |

### TypeScript 타입 변경

```ts
interface Ingredient {
  id: string;
  store_id: string;
  name: string;
  category: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  last_price: number;
  container_unit: string | null;   // 추가
  container_size: number | null;   // 추가
  created_at: string;
  updated_at: string;
}
```

---

## RPC 변경

### deliver_order

컨테이너 단위 설정 시 입고 수량에 container_size를 곱해 기본단위로 변환.

```sql
UPDATE ingredients i
SET
  current_stock = i.current_stock + v_item.quantity * COALESCE(i.container_size, 1),
  last_price    = v_item.unit_price,
  updated_at    = NOW()
WHERE i.id = v_item.ingredient_id;
```

`container_size`가 NULL이면 `COALESCE(..., 1)`로 기존 동작 그대로 유지.

### order_items.unit 저장 규칙

발주 저장 시 컨테이너 단위가 있는 식자재는 `order_items.unit`에 `container_unit`을 저장한다.

```
발주 이력 (변경 후): 고추장 10통 × 15,000원
발주 이력 (기존):    고추장 50,000g × 15,000원
```

---

## 서비스 레이어

### lib/services/ingredients.ts

- `createIngredient`, `updateIngredient`, `bulkCreateIngredients`에 `container_unit`, `container_size` 필드 포함

### lib/utils/unit.ts (신규)

```ts
// 컨테이너 단위 → 기본단위 변환
export function toBaseUnit(containerQty: number, ingredient: Ingredient): number {
  if (!ingredient.container_size) return containerQty;
  return containerQty * ingredient.container_size;
}

// 기본단위 → 컨테이너 단위 변환 (표시용)
export function toContainerUnit(baseQty: number, ingredient: Ingredient): number | null {
  if (!ingredient.container_size) return null;
  return baseQty / ingredient.container_size;
}

// 재고 표시 문자열 생성
// 예: "5.65통 (28,250g)" 또는 "28,250g"
export function formatStock(baseQty: number, ingredient: Ingredient): string {
  if (!ingredient.container_size || !ingredient.container_unit) {
    return `${baseQty}${ingredient.unit}`;
  }
  const containerQty = baseQty / ingredient.container_size;
  const display = Number.isInteger(containerQty) ? String(containerQty) : containerQty.toFixed(2);
  return `${display}${ingredient.container_unit} (${baseQty}${ingredient.unit})`;
}
```

---

## UI 변경사항

### 1. 식자재 수정 화면 신규 (app/stock/[id].tsx)

기존에 수정 화면이 없어 신규 생성. 재고 목록에서 식자재 탭 시 진입.

**폼 구성:**
```
[ 품목명 ]
[ 카테고리 ]         [ 단위 (기본) ]
[ 현재 재고 ]        [ 최소 재고 ]
[ 최근 단가 ]

─── 컨테이너 단위 설정 (선택) ───
💡 컨테이너 단위를 설정하면 발주·재고를
   더 직관적으로 관리할 수 있어요

[ 컨테이너 단위 ]    ← 텍스트 입력 (통/박스/봉 프리셋 칩)
[ 1 [단위] = ___ [기본단위] ]   ← 수량 입력
```

- 컨테이너 단위 미설정 시 섹션은 접혀있되 설정 유도 문구 표시
- 기존 식자재도 수정 가능 (null → 값 설정)

### 2. 식자재 등록 화면 (app/stock/new.tsx)

기존 폼에 컨테이너 단위 섹션 추가 (수정 화면과 동일 구성).

### 3. 재고 화면 (app/(tabs)/stock.tsx)

- 식자재 항목 탭 → `app/stock/[id].tsx` 이동
- 수량 표시: `formatStock()` 함수 적용
  - 컨테이너 있음: "5.65통 (28,250g)"
  - 컨테이너 없음: "28,250g" (기존 동작)

### 4. 발주 화면 (app/orders/new.tsx)

식자재 선택 후 수량 입력 시:
- 컨테이너 있음: 입력 단위 레이블을 `container_unit`으로 표시, 발주 저장 시 `order_items.unit = container_unit`
- 컨테이너 없음: 기존 동작 유지

---

## supabase/schema.sql 변경

1. `ingredients` 테이블 컬럼 추가 (ALTER TABLE)
2. `deliver_order` 함수 수정 (COALESCE 변환 로직)

---

## 범위 외

- 레시피 원가 계산: 내부적으로 기본단위 기준이므로 변경 불필요
- 단위 간 자동 환산 테이블 (g↔kg 등): 별도 기능으로 분리
- CSV 업로드: container_unit/container_size 컬럼 지원은 추후 확장

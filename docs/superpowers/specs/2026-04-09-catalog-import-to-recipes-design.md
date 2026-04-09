# 카탈로그 → 레시피 가져오기 기능 설계

**날짜:** 2026-04-09  
**상태:** 승인됨

---

## 개요

POS 탭의 카탈로그 동기화 버튼 클릭 후, Toss Place 카탈로그 전체 품목을 체크리스트로 보여주고 사용자가 선택한 품목을 레시피 목록에 추가하는 기능.

---

## 사용자 플로우

```
[POS 탭] 카탈로그 동기화 버튼 클릭
  → syncCatalog() — toss_catalog 저장 (기존 동작 유지)
  → 반환된 TossCatalogItem[] 전체를 CatalogImportModal에 전달
  → 모달 표시

[CatalogImportModal]
  - 전체 품목 목록 (category_name 기준으로 섹션 그룹핑)
  - 각 품목에 개별 체크박스
  - 전체 선택 / 전체 해제 버튼
  - 확인 버튼 클릭

  → upsertRecipesFromCatalog(storeId, selectedItems) 호출
  → 완료 알림 (몇 개 추가/업데이트됐는지 표시)
```

---

## 변경 파일

| 파일 | 변경 종류 | 내용 |
|------|----------|------|
| `lib/components/CatalogImportModal.tsx` | 신규 | 단일 단계 체크리스트 모달 |
| `lib/services/recipes.ts` | 수정 | `upsertRecipesFromCatalog` 함수 추가 |
| `app/(tabs)/pos.tsx` | 수정 | `handleSyncCatalog` 수정, 모달 state 추가 |

---

## CatalogImportModal 컴포넌트

**Props:**
```typescript
interface CatalogImportModalProps {
  visible: boolean;
  items: TossCatalogItem[];
  onConfirm: (selectedItems: TossCatalogItem[]) => Promise<void>;
  onClose: () => void;
}
```

**내부 상태:**
- `selectedIds: Set<string>` — 체크된 item_id 집합
- `importing: boolean` — 확인 버튼 로딩 상태

**UI 구조:**
- 헤더: "레시피로 가져오기" 제목 + 닫기 버튼
- 전체 선택/해제 버튼
- ScrollView: `category_name` 기준 섹션 헤더 + 품목 목록 (체크박스 + 이름 + 가격)
- 하단 고정: "확인 (N개)" 버튼

---

## upsertRecipesFromCatalog 서비스 함수

```typescript
export async function upsertRecipesFromCatalog(
  storeId: string,
  items: { name: string; category: string; sellingPrice: number }[]
): Promise<number>
```

**동작:**
- `recipes` 테이블에 대해 store_id + name으로 기존 레시피 조회
- 존재하면 `selling_price` 업데이트 (재료는 건드리지 않음)
- 없으면 신규 insert (`cost: 0`, `margin_rate: 0`)
- 처리된 레시피 수 반환

**중복 처리:** 같은 이름 레시피가 있으면 `selling_price`만 덮어쓰기 (재료, 원가 보존)

---

## 카탈로그 → 레시피 필드 매핑

| Toss Catalog | Recipe |
|-------------|--------|
| `itemName` | `name` |
| `categoryName` | `category` |
| `price` | `selling_price` |
| — | `cost`: 0 (재료 없음) |
| — | `margin_rate`: 0 |

---

## pos.tsx 변경

`handleSyncCatalog` 기존:
```
syncCatalog() → "완료" 알림
```

변경 후:
```
syncCatalog() → catalogItems state 저장 → CatalogImportModal visible=true
```

추가 state:
- `catalogItems: TossCatalogItem[]`
- `showCatalogImport: boolean`

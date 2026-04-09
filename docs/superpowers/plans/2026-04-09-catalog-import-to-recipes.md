# 카탈로그 → 레시피 가져오기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** POS 탭 카탈로그 동기화 후 전체 품목 체크리스트를 보여주고, 사용자가 선택한 품목을 레시피로 추가/업데이트하는 기능 구현

**Architecture:** `lib/services/recipes.ts`에 `upsertRecipesFromCatalog` 함수를 추가하고, `lib/components/CatalogImportModal.tsx` 신규 컴포넌트에 체크리스트 UI를 캡슐화한다. `pos.tsx`의 `handleSyncCatalog`는 기존 동기화 완료 알림 대신 모달을 열도록 수정한다.

**Tech Stack:** React Native (Modal, ScrollView, TouchableOpacity), Expo (Ionicons), Supabase JS client, TypeScript

---

### Task 1: `upsertRecipesFromCatalog` 서비스 함수 추가

**Files:**
- Modify: `lib/services/recipes.ts`

- [ ] **Step 1: `upsertRecipesFromCatalog` 함수를 `lib/services/recipes.ts` 끝에 추가**

```typescript
export async function upsertRecipesFromCatalog(
  storeId: string,
  items: { name: string; category: string; sellingPrice: number }[]
): Promise<number> {
  if (items.length === 0) return 0;

  // 1. 현재 매장의 레시피 이름 목록 조회
  const { data: existing, error: fetchError } = await supabase
    .from('recipes')
    .select('id, name')
    .eq('store_id', storeId);

  if (fetchError) throw new Error(fetchError.message);

  const existingMap = new Map((existing ?? []).map(r => [r.name, r.id]));

  const toUpdate = items.filter(i => existingMap.has(i.name));
  const toInsert = items.filter(i => !existingMap.has(i.name));

  // 2. 기존 레시피 selling_price 업데이트 (재료/원가는 보존)
  await Promise.all(
    toUpdate.map(i =>
      supabase
        .from('recipes')
        .update({ selling_price: i.sellingPrice })
        .eq('id', existingMap.get(i.name)!)
    )
  );

  // 3. 신규 레시피 삽입
  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from('recipes')
      .insert(
        toInsert.map(i => ({
          store_id: storeId,
          name: i.name,
          category: i.category,
          selling_price: i.sellingPrice,
          cost: 0,
          margin_rate: 0,
        }))
      );
    if (insertError) throw new Error(insertError.message);
  }

  return items.length;
}
```

- [ ] **Step 2: TypeScript 타입 검사**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add lib/services/recipes.ts
git commit -m "feat: upsertRecipesFromCatalog 서비스 함수 추가"
```

---

### Task 2: `CatalogImportModal` 컴포넌트 생성

**Files:**
- Create: `lib/components/CatalogImportModal.tsx`

- [ ] **Step 1: 파일 생성**

```typescript
import { useState, useMemo, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet,
  TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { TossCatalogItem } from '../../types';

interface CatalogImportModalProps {
  visible: boolean;
  items: TossCatalogItem[];
  onConfirm: (selectedItems: TossCatalogItem[]) => Promise<void>;
  onClose: () => void;
}

export function CatalogImportModal({ visible, items, onConfirm, onClose }: CatalogImportModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(items.map(i => i.itemId)));
  const [importing, setImporting] = useState(false);

  // items가 바뀔 때(모달 열릴 때) 전체 선택 초기화
  useEffect(() => {
    setSelectedIds(new Set(items.map(i => i.itemId)));
  }, [items]);

  // category_name 기준으로 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, TossCatalogItem[]>();
    for (const item of items) {
      const cat = item.categoryName || '미분류';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const allSelected = selectedIds.size === items.length;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(i => i.itemId)));
    }
  }

  function toggleItem(itemId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  async function handleConfirm() {
    const selected = items.filter(i => selectedIds.has(i.itemId));
    if (selected.length === 0) return;
    setImporting(true);
    try {
      await onConfirm(selected);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.gray600} />
          </TouchableOpacity>
          <Text style={styles.title}>레시피로 가져오기</Text>
          <TouchableOpacity onPress={toggleAll} style={styles.selectAllBtn}>
            <Text style={styles.selectAllText}>{allSelected ? '전체 해제' : '전체 선택'}</Text>
          </TouchableOpacity>
        </View>

        {/* 품목 목록 */}
        <ScrollView contentContainerStyle={styles.list}>
          {grouped.map(([category, catItems]) => (
            <View key={category}>
              <Text style={styles.categoryHeader}>{category}</Text>
              {catItems.map(item => {
                const checked = selectedIds.has(item.itemId);
                return (
                  <TouchableOpacity
                    key={item.itemId}
                    style={styles.itemRow}
                    onPress={() => toggleItem(item.itemId)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={checked ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={checked ? Colors.primary : Colors.gray300}
                    />
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>{item.itemName}</Text>
                      <Text style={styles.itemPrice}>{item.price.toLocaleString('ko-KR')}원</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </ScrollView>

        {/* 하단 확인 버튼 */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.confirmBtn, (importing || selectedIds.size === 0) && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={importing || selectedIds.size === 0}
          >
            {importing
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Text style={styles.confirmBtnText}>확인 ({selectedIds.size}개)</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  closeBtn: { padding: 4 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.black },
  selectAllBtn: { padding: 4 },
  selectAllText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  categoryHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.gray500,
    marginTop: 20,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.white,
    borderRadius: 10,
    padding: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  itemInfo: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontSize: 15, fontWeight: '500', color: Colors.black, flex: 1 },
  itemPrice: { fontSize: 14, color: Colors.gray500, marginLeft: 8 },
  footer: {
    padding: 16,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  confirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
```

- [ ] **Step 2: TypeScript 타입 검사**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add lib/components/CatalogImportModal.tsx
git commit -m "feat: CatalogImportModal 컴포넌트 추가"
```

---

### Task 3: `pos.tsx` 수정 — 모달 연동

**Files:**
- Modify: `app/(tabs)/pos.tsx`

- [ ] **Step 1: import 추가**

`pos.tsx` 상단 import 블록에 다음을 추가:

```typescript
import { CatalogImportModal } from '../../lib/components/CatalogImportModal';
import { upsertRecipesFromCatalog } from '../../lib/services/recipes';
import { TossCatalogItem } from '../../types';
```

- [ ] **Step 2: state 추가**

`PosScreen` 컴포넌트 내 기존 state 선언 블록 (`const [syncing, setSyncing] = useState(false);` 아래) 에 추가:

```typescript
const [catalogItems, setCatalogItems] = useState<TossCatalogItem[]>([]);
const [showCatalogImport, setShowCatalogImport] = useState(false);
```

- [ ] **Step 3: `handleSyncCatalog` 교체**

기존 함수:
```typescript
async function handleSyncCatalog() {
  setSyncingCatalog(true);
  try {
    await syncCatalog();
    Alert.alert('완료', '카탈로그가 동기화되었습니다.');
  } catch (e: any) {
    Alert.alert('카탈로그 동기화 실패', e.message);
  } finally {
    setSyncingCatalog(false);
  }
}
```

교체 후:
```typescript
async function handleSyncCatalog() {
  setSyncingCatalog(true);
  try {
    const items = await syncCatalog();
    setCatalogItems(items);
    setShowCatalogImport(true);
  } catch (e: any) {
    Alert.alert('카탈로그 동기화 실패', e.message);
  } finally {
    setSyncingCatalog(false);
  }
}
```

- [ ] **Step 4: `handleCatalogImportConfirm` 핸들러 추가**

`handleSyncCatalog` 아래에 추가:

```typescript
async function handleCatalogImportConfirm(selectedItems: TossCatalogItem[]) {
  if (!store) return;
  try {
    const count = await upsertRecipesFromCatalog(
      store.id,
      selectedItems.map(i => ({
        name: i.itemName,
        category: i.categoryName,
        sellingPrice: i.price,
      }))
    );
    setShowCatalogImport(false);
    Alert.alert('완료', `${count}개 품목이 레시피에 추가/업데이트되었습니다.`);
  } catch (e: any) {
    Alert.alert('레시피 추가 실패', e.message);
  }
}
```

- [ ] **Step 5: JSX에 `CatalogImportModal` 추가**

`</SafeAreaView>` 닫는 태그 바로 앞에 추가:

```tsx
<CatalogImportModal
  visible={showCatalogImport}
  items={catalogItems}
  onConfirm={handleCatalogImportConfirm}
  onClose={() => setShowCatalogImport(false)}
/>
```

- [ ] **Step 6: TypeScript 타입 검사**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add app/(tabs)/pos.tsx
git commit -m "feat: 카탈로그 동기화 후 레시피 가져오기 모달 연동"
```

---

## 완료 후 수동 검증 체크리스트

- [ ] POS 탭 → 카탈로그 동기화 버튼 탭 → 모달이 열림
- [ ] 모달에 카탈로그 품목이 카테고리별로 그룹핑되어 표시됨
- [ ] 전체 선택/해제 버튼이 동작함
- [ ] 개별 체크박스 토글이 동작함
- [ ] 확인 버튼에 선택된 개수가 표시됨
- [ ] 확인 후 레시피 탭에서 추가된 레시피 확인
- [ ] 이미 존재하는 이름의 레시피는 selling_price만 업데이트되고 재료는 보존됨
- [ ] 닫기(X) 버튼으로 모달 닫힘

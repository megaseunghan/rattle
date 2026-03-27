# 컨테이너 단위 기능 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 식자재에 컨테이너 단위(통/박스/봉)를 선택적으로 설정하여, 발주 입력과 재고 표시를 구매 단위 기준으로 직관적으로 보여준다.

**Architecture:** `ingredients` 테이블에 `container_unit`/`container_size` 컬럼을 추가하고, `deliver_order` RPC에서 입고 시 자동 변환한다. 내부 저장은 항상 기본단위, 표시·입력만 컨테이너 단위로 처리한다.

**Tech Stack:** Expo SDK 55, React Native, TypeScript, Supabase (PostgreSQL + RLS)

---

## 파일 맵

| 파일 | 작업 |
|------|------|
| `types/index.ts` | Ingredient 타입에 container_unit, container_size 추가 |
| `supabase/schema.sql` | ingredients 컬럼 추가 + deliver_order RPC 수정 |
| `lib/utils/unit.ts` | 신규 — formatStock, toBaseUnit 유틸리티 |
| `lib/services/ingredients.ts` | container 필드 CRUD 반영 |
| `lib/hooks/useIngredients.ts` | update 시그니처에 container 필드 추가 |
| `app/stock/new.tsx` | 컨테이너 단위 섹션 추가 |
| `app/stock/[id].tsx` | 신규 — 식자재 수정 화면 |
| `app/(tabs)/stock.tsx` | 식자재 탭 → 수정 화면 이동 + formatStock 표시 |
| `app/orders/new.tsx` | 발주 수량 단위 레이블 container_unit 반영 |

---

## Task 1: 타입 정의 업데이트

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Ingredient 인터페이스에 container 필드 추가**

`types/index.ts`의 Ingredient 인터페이스를 다음으로 교체:

```ts
export interface Ingredient {
  id: string;
  store_id: string;
  name: string;
  category: string;
  current_stock: number;
  unit: string;
  min_stock: number;
  last_price: number;
  container_unit: string | null;
  container_size: number | null;
  updated_at: string;
  created_at: string;
}
```

- [ ] **Step 2: 타입체크 확인**

```bash
npx tsc --noEmit
```

예상: 에러 0개 (새 필드를 아직 어디서도 사용 안 함)

- [ ] **Step 3: 커밋**

```bash
git add types/index.ts
git commit -m "feat: Ingredient 타입에 container_unit/container_size 추가"
```

---

## Task 2: DB 스키마 + RPC 업데이트

**Files:**
- Modify: `supabase/schema.sql`

- [ ] **Step 1: schema.sql 업데이트**

`supabase/schema.sql`의 ingredients 테이블 정의 다음 줄(CREATE TABLE ingredients 블록 직후)에 ALTER TABLE 추가:

```sql
-- 컨테이너 단위 (선택)
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS container_unit TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS container_size NUMERIC;
```

schema.sql의 `CREATE TABLE ingredients` 블록(line 15 근방)에도 컬럼 반영:

```sql
CREATE TABLE ingredients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT '기타',
  current_stock NUMERIC DEFAULT 0,
  unit TEXT DEFAULT 'g',
  min_stock NUMERIC DEFAULT 0,
  last_price NUMERIC DEFAULT 0,
  container_unit TEXT,
  container_size NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

- [ ] **Step 2: deliver_order RPC 수정**

schema.sql의 `deliver_order` 함수(line 282~318)에서 FOR 루프 SELECT와 UPDATE를 다음으로 교체:

```sql
  FOR v_item IN
    SELECT oi.ingredient_id, oi.quantity, oi.unit_price, i.container_size
    FROM order_items oi
    LEFT JOIN ingredients i ON i.id = oi.ingredient_id
    WHERE oi.order_id = p_order_id AND oi.ingredient_id IS NOT NULL
  LOOP
    UPDATE ingredients
    SET
      current_stock = current_stock + v_item.quantity * COALESCE(v_item.container_size, 1),
      last_price = v_item.unit_price,
      updated_at = now()
    WHERE id = v_item.ingredient_id;
  END LOOP;
```

- [ ] **Step 3: Supabase 대시보드에서 SQL 실행**

Supabase SQL Editor에서 아래 SQL 실행:

```sql
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS container_unit TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS container_size NUMERIC;
```

그 다음 `deliver_order` 함수도 교체 (schema.sql 전체 함수를 SQL Editor에 붙여넣어 실행).

- [ ] **Step 4: 커밋**

```bash
git add supabase/schema.sql
git commit -m "feat: ingredients 컨테이너 단위 컬럼 추가 및 deliver_order RPC 변환 로직 반영"
```

---

## Task 3: 유틸리티 함수 생성

**Files:**
- Create: `lib/utils/unit.ts`

- [ ] **Step 1: lib/utils/unit.ts 생성**

```ts
import { Ingredient } from '../../types';

export function toBaseUnit(containerQty: number, ingredient: Ingredient): number {
  if (!ingredient.container_size) return containerQty;
  return containerQty * ingredient.container_size;
}

export function toContainerUnit(baseQty: number, ingredient: Ingredient): number | null {
  if (!ingredient.container_size) return null;
  return baseQty / ingredient.container_size;
}

export function formatStock(baseQty: number, ingredient: Ingredient): string {
  if (!ingredient.container_size || !ingredient.container_unit) {
    return `${baseQty}${ingredient.unit}`;
  }
  const containerQty = baseQty / ingredient.container_size;
  const display = Number.isInteger(containerQty)
    ? String(containerQty)
    : containerQty.toFixed(2);
  return `${display}${ingredient.container_unit} (${baseQty}${ingredient.unit})`;
}

export function stockUnit(ingredient: Ingredient): string {
  return ingredient.container_unit ?? ingredient.unit;
}
```

- [ ] **Step 2: 타입체크 확인**

```bash
npx tsc --noEmit
```

예상: 에러 0개

- [ ] **Step 3: 커밋**

```bash
git add lib/utils/unit.ts
git commit -m "feat: 컨테이너 단위 변환/표시 유틸리티 추가"
```

---

## Task 4: 서비스 레이어 업데이트

**Files:**
- Modify: `lib/services/ingredients.ts`
- Modify: `lib/hooks/useIngredients.ts`

- [ ] **Step 1: updateIngredient 시그니처에 container 필드 추가**

`lib/services/ingredients.ts`의 `updateIngredient` 함수 시그니처 변경:

```ts
export async function updateIngredient(
  id: string,
  data: Partial<Pick<Ingredient, 'name' | 'category' | 'current_stock' | 'unit' | 'min_stock' | 'last_price' | 'container_unit' | 'container_size'>>
): Promise<Ingredient> {
```

- [ ] **Step 2: useIngredients 훅 시그니처 업데이트**

`lib/hooks/useIngredients.ts`의 `UseIngredientsResult` 인터페이스에서 update 타입 변경:

```ts
update: (id: string, data: Partial<Pick<Ingredient, 'name' | 'category' | 'current_stock' | 'unit' | 'min_stock' | 'last_price' | 'container_unit' | 'container_size'>>) => Promise<void>;
```

- [ ] **Step 3: 타입체크 확인**

```bash
npx tsc --noEmit
```

예상: 에러 0개

- [ ] **Step 4: 커밋**

```bash
git add lib/services/ingredients.ts lib/hooks/useIngredients.ts
git commit -m "feat: updateIngredient에 container 필드 지원 추가"
```

---

## Task 5: 식자재 등록 화면 업데이트

**Files:**
- Modify: `app/stock/new.tsx`

- [ ] **Step 1: container 상태 변수 추가**

`app/stock/new.tsx`의 state 선언부에 추가:

```ts
const [containerUnit, setContainerUnit] = useState('');
const [containerSize, setContainerSize] = useState('');
```

- [ ] **Step 2: handleSubmit에 container 필드 포함**

`create(...)` 호출 객체에 추가:

```ts
await create({
  store_id: store.id,
  name: name.trim(),
  category: category.trim() || '기타',
  unit: unit.trim(),
  current_stock: parseFloat(currentStock) || 0,
  min_stock: parseFloat(minStock) || 0,
  last_price: parseFloat(lastPrice) || 0,
  container_unit: containerUnit.trim() || null,
  container_size: containerSize ? parseFloat(containerSize) : null,
});
```

- [ ] **Step 3: 컨테이너 단위 섹션 UI 추가**

`styles.hint` View 바로 위에 컨테이너 단위 섹션 추가:

```tsx
<View style={styles.containerSection}>
  <Text style={styles.containerSectionTitle}>컨테이너 단위 설정</Text>
  <Text style={styles.containerHint}>
    💡 설정하면 발주·재고를 통/박스 단위로 표시할 수 있어요
  </Text>
  <View style={styles.row}>
    <View style={styles.halfField}>
      <Text style={styles.label}>컨테이너 단위</Text>
      <TextInput
        style={styles.input}
        value={containerUnit}
        onChangeText={setContainerUnit}
        placeholder="예) 통, 박스, 봉"
        placeholderTextColor={Colors.gray400}
      />
    </View>
    <View style={styles.halfField}>
      <Text style={styles.label}>1{containerUnit || '단위'} = ({unit})</Text>
      <TextInput
        style={styles.input}
        value={containerSize}
        onChangeText={setContainerSize}
        keyboardType="numeric"
        placeholder="예) 5000"
        placeholderTextColor={Colors.gray400}
      />
    </View>
  </View>
</View>
```

`StyleSheet.create`에 스타일 추가:

```ts
containerSection: {
  marginTop: 24,
  backgroundColor: Colors.bg,
  borderRadius: 12,
  padding: 14,
},
containerSectionTitle: {
  fontSize: 14,
  fontWeight: '700',
  color: Colors.dark,
  marginBottom: 4,
},
containerHint: {
  fontSize: 13,
  color: Colors.dark,
  marginBottom: 12,
  lineHeight: 18,
},
```

- [ ] **Step 4: 타입체크 확인**

```bash
npx tsc --noEmit
```

예상: 에러 0개

- [ ] **Step 5: 커밋**

```bash
git add app/stock/new.tsx
git commit -m "feat: 식자재 등록 화면에 컨테이너 단위 설정 추가"
```

---

## Task 6: 식자재 수정 화면 생성

**Files:**
- Create: `app/stock/[id].tsx`

- [ ] **Step 1: app/stock/[id].tsx 생성**

```tsx
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { Ingredient } from '../../types';

const UNIT_PRESETS = ['g', 'kg', '개', 'L', 'mL', '봉', '팩', '병'];
const CONTAINER_UNIT_PRESETS = ['통', '박스', '봉', '팩'];

export default function EditIngredientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, update } = useIngredients();

  const ingredient = data.find(i => i.id === id);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('g');
  const [currentStock, setCurrentStock] = useState('0');
  const [minStock, setMinStock] = useState('0');
  const [lastPrice, setLastPrice] = useState('0');
  const [containerUnit, setContainerUnit] = useState('');
  const [containerSize, setContainerSize] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (ingredient) {
      setName(ingredient.name);
      setCategory(ingredient.category);
      setUnit(ingredient.unit);
      setCurrentStock(String(ingredient.current_stock));
      setMinStock(String(ingredient.min_stock));
      setLastPrice(String(ingredient.last_price));
      setContainerUnit(ingredient.container_unit ?? '');
      setContainerSize(ingredient.container_size ? String(ingredient.container_size) : '');
    }
  }, [ingredient?.id]);

  if (!ingredient) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{ flex: 1 }} color={Colors.primary} />
      </SafeAreaView>
    );
  }

  async function handleSubmit() {
    if (!name.trim()) {
      Alert.alert('입력 오류', '식자재명을 입력해주세요.');
      return;
    }
    setSubmitting(true);
    try {
      await update(id!, {
        name: name.trim(),
        category: category.trim() || '기타',
        unit: unit.trim(),
        current_stock: parseFloat(currentStock) || 0,
        min_stock: parseFloat(minStock) || 0,
        last_price: parseFloat(lastPrice) || 0,
        container_unit: containerUnit.trim() || null,
        container_size: containerSize ? parseFloat(containerSize) : null,
      });
      router.back();
    } catch (e: any) {
      Alert.alert('오류', e.message ?? '수정에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 뒤로</Text>
        </TouchableOpacity>
        <Text style={styles.title}>식자재 수정</Text>
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.submitText}>{submitting ? '저장 중...' : '저장'}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.label}>식자재명 *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="예) 원두, 우유, 설탕"
            placeholderTextColor={Colors.gray400}
          />

          <Text style={styles.label}>카테고리</Text>
          <TextInput
            style={styles.input}
            value={category}
            onChangeText={setCategory}
            placeholder="예) 음료재료, 식품, 소모품"
            placeholderTextColor={Colors.gray400}
          />

          <Text style={styles.label}>단위 *</Text>
          <View style={styles.unitPresets}>
            {UNIT_PRESETS.map(u => (
              <TouchableOpacity
                key={u}
                style={[styles.unitChip, unit === u && styles.unitChipActive]}
                onPress={() => setUnit(u)}
              >
                <Text style={[styles.unitChipText, unit === u && styles.unitChipTextActive]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={[styles.input, styles.unitInput]}
            value={unit}
            onChangeText={setUnit}
            placeholder="직접 입력"
            placeholderTextColor={Colors.gray400}
          />

          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.label}>현재 재고</Text>
              <TextInput
                style={styles.input}
                value={currentStock}
                onChangeText={setCurrentStock}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Colors.gray400}
              />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.label}>품절 임박 기준</Text>
              <TextInput
                style={styles.input}
                value={minStock}
                onChangeText={setMinStock}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Colors.gray400}
              />
            </View>
          </View>

          <Text style={styles.label}>최근 단가 (원/{unit || '단위'})</Text>
          <TextInput
            style={styles.input}
            value={lastPrice}
            onChangeText={setLastPrice}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={Colors.gray400}
          />

          <View style={styles.containerSection}>
            <Text style={styles.containerSectionTitle}>컨테이너 단위 설정</Text>
            <Text style={styles.containerHint}>
              💡 설정하면 발주·재고를 통/박스 단위로 표시할 수 있어요
            </Text>
            <View style={styles.unitPresets}>
              {CONTAINER_UNIT_PRESETS.map(u => (
                <TouchableOpacity
                  key={u}
                  style={[styles.unitChip, containerUnit === u && styles.unitChipActive]}
                  onPress={() => setContainerUnit(containerUnit === u ? '' : u)}
                >
                  <Text style={[styles.unitChipText, containerUnit === u && styles.unitChipTextActive]}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>컨테이너 단위</Text>
                <TextInput
                  style={styles.input}
                  value={containerUnit}
                  onChangeText={setContainerUnit}
                  placeholder="예) 통, 박스, 봉"
                  placeholderTextColor={Colors.gray400}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>1{containerUnit || '단위'} = ({unit})</Text>
                <TextInput
                  style={styles.input}
                  value={containerSize}
                  onChangeText={setContainerSize}
                  keyboardType="numeric"
                  placeholder="예) 5000"
                  placeholderTextColor={Colors.gray400}
                />
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  back: { fontSize: 15, color: Colors.primary, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.black },
  submitBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 9,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.gray700, marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: Colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.gray200,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.black,
  },
  unitPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  unitChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  unitChipActive: { borderColor: Colors.primary, backgroundColor: Colors.bg },
  unitChipText: { fontSize: 14, color: Colors.gray600 },
  unitChipTextActive: { color: Colors.primary, fontWeight: '700' },
  unitInput: { marginTop: 0 },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  containerSection: {
    marginTop: 24,
    backgroundColor: Colors.bg,
    borderRadius: 12,
    padding: 14,
  },
  containerSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.dark,
    marginBottom: 4,
  },
  containerHint: {
    fontSize: 13,
    color: Colors.dark,
    marginBottom: 12,
    lineHeight: 18,
  },
});
```

- [ ] **Step 2: 타입체크 확인**

```bash
npx tsc --noEmit
```

예상: 에러 0개

- [ ] **Step 3: 커밋**

```bash
git add app/stock/[id].tsx
git commit -m "feat: 식자재 수정 화면 추가 (컨테이너 단위 포함)"
```

---

## Task 7: 재고 탭 업데이트

**Files:**
- Modify: `app/(tabs)/stock.tsx`

- [ ] **Step 1: formatStock import 추가**

`app/(tabs)/stock.tsx` 상단 import에 추가:

```ts
import { formatStock } from '../../lib/utils/unit';
```

- [ ] **Step 2: IngredientRow에 수정 화면 이동 추가**

`IngredientRow` props에 `onEdit` 추가:

```tsx
function IngredientRow({
  item,
  onUpdateStock,
  onDelete,
  onEdit,
}: {
  item: Ingredient;
  onUpdateStock: (id: string, stock: number) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}) {
```

- [ ] **Step 3: 품목명을 TouchableOpacity로 감싸서 수정 화면 이동**

`IngredientRow`의 `rowNameRow` View를 TouchableOpacity로 교체:

```tsx
<TouchableOpacity onPress={() => onEdit(item.id)} style={styles.rowNameRow}>
  <Text style={styles.rowName}>{item.name}</Text>
  {isLowStock && (
    <View style={styles.lowStockBadge}>
      <Text style={styles.lowStockText}>품절 임박</Text>
    </View>
  )}
</TouchableOpacity>
```

- [ ] **Step 4: 재고 표시에 formatStock 적용**

`stockValue` Text를 다음으로 교체:

```tsx
<TouchableOpacity onPress={() => setEditing(true)}>
  <Text style={[styles.stockValue, isLowStock && styles.stockValueLow]}>
    {formatStock(item.current_stock, item)}
  </Text>
</TouchableOpacity>
```

- [ ] **Step 5: IngredientRow 사용처에 onEdit 전달**

`StockScreen`의 `FlatList` renderItem에서 `onEdit` 추가:

```tsx
renderItem={({ item }) => (
  <IngredientRow
    item={item}
    onUpdateStock={(id, stock) => update(id, { current_stock: stock })}
    onDelete={remove}
    onEdit={(id) => router.push(`/stock/${id}`)}
  />
)}
```

- [ ] **Step 6: 타입체크 확인**

```bash
npx tsc --noEmit
```

예상: 에러 0개

- [ ] **Step 7: 커밋**

```bash
git add app/(tabs)/stock.tsx
git commit -m "feat: 재고 화면 컨테이너 단위 표시 및 수정 화면 이동 추가"
```

---

## Task 8: 발주 화면 업데이트

**Files:**
- Modify: `app/orders/new.tsx`

- [ ] **Step 1: stockUnit import 추가**

`app/orders/new.tsx` 상단 import에 추가:

```ts
import { stockUnit } from '../../lib/utils/unit';
```

- [ ] **Step 2: 발주 수량 입력 단위 레이블 업데이트**

`orders/new.tsx`의 `orderItemInputs` 중 수량 inputLabel을 변경:

```tsx
<Text style={styles.inputLabel}>수량 ({stockUnit(item.ingredient)})</Text>
```

- [ ] **Step 3: 발주 저장 시 unit 필드에 container_unit 반영**

`handleSubmit`의 items.map에서 unit 변경:

```ts
items.map(i => ({
  ingredient_id: i.ingredient.id,
  quantity: parseFloat(i.quantity) || 0,
  unit: i.ingredient.container_unit ?? i.ingredient.unit,
  unit_price: parseFloat(i.unit_price) || 0,
}))
```

- [ ] **Step 4: 타입체크 확인**

```bash
npx tsc --noEmit
```

예상: 에러 0개

- [ ] **Step 5: 커밋**

```bash
git add app/orders/new.tsx
git commit -m "feat: 발주 화면 컨테이너 단위 입력 반영"
```

---

## 완료 체크리스트

- [ ] `npx tsc --noEmit` 에러 0개
- [ ] Supabase 대시보드에서 ALTER TABLE SQL 실행 완료
- [ ] deliver_order RPC 업데이트 완료
- [ ] 식자재 등록 시 컨테이너 단위 설정 가능
- [ ] 기존 식자재 탭 → 수정 화면 → 컨테이너 단위 설정 가능
- [ ] 재고 화면에서 컨테이너 설정된 품목이 "5.65통 (28,250g)" 형식으로 표시
- [ ] 발주 수량 입력 단위가 container_unit으로 표시
- [ ] 입고 처리 시 재고가 기본단위로 올바르게 변환됨

# OCR 납품서 파싱 기능 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 영수증/납품서 사진 촬영 → Clova OCR 파싱 → 검토·수정 → 발주 자동 등록

**Architecture:** Supabase Edge Function은 Clova API 키 보관 + 프록시만 담당. 파싱·재고매칭·단가비교 등 모든 비즈니스 로직은 `lib/services/ocr.ts`에 집중하여 이식성 확보. 검토 화면(`app/orders/ocr-review.tsx`)에서 인라인 편집 후 기존 `useOrders().create()`로 발주 등록.

**Tech Stack:** expo-image-picker (카메라/갤러리), Supabase Edge Function (Deno), Naver Clova OCR API, Jest (서비스 유닛 테스트)

---

### Task 1: OcrLineItem 타입 추가

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: `types/index.ts`에 OcrLineItem 인터페이스 추가**

기존 `OcrParsedItem` 아래에 추가:

```typescript
export interface OcrLineItem {
  raw: string;                          // Clova 원본 텍스트 줄
  name: string;                         // 파싱된 품목명
  quantity: number;
  unit: string;
  unit_price: number;
  confidence: 'high' | 'low';           // low = 주황색 하이라이트
  matched_ingredient: Ingredient | null; // 재고 자동 매칭 결과
  match_candidates: Ingredient[];        // 후보 2개 이상일 때
  prev_price: number | null;            // 이전 발주 단가 (변동 표시용)
}
```

- [ ] **Step 2: 타입 체크**

```bash
npm run typecheck
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add types/index.ts
git commit -m "feat: OcrLineItem 타입 추가"
```

---

### Task 2: app.json 카메라 권한 추가

**Files:**
- Modify: `app.json`

- [ ] **Step 1: `app.json`의 plugins에 expo-image-picker 추가**

```json
"plugins": [
  "expo-router",
  "expo-font",
  ["expo-image-picker", { "cameraPermission": "납품서 촬영을 위해 카메라 접근이 필요합니다." }]
]
```

- [ ] **Step 2: 커밋**

```bash
git add app.json
git commit -m "chore: expo-image-picker 카메라 권한 설정"
```

---

### Task 3: Supabase Edge Function — Clova 프록시

**Files:**
- Create: `supabase/functions/ocr/index.ts`

이 파일은 Deno 런타임에서 동작합니다. Jest 테스트 불필요 (API 프록시만 담당, 로직 없음).

- [ ] **Step 1: `supabase/functions/ocr/index.ts` 생성**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { image_base64 } = await req.json();

    const clovaUrl = Deno.env.get('CLOVA_OCR_URL');
    const clovaKey = Deno.env.get('CLOVA_OCR_API_KEY');

    if (!clovaUrl || !clovaKey) {
      throw new Error('CLOVA_OCR_URL 또는 CLOVA_OCR_API_KEY 환경변수가 설정되지 않았습니다.');
    }

    const body = {
      version: 'V2',
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      images: [{ format: 'jpg', name: 'receipt', data: image_base64 }],
    };

    const clovaRes = await fetch(clovaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OCR-SECRET': clovaKey,
      },
      body: JSON.stringify(body),
    });

    if (!clovaRes.ok) {
      throw new Error(`Clova OCR 오류: ${clovaRes.status}`);
    }

    const clovaData = await clovaRes.json();

    // 텍스트 원본만 추출하여 반환 (파싱은 앱에서 처리)
    const fields = clovaData?.images?.[0]?.fields ?? [];
    const text = fields.map((f: { inferText: string }) => f.inferText).join('\n');

    return new Response(JSON.stringify({ text, fields }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/functions/ocr/index.ts
git commit -m "feat: Clova OCR Edge Function 프록시 추가"
```

---

### Task 4: OCR 파싱 서비스 (`lib/services/ocr.ts`)

**Files:**
- Create: `lib/services/ocr.ts`
- Create: `__tests__/services/ocr.test.ts`

- [ ] **Step 1: 테스트 파일 먼저 작성**

`__tests__/services/ocr.test.ts`:

```typescript
import { clovaTextToLineItems, callOcrEdgeFunction } from '../../lib/services/ocr';
import { Ingredient } from '../../types';

const mockIngredients: Ingredient[] = [
  {
    id: 'ing-1', store_id: 's1', name: '소주', category: '주류',
    current_stock: 10, unit: '병', min_stock: 5, last_price: 1500,
    updated_at: '', created_at: '',
  },
  {
    id: 'ing-2', store_id: 's1', name: '맥주', category: '주류',
    current_stock: 20, unit: '캔', min_stock: 10, last_price: 2000,
    updated_at: '', created_at: '',
  },
];

describe('clovaTextToLineItems', () => {
  it('표준 포맷 줄을 파싱한다', () => {
    const text = '소주 10병 1800';
    const items = clovaTextToLineItems(text, mockIngredients);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('소주');
    expect(items[0].quantity).toBe(10);
    expect(items[0].unit).toBe('병');
    expect(items[0].unit_price).toBe(1800);
    expect(items[0].confidence).toBe('high');
  });

  it('파싱 실패한 줄은 confidence low로 반환한다', () => {
    const text = '알 수 없는 텍스트!!!';
    const items = clovaTextToLineItems(text, mockIngredients);
    expect(items).toHaveLength(1);
    expect(items[0].confidence).toBe('low');
    expect(items[0].raw).toBe('알 수 없는 텍스트!!!');
  });

  it('재고에 있는 품목은 matched_ingredient가 설정된다', () => {
    const text = '소주 10병 1800';
    const items = clovaTextToLineItems(text, mockIngredients);
    expect(items[0].matched_ingredient).not.toBeNull();
    expect(items[0].matched_ingredient!.id).toBe('ing-1');
  });

  it('재고에 없는 품목은 matched_ingredient가 null이다', () => {
    const text = '김치 5kg 3000';
    const items = clovaTextToLineItems(text, mockIngredients);
    expect(items[0].matched_ingredient).toBeNull();
    expect(items[0].match_candidates).toHaveLength(0);
  });

  it('이전 단가와 다를 때 prev_price가 설정된다', () => {
    const text = '소주 10병 1800';
    const items = clovaTextToLineItems(text, mockIngredients);
    // 소주 last_price=1500, 파싱된 unit_price=1800
    expect(items[0].prev_price).toBe(1500);
  });

  it('이전 단가가 없으면 prev_price가 null이다', () => {
    const noPrice = mockIngredients.map(i => ({ ...i, last_price: 0 }));
    const text = '소주 10병 1800';
    const items = clovaTextToLineItems(text, noPrice);
    expect(items[0].prev_price).toBeNull();
  });

  it('빈 줄은 무시한다', () => {
    const text = '\n소주 10병 1800\n\n맥주 5캔 2000\n';
    const items = clovaTextToLineItems(text, mockIngredients);
    expect(items).toHaveLength(2);
  });

  it('단위 없는 줄도 파싱한다 (단위 기본값 "개")', () => {
    const text = '소주 10 1800';
    const items = clovaTextToLineItems(text, mockIngredients);
    expect(items[0].unit).toBe('개');
  });
});

describe('callOcrEdgeFunction', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('base64 이미지를 Edge Function에 전송하고 text를 반환한다', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ text: '소주 10병 1800', fields: [] }),
    });

    const result = await callOcrEdgeFunction('base64data', 'https://example.supabase.co', 'anon-key');
    expect(result).toBe('소주 10병 1800');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/ocr',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('Edge Function 오류 시 예외를 던진다', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(
      callOcrEdgeFunction('base64data', 'https://example.supabase.co', 'anon-key')
    ).rejects.toThrow('OCR 서버 오류: 500');
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
npm test -- __tests__/services/ocr.test.ts
```

Expected: FAIL (lib/services/ocr.ts 미존재)

- [ ] **Step 3: `lib/services/ocr.ts` 구현**

```typescript
import { Ingredient, OcrLineItem } from '../../types';

// 줄 파싱 정규식: "품목명 수량단위 금액" 또는 "품목명 수량 단위 금액"
// 예: "소주 10병 1800", "삼겹살 2kg 15000", "맥주 5 캔 2000"
const LINE_PATTERN = /^(.+?)\s+(\d+(?:\.\d+)?)\s*(개|병|캔|팩|봉|박스|kg|g|L|ml|장|묶음)?\s+(\d[\d,]*)$/;

export function clovaTextToLineItems(
  text: string,
  ingredients: Ingredient[]
): OcrLineItem[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  return lines.map((raw): OcrLineItem => {
    const match = raw.match(LINE_PATTERN);

    if (!match) {
      return {
        raw,
        name: raw,
        quantity: 1,
        unit: '개',
        unit_price: 0,
        confidence: 'low',
        matched_ingredient: null,
        match_candidates: [],
        prev_price: null,
      };
    }

    const name = match[1].trim();
    const quantity = parseFloat(match[2]);
    const unit = match[3] ?? '개';
    const unit_price = parseInt(match[4].replace(/,/g, ''), 10);

    // 재고 유사도 매칭 (includes 방식)
    const candidates = ingredients.filter(
      ing => ing.name.includes(name) || name.includes(ing.name)
    );
    const matched = candidates.length === 1 ? candidates[0] : null;
    const finalMatched = matched ?? (candidates.length > 0 ? null : null);

    // prev_price: 매칭된 재고의 last_price (0이면 null)
    const matchedForPrice = matched ?? candidates[0] ?? null;
    const prev_price =
      matchedForPrice && matchedForPrice.last_price > 0
        ? matchedForPrice.last_price
        : null;

    return {
      raw,
      name,
      quantity,
      unit,
      unit_price,
      confidence: 'high',
      matched_ingredient: finalMatched,
      match_candidates: candidates.length > 1 ? candidates : [],
      prev_price,
    };
  });
}

export async function callOcrEdgeFunction(
  imageBase64: string,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<string> {
  const res = await fetch(`${supabaseUrl}/functions/v1/ocr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ image_base64: imageBase64 }),
  });

  if (!res.ok) {
    throw new Error(`OCR 서버 오류: ${res.status}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text as string;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm test -- __tests__/services/ocr.test.ts
```

Expected: PASS (8개 테스트 통과)

- [ ] **Step 5: 타입 체크**

```bash
npm run typecheck
```

Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add lib/services/ocr.ts __tests__/services/ocr.test.ts
git commit -m "feat: OCR 파싱 서비스 구현 및 테스트"
```

---

### Task 5: OCR 검토 화면 (`app/orders/ocr-review.tsx`)

**Files:**
- Create: `app/orders/ocr-review.tsx`

이 화면은 UI 컴포넌트이므로 Jest 유닛 테스트 불필요. 수동 확인.

- [ ] **Step 1: `app/orders/ocr-review.tsx` 생성**

```typescript
import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Image, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useOrders } from '../../lib/hooks/useOrders';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { clovaTextToLineItems } from '../../lib/services/ocr';
import { OcrLineItem } from '../../types';

const UNITS = ['개', '병', '캔', '팩', '봉', '박스', 'kg', 'g', 'L', 'ml', '장', '묶음'];

export default function OcrReviewScreen() {
  const { imageUri, ocrText } = useLocalSearchParams<{ imageUri: string; ocrText: string }>();
  const { store } = useAuth();
  const { create } = useOrders();
  const { data: ingredients } = useIngredients();

  const [supplierName, setSupplierName] = useState('');
  const [orderDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<OcrLineItem[]>(() =>
    clovaTextToLineItems(ocrText ?? '', ingredients)
  );
  const [imageExpanded, setImageExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  function updateItem(index: number, patch: Partial<OcrLineItem>) {
    setItems(prev =>
      prev.map((item, i) =>
        i === index
          ? { ...item, ...patch, confidence: 'high' }
          : item
      )
    );
  }

  function removeItem(index: number) {
    setItems(prev => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    setItems(prev => [
      ...prev,
      {
        raw: '',
        name: '',
        quantity: 1,
        unit: '개',
        unit_price: 0,
        confidence: 'low',
        matched_ingredient: null,
        match_candidates: [],
        prev_price: null,
      },
    ]);
    setEditingIndex(items.length);
  }

  async function handleSubmit() {
    const validItems = items.filter(item => item.name.trim() && item.matched_ingredient);

    if (validItems.length === 0) {
      Alert.alert('등록 실패', '재고와 연결된 품목이 없어요. 품목을 선택하거나 재고에 먼저 추가해주세요.');
      return;
    }

    setSaving(true);
    try {
      await create(
        supplierName,
        orderDate,
        validItems.map(item => ({
          ingredient_id: item.matched_ingredient!.id,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
        }))
      );
      router.replace('/(tabs)/orders');
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setSaving(false);
    }
  }

  const unmatchedCount = items.filter(i => !i.matched_ingredient).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>납품서 검토</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 원본 이미지 토글 */}
        {imageUri && (
          <TouchableOpacity
            style={styles.imageToggle}
            onPress={() => setImageExpanded(prev => !prev)}
          >
            <Ionicons
              name={imageExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={Colors.gray500}
            />
            <Text style={styles.imageToggleText}>원본 이미지 {imageExpanded ? '접기' : '펼치기'}</Text>
          </TouchableOpacity>
        )}
        {imageExpanded && imageUri && (
          <Image source={{ uri: imageUri }} style={styles.receiptImage} resizeMode="contain" />
        )}

        {/* 거래처 및 날짜 */}
        <View style={styles.section}>
          <Text style={styles.label}>거래처</Text>
          <TextInput
            style={styles.input}
            value={supplierName}
            onChangeText={setSupplierName}
            placeholder="거래처명 입력"
            placeholderTextColor={Colors.gray400}
          />
          <Text style={styles.label}>발주일</Text>
          <Text style={styles.dateText}>{orderDate}</Text>
        </View>

        {/* 미매칭 안내 */}
        {unmatchedCount > 0 && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning-outline" size={14} color={Colors.warning} />
            <Text style={styles.warningText}>
              {unmatchedCount}개 품목이 재고와 연결되지 않았어요. 재고에서 찾거나 신규 등록하세요.
            </Text>
          </View>
        )}

        {/* 품목 목록 */}
        {items.map((item, index) => (
          <OcrItemRow
            key={index}
            item={item}
            isEditing={editingIndex === index}
            onEdit={() => setEditingIndex(index)}
            onBlur={() => setEditingIndex(null)}
            onChange={patch => updateItem(index, patch)}
            onRemove={() => removeItem(index)}
          />
        ))}

        <TouchableOpacity style={styles.addButton} onPress={addItem}>
          <Text style={styles.addButtonText}>+ 항목 추가</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 발주 등록 버튼 */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitButton, saving && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.submitText}>발주 등록 ({items.filter(i => i.matched_ingredient).length}개)</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function OcrItemRow({
  item,
  isEditing,
  onEdit,
  onBlur,
  onChange,
  onRemove,
}: {
  item: OcrLineItem;
  isEditing: boolean;
  onEdit: () => void;
  onBlur: () => void;
  onChange: (patch: Partial<OcrLineItem>) => void;
  onRemove: () => void;
}) {
  const isLowConfidence = item.confidence === 'low';
  const hasPriceChange = item.prev_price !== null && item.prev_price !== item.unit_price;
  const priceChangePct = hasPriceChange
    ? (((item.unit_price - item.prev_price!) / item.prev_price!) * 100).toFixed(1)
    : null;

  return (
    <View style={[styles.itemRow, isLowConfidence && styles.itemRowLow]}>
      {/* 품목명 */}
      <View style={styles.itemNameRow}>
        {isEditing ? (
          <TextInput
            style={styles.itemInput}
            value={item.name}
            onChangeText={name => onChange({ name })}
            onBlur={onBlur}
            autoFocus
            placeholder="품목명"
            placeholderTextColor={Colors.gray400}
          />
        ) : (
          <TouchableOpacity onPress={onEdit} style={styles.itemNameTouchable}>
            <Text style={styles.itemName}>{item.name || '(품목명 없음)'}</Text>
          </TouchableOpacity>
        )}

        {/* 재고 매칭 뱃지 */}
        {item.matched_ingredient ? (
          <View style={styles.matchBadge}>
            <Text style={styles.matchBadgeText}>✓ {item.matched_ingredient.name}</Text>
          </View>
        ) : item.match_candidates.length > 0 ? (
          <View style={styles.candidateBadge}>
            <Text style={styles.candidateBadgeText}>후보 {item.match_candidates.length}개</Text>
          </View>
        ) : (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>신규</Text>
          </View>
        )}

        <TouchableOpacity onPress={onRemove} style={styles.removeBtn}>
          <Text style={styles.removeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* 수량 / 단위 / 단가 */}
      <View style={styles.itemDetails}>
        <TextInput
          style={styles.detailInput}
          value={String(item.quantity)}
          onChangeText={v => onChange({ quantity: parseFloat(v) || 0 })}
          keyboardType="numeric"
          placeholder="수량"
          placeholderTextColor={Colors.gray400}
        />
        {/* 단위 칩 */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.unitChips}>
          {UNITS.map(u => (
            <TouchableOpacity
              key={u}
              style={[styles.unitChip, item.unit === u && styles.unitChipActive]}
              onPress={() => onChange({ unit: u })}
            >
              <Text style={[styles.unitChipText, item.unit === u && styles.unitChipTextActive]}>
                {u}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TextInput
          style={styles.detailInput}
          value={String(item.unit_price)}
          onChangeText={v => onChange({ unit_price: parseInt(v.replace(/,/g, ''), 10) || 0 })}
          keyboardType="numeric"
          placeholder="단가"
          placeholderTextColor={Colors.gray400}
        />
      </View>

      {/* 단가 변동 표시 */}
      {hasPriceChange && (
        <View style={styles.priceChange}>
          <Ionicons name="warning-outline" size={12} color={Colors.warning} />
          <Text style={styles.priceChangeText}>
            이전 {item.prev_price!.toLocaleString('ko-KR')}원{' '}
            {Number(priceChangePct) > 0 ? '+' : ''}{priceChangePct}%
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
  },
  title: { fontSize: 18, fontWeight: '700', color: Colors.black },
  scroll: { padding: 16, paddingBottom: 100 },
  imageToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 4,
  },
  imageToggleText: { fontSize: 14, color: Colors.gray500 },
  receiptImage: { width: '100%', height: 240, borderRadius: 12, marginBottom: 12 },
  section: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: Colors.gray100,
  },
  label: { fontSize: 12, color: Colors.gray500, marginBottom: 4, marginTop: 8 },
  input: {
    fontSize: 15, color: Colors.black, borderBottomWidth: 1,
    borderBottomColor: Colors.gray200, paddingVertical: 6,
  },
  dateText: { fontSize: 15, color: Colors.gray700, paddingVertical: 6 },
  warningBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.warning + '15', borderRadius: 10, padding: 12, marginBottom: 12,
  },
  warningText: { flex: 1, fontSize: 13, color: Colors.warning },
  itemRow: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.gray100,
  },
  itemRowLow: { borderColor: Colors.warning + '80', backgroundColor: Colors.warning + '08' },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  itemNameTouchable: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '600', color: Colors.black },
  itemInput: {
    flex: 1, fontSize: 15, fontWeight: '600', color: Colors.black,
    borderBottomWidth: 1, borderBottomColor: Colors.primary, paddingVertical: 2,
  },
  matchBadge: {
    backgroundColor: Colors.success + '20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  matchBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.success },
  candidateBadge: {
    backgroundColor: Colors.warning + '20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  candidateBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.warning },
  newBadge: {
    backgroundColor: Colors.gray100, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  newBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.gray500 },
  removeBtn: { padding: 4 },
  removeBtnText: { fontSize: 14, color: Colors.gray400 },
  itemDetails: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailInput: {
    width: 64, fontSize: 14, fontWeight: '600', color: Colors.black,
    borderBottomWidth: 1, borderBottomColor: Colors.gray200, textAlign: 'center', paddingVertical: 4,
  },
  unitChips: { flex: 1 },
  unitChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.gray200, marginRight: 6, backgroundColor: Colors.white,
  },
  unitChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  unitChipText: { fontSize: 12, fontWeight: '600', color: Colors.gray500 },
  unitChipTextActive: { color: Colors.white },
  priceChange: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8,
  },
  priceChangeText: { fontSize: 12, color: Colors.warning },
  addButton: {
    borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10, borderStyle: 'dashed',
    padding: 14, alignItems: 'center', marginTop: 4,
  },
  addButtonText: { fontSize: 14, color: Colors.gray500, fontWeight: '600' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, backgroundColor: Colors.white,
    borderTopWidth: 1, borderTopColor: Colors.gray100,
  },
  submitButton: {
    backgroundColor: Colors.primary, borderRadius: 12, padding: 16, alignItems: 'center',
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
```

- [ ] **Step 2: 타입 체크**

```bash
npm run typecheck
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/orders/ocr-review.tsx
git commit -m "feat: OCR 검토 화면 구현"
```

---

### Task 6: 대시보드 영수증 촬영 버튼 연결

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: `app/(tabs)/index.tsx` 상단에 import 추가**

기존 import 블록 끝에 추가:

```typescript
import * as ImagePicker from 'expo-image-picker';
import { EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY } from '@env';
import { callOcrEdgeFunction } from '../../lib/services/ocr';
```

단, Expo 환경에서는 `process.env`를 사용합니다. 상수 대신 다음과 같이 변경:

```typescript
import * as ImagePicker from 'expo-image-picker';
import { callOcrEdgeFunction } from '../../lib/services/ocr';
```

- [ ] **Step 2: `HomeScreen` 컴포넌트 안에 `handleScanReceipt` 함수 추가**

`useFocusEffect` 바로 아래에 삽입:

```typescript
const [scanning, setScanning] = useState(false);

async function handleScanReceipt() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('권한 필요', '카메라 권한이 필요합니다. 설정에서 허용해주세요.');
    return;
  }

  const result = await ImagePicker.launchCameraAsync({
    base64: true,
    quality: 0.8,
  });

  if (result.canceled || !result.assets[0].base64) return;

  const { uri, base64 } = result.assets[0];
  setScanning(true);
  try {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    const ocrText = await callOcrEdgeFunction(base64, supabaseUrl, supabaseKey);
    router.push({
      pathname: '/orders/ocr-review',
      params: { imageUri: uri, ocrText },
    });
  } catch (e: any) {
    Alert.alert('OCR 오류', e.message);
  } finally {
    setScanning(false);
  }
}
```

- [ ] **Step 3: `useState` import에 `Alert` 추가 확인 및 QuickAction에 onPress 연결**

`app/(tabs)/index.tsx`의 React Native import 줄에 `Alert`가 없으면 추가:

```typescript
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
```

영수증 촬영 QuickAction에 `onPress` 연결:

```typescript
<QuickAction
  icon={scanning ? 'hourglass-outline' : 'camera-outline'}
  label={scanning ? '분석 중...' : '영수증 촬영'}
  onPress={handleScanReceipt}
/>
```

- [ ] **Step 4: 타입 체크**

```bash
npm run typecheck
```

Expected: 에러 없음

- [ ] **Step 5: 전체 테스트**

```bash
npm test
```

Expected: 기존 테스트 포함 전체 PASS

- [ ] **Step 6: 커밋**

```bash
git add app/(tabs)/index.tsx
git commit -m "feat: 대시보드 영수증 촬영 버튼 OCR 연결"
```

---

### Task 7: PR 생성 및 사전 준비 안내

- [ ] **Step 1: PR 생성**

```bash
gh pr create --title "feat: OCR 납품서 파싱 기능 구현" --body "$(cat <<'EOF'
## Summary
- Naver Clova OCR API 연동을 위한 Supabase Edge Function 프록시 추가
- OCR 텍스트 파싱 + 재고 자동 매칭 + 단가 비교 서비스 구현 (`lib/services/ocr.ts`)
- 납품서 검토·수정 화면 구현 (`app/orders/ocr-review.tsx`)
- 대시보드 영수증 촬영 버튼 → 카메라 → OCR → 검토 화면 흐름 연결

## Test plan
- [ ] `npm test` 전체 통과 확인
- [ ] iOS 시뮬레이터에서 영수증 촬영 버튼 탭 → 카메라 실행 확인
- [ ] OCR 결과 검토 화면에서 품목 인라인 편집, 삭제, 추가 동작 확인
- [ ] 신뢰도 낮은(low) 항목 주황색 테두리 표시 확인
- [ ] 재고 매칭된 항목 녹색 뱃지, 미매칭 "신규" 뱃지 확인
- [ ] 단가 변동 % 표시 확인
- [ ] 원본 이미지 접기/펼치기 확인
- [ ] 발주 등록 후 발주 목록 화면으로 이동 확인

## 사전 준비 (개발자 직접)
- Naver Cloud Platform 계정 생성 + Clova OCR 서비스 신청 → API URL + Secret Key 발급
- `supabase secrets set CLOVA_OCR_URL=<url> CLOVA_OCR_API_KEY=<key>`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## 스펙 커버리지 확인

| 스펙 섹션 | 대응 태스크 |
|-----------|------------|
| 전체 아키텍처 (Edge Function 프록시) | Task 3 |
| OcrLineItem 타입 | Task 1 |
| 카메라/갤러리 연결 | Task 6 |
| 파싱 로직 (정규식, 매칭, prev_price) | Task 4 |
| 검토 화면 (인라인 편집, 신뢰도, 매칭, 단가비교, 이미지 토글) | Task 5 |
| 발주 등록 (useOrders().create() 재사용) | Task 5 |
| app.json 카메라 권한 | Task 2 |
| PR 생성 | Task 7 |

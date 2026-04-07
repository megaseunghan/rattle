# POS 일별 결제 내역 자동/수동 동기화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toss Place 마감 시간 기준 일별 결제 내역 자동 동기화 + 수동 날짜 조회 + 상품별 집계 화면 구현

**Architecture:** `stores.closing_time` 기준으로 영업일 단위 날짜 범위를 계산하고, `toss_sales` 테이블에 upsert한다. 일별 상세 화면에서 `toss_catalog`와 조인해 카테고리 필터가 있는 상품별 집계 목록을 표시한다.

**Tech Stack:** Expo SDK 55, React Native, TypeScript, Supabase

---

## File Map

| 파일 | 작업 |
|------|------|
| `supabase/migrations/20260407_pos_catalog.sql` | 신규 — closing_time + toss_catalog 마이그레이션 |
| `types/index.ts` | 수정 — Store에 closing_time 추가, DailySummary/DailyItem/TossCatalogEntry 타입 추가 |
| `lib/services/tossplace.ts` | 수정 — saveCatalog() 추가 |
| `lib/services/posAnalytics.ts` | 신규 — getBusinessDayRange, getDailySummaries, getDailyItems |
| `lib/hooks/useTossSync.ts` | 수정 — autoSync(), syncByDate() 추가 |
| `lib/hooks/usePosAnalytics.ts` | 신규 — 일별 요약/상세 상태 관리 |
| `app/settings/profile.tsx` | 수정 — closing_time 입력 필드 추가 |
| `app/_layout.tsx` | 수정 — AppState foreground 시 autoSync 트리거 |
| `app/(tabs)/pos.tsx` | 수정 — 메인 화면 재구성 |
| `app/pos/[date].tsx` | 신규 — 일별 상세 화면 (상품 집계 + 카테고리 필터) |

---

## Task 1: DB 마이그레이션

**Files:**
- Create: `supabase/migrations/20260407_pos_catalog.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- stores 테이블에 마감 시간 추가
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS closing_time TIME DEFAULT '23:00';

-- Toss Place 카탈로그 테이블 생성
CREATE TABLE IF NOT EXISTS toss_catalog (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  item_id       TEXT NOT NULL,
  item_name     TEXT NOT NULL,
  category_name TEXT NOT NULL DEFAULT '',
  price         INTEGER NOT NULL DEFAULT 0,
  is_available  BOOLEAN NOT NULL DEFAULT true,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, item_id)
);

ALTER TABLE toss_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "toss_catalog: store owner only"
  ON toss_catalog
  USING (
    store_id IN (
      SELECT id FROM stores WHERE owner_id = auth.uid()
    )
  );
```

- [ ] **Step 2: 원격 DB에 적용**

Supabase 대시보드 SQL Editor에서 위 SQL을 실행하거나, CLI로 적용:
```bash
supabase db push
```

---

## Task 2: 타입 추가 (types/index.ts)

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Store 인터페이스에 closing_time 추가**

`Store` 인터페이스에 아래 필드 추가:
```typescript
closing_time?: string | null;  // 'HH:MM' 형식, 예: '23:00'
```

- [ ] **Step 2: 신규 타입 추가**

`types/index.ts` 파일 최하단에 추가:
```typescript
// Toss Place 카탈로그 (DB row)
export interface TossCatalogEntry {
  id: string;
  store_id: string;
  item_id: string;
  item_name: string;
  category_name: string;
  price: number;
  is_available: boolean;
  synced_at: string;
}

// POS 일별 요약
export interface DailySummary {
  date: string;       // 'YYYY-MM-DD' (영업일 기준 날짜 레이블)
  dateFrom: string;   // ISO — 영업일 시작 (전날 closing_time)
  dateTo: string;     // ISO — 영업일 종료 (당일 closing_time)
  totalAmount: number;
  orderCount: number;
}

// POS 상품별 집계 (일별 상세)
export interface DailyItem {
  itemId: string;
  itemName: string;
  categoryName: string;  // 카탈로그 미동기화 시 ''
  quantity: number;
  totalAmount: number;
}
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit 2>&1; echo "exit:$?"
```
Expected: `exit:0`

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260407_pos_catalog.sql types/index.ts
git commit -m "feat: POS 카탈로그 마이그레이션 및 타입 추가"
```

---

## Task 3: saveCatalog() 추가 (lib/services/tossplace.ts)

**Files:**
- Modify: `lib/services/tossplace.ts`

- [ ] **Step 1: import 추가**

파일 상단 import에 `TossCatalogItem` 이미 있으므로 `supabase` import 확인 후,
파일 최하단에 아래 함수 추가:

```typescript
export async function saveCatalog(
  storeId: string,
  items: TossCatalogItem[]
): Promise<void> {
  if (items.length === 0) return;

  const rows = items.map(item => ({
    store_id: storeId,
    item_id: item.itemId,
    item_name: item.itemName,
    category_name: item.categoryName,
    price: item.price,
    is_available: item.isAvailable,
    synced_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('toss_catalog')
    .upsert(rows, { onConflict: 'store_id,item_id' });

  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit 2>&1; echo "exit:$?"
```
Expected: `exit:0`

- [ ] **Step 3: 커밋**

```bash
git add lib/services/tossplace.ts
git commit -m "feat: tossplace saveCatalog() 추가"
```

---

## Task 4: posAnalytics 서비스 신규 (lib/services/posAnalytics.ts)

**Files:**
- Create: `lib/services/posAnalytics.ts`

- [ ] **Step 1: 파일 생성**

```typescript
import { supabase } from '../supabase';
import { DailySummary, DailyItem, TossOrderItem } from '../../types';

/** 영업일 날짜 레이블 계산
 * closing_time이 23:00이면 23:00 이후 주문은 다음 날 영업일로 분류
 */
function getBusinessDateLabel(orderAt: Date, closingHour: number, closingMin: number): string {
  const orderMins = orderAt.getHours() * 60 + orderAt.getMinutes();
  const closingMins = closingHour * 60 + closingMin;

  const label = new Date(orderAt);
  if (orderMins >= closingMins) {
    label.setDate(label.getDate() + 1);
  }
  return label.toISOString().slice(0, 10);
}

/** 특정 날짜의 영업일 범위 반환
 * date 'YYYY-MM-DD' → { from: 전날 closingTime ISO, to: 당일 closingTime ISO }
 */
export function getBusinessDayRange(
  date: string,
  closingTime: string
): { from: string; to: string } {
  const [h, m] = closingTime.split(':').map(Number);

  const to = new Date(date);
  to.setHours(h, m, 0, 0);

  const from = new Date(date);
  from.setDate(from.getDate() - 1);
  from.setHours(h, m, 0, 0);

  return { from: from.toISOString(), to: to.toISOString() };
}

/** 오늘 기준 자동 동기화용 범위: 전날 closingTime ~ 지금 */
export function getAutoSyncRange(closingTime: string): { from: string; to: string } {
  const [h, m] = closingTime.split(':').map(Number);

  const from = new Date();
  from.setDate(from.getDate() - 1);
  from.setHours(h, m, 0, 0);

  return { from: from.toISOString(), to: new Date().toISOString() };
}

/** 최근 N일 영업일 요약 목록 */
export async function getDailySummaries(
  storeId: string,
  closingTime: string,
  days: number = 14
): Promise<DailySummary[]> {
  const [h, m] = closingTime.split(':').map(Number);

  const earliest = new Date();
  earliest.setDate(earliest.getDate() - days);
  earliest.setHours(h, m, 0, 0);

  const { data, error } = await supabase
    .from('toss_sales')
    .select('order_at, total_amount, status')
    .eq('store_id', storeId)
    .eq('status', 'COMPLETED')
    .gte('order_at', earliest.toISOString())
    .order('order_at', { ascending: false });

  if (error) throw new Error(error.message);

  const dayMap = new Map<string, DailySummary>();

  for (const sale of data ?? []) {
    const orderAt = new Date(sale.order_at);
    const dateLabel = getBusinessDateLabel(orderAt, h, m);
    const { from, to } = getBusinessDayRange(dateLabel, closingTime);

    if (!dayMap.has(dateLabel)) {
      dayMap.set(dateLabel, {
        date: dateLabel,
        dateFrom: from,
        dateTo: to,
        totalAmount: 0,
        orderCount: 0,
      });
    }

    const day = dayMap.get(dateLabel)!;
    day.totalAmount += Number(sale.total_amount);
    day.orderCount += 1;
  }

  return Array.from(dayMap.values()).sort((a, b) => b.date.localeCompare(a.date));
}

/** 특정 영업일 범위의 상품별 집계 */
export async function getDailyItems(
  storeId: string,
  dateFrom: string,
  dateTo: string
): Promise<DailyItem[]> {
  const [salesRes, catalogRes] = await Promise.all([
    supabase
      .from('toss_sales')
      .select('items')
      .eq('store_id', storeId)
      .eq('status', 'COMPLETED')
      .gte('order_at', dateFrom)
      .lt('order_at', dateTo),

    supabase
      .from('toss_catalog')
      .select('item_id, category_name')
      .eq('store_id', storeId),
  ]);

  if (salesRes.error) throw new Error(salesRes.error.message);

  // itemId → categoryName 맵
  const catalogMap = new Map<string, string>();
  for (const row of catalogRes.data ?? []) {
    catalogMap.set(row.item_id, row.category_name);
  }

  // 상품별 집계
  const itemMap = new Map<string, DailyItem>();

  for (const sale of salesRes.data ?? []) {
    const items: TossOrderItem[] = sale.items ?? [];
    for (const item of items) {
      const key = item.itemId || item.itemName;
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          itemId: item.itemId,
          itemName: item.itemName,
          categoryName: catalogMap.get(item.itemId) ?? '',
          quantity: 0,
          totalAmount: 0,
        });
      }
      const agg = itemMap.get(key)!;
      agg.quantity += item.quantity;
      agg.totalAmount += item.totalPrice;
    }
  }

  return Array.from(itemMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit 2>&1; echo "exit:$?"
```
Expected: `exit:0`

- [ ] **Step 3: 커밋**

```bash
git add lib/services/posAnalytics.ts
git commit -m "feat: posAnalytics 서비스 추가 (영업일 범위 계산, 일별 요약/상품 집계)"
```

---

## Task 5: useTossSync 업데이트

**Files:**
- Modify: `lib/hooks/useTossSync.ts`

- [ ] **Step 1: import 추가**

파일 상단에 추가:
```typescript
import { getAutoSyncRange } from '../services/posAnalytics';
```

- [ ] **Step 2: 상태 및 헬퍼 추가**

`useTossSync` 함수 내 기존 상태 선언 아래에 추가:

```typescript
const [autoSyncing, setAutoSyncing] = useState(false);
```

`getMerchantId` 함수 아래에 추가:

```typescript
async function getClosingTime(): Promise<string> {
  if (!store) return '23:00';
  const { data } = await supabase
    .from('stores')
    .select('closing_time')
    .eq('id', store.id)
    .single();
  return (data?.closing_time as string | null) ?? '23:00';
}
```

- [ ] **Step 3: autoSync 및 syncByDate 추가**

`syncCatalog` 함수 아래에 추가:

```typescript
/** 오늘 영업일 데이터 없으면 자동 동기화 */
const autoSync = useCallback(async (): Promise<void> => {
  if (!store || autoSyncing) return;
  try {
    setAutoSyncing(true);
    const closingTime = await getClosingTime();
    const { from, to } = getAutoSyncRange(closingTime);

    // 이미 데이터 있으면 스킵
    const { count } = await supabase
      .from('toss_sales')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id)
      .gte('order_at', from)
      .lte('order_at', to);

    if ((count ?? 0) > 0) return;

    const merchantId = await getMerchantId();
    const orders = await fetchTossOrders(merchantId, from.slice(0, 10), to.slice(0, 10));

    if (orders.length > 0) {
      const rows = orders.map(o => ({
        store_id: store.id,
        toss_order_id: o.orderId,
        order_at: o.orderAt,
        total_amount: o.totalAmount,
        status: o.status,
        items: o.items,
      }));
      await supabase.from('toss_sales').upsert(rows, { onConflict: 'toss_order_id' });
    }

    setLastSyncAt(new Date().toISOString());
    await loadTodaySales();
  } catch {
    // 자동 동기화 실패는 조용히 무시
  } finally {
    setAutoSyncing(false);
  }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [store, autoSyncing]);

/** 특정 날짜 영업일 수동 동기화 */
const syncByDate = useCallback(async (date: string): Promise<void> => {
  if (!store) throw new Error('매장 정보가 없습니다');
  const closingTime = await getClosingTime();
  const { from, to } = getBusinessDayRange(date, closingTime);
  await syncOrders(from.slice(0, 10), to.slice(0, 10));
}, [store, syncOrders]);
```

- [ ] **Step 4: getBusinessDayRange import 추가**

파일 상단 import에 추가:
```typescript
import { getAutoSyncRange, getBusinessDayRange } from '../services/posAnalytics';
```

- [ ] **Step 5: return에 추가**

```typescript
return {
  loading,
  error,
  lastSyncAt,
  todaySales,
  todayOrderCount,
  syncOrders,
  syncCatalog,
  loadTodaySales,
  autoSync,
  syncByDate,
  autoSyncing,
};
```

`UseTossSyncResult` 인터페이스에도 추가:
```typescript
autoSync: () => Promise<void>;
syncByDate: (date: string) => Promise<void>;
autoSyncing: boolean;
```

- [ ] **Step 6: 타입 체크**

```bash
npx tsc --noEmit 2>&1; echo "exit:$?"
```
Expected: `exit:0`

- [ ] **Step 7: 커밋**

```bash
git add lib/hooks/useTossSync.ts
git commit -m "feat: useTossSync에 autoSync/syncByDate 추가"
```

---

## Task 6: usePosAnalytics 훅 신규

**Files:**
- Create: `lib/hooks/usePosAnalytics.ts`

- [ ] **Step 1: 파일 생성**

```typescript
import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getDailySummaries, getDailyItems } from '../services/posAnalytics';
import { DailySummary, DailyItem } from '../../types';

export function usePosAnalytics() {
  const { store } = useAuth();
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [items, setItems] = useState<DailyItem[]>([]);
  const [loadingSummaries, setLoadingSummaries] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('전체');

  const fetchSummaries = useCallback(async (closingTime: string) => {
    if (!store) return;
    setLoadingSummaries(true);
    setError(null);
    try {
      const result = await getDailySummaries(store.id, closingTime);
      setSummaries(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingSummaries(false);
    }
  }, [store]);

  const fetchItems = useCallback(async (dateFrom: string, dateTo: string) => {
    if (!store) return;
    setLoadingItems(true);
    setError(null);
    setActiveCategory('전체');
    try {
      const result = await getDailyItems(store.id, dateFrom, dateTo);
      setItems(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingItems(false);
    }
  }, [store]);

  const categories = ['전체', ...Array.from(new Set(items.map(i => i.categoryName).filter(Boolean))).sort()];

  const filteredItems = activeCategory === '전체'
    ? items
    : items.filter(i => i.categoryName === activeCategory);

  return {
    summaries,
    items: filteredItems,
    allItems: items,
    categories,
    activeCategory,
    setActiveCategory,
    loadingSummaries,
    loadingItems,
    error,
    fetchSummaries,
    fetchItems,
  };
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit 2>&1; echo "exit:$?"
```
Expected: `exit:0`

- [ ] **Step 3: 커밋**

```bash
git add lib/hooks/usePosAnalytics.ts
git commit -m "feat: usePosAnalytics 훅 추가"
```

---

## Task 7: 마감 시간 설정 (app/settings/profile.tsx)

**Files:**
- Modify: `app/settings/profile.tsx`

- [ ] **Step 1: closing_time 상태 추가**

`useState` 선언부에 추가:
```typescript
const [closingTime, setClosingTime] = useState(
  (store?.closing_time as string | null | undefined)?.slice(0, 5) ?? '23:00'
);
```

- [ ] **Step 2: handleUpdateProfile에 closing_time 저장 추가**

기존 `update({ name: name.trim() })` 를 아래로 교체:
```typescript
const { error } = await supabase
  .from('stores')
  .update({
    name: name.trim(),
    closing_time: closingTime,
  })
  .eq('id', store?.id);
```

- [ ] **Step 3: UI에 마감 시간 입력 필드 추가**

`매장 이름` TextInput 아래, `saveBtn` TouchableOpacity 위에 추가:
```tsx
<Text style={[styles.label, { marginTop: 16 }]}>마감 시간 (HH:MM)</Text>
<TextInput
  style={styles.input}
  value={closingTime}
  onChangeText={setClosingTime}
  placeholder="23:00"
  keyboardType="numbers-and-punctuation"
  maxLength={5}
/>
```

- [ ] **Step 4: 타입 체크**

```bash
npx tsc --noEmit 2>&1; echo "exit:$?"
```
Expected: `exit:0`

- [ ] **Step 5: 커밋**

```bash
git add app/settings/profile.tsx
git commit -m "feat: 프로필 설정에 마감 시간 입력 추가"
```

---

## Task 8: AppState 자동 동기화 트리거 (app/_layout.tsx)

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: import 추가**

파일 상단에 추가:
```typescript
import { AppState } from 'react-native';
import { useTossSync } from '../lib/hooks/useTossSync';
```

- [ ] **Step 2: RootNavigator에 autoSync 연결**

`RootNavigator` 함수 내 기존 `useEffect` 아래에 추가:

```typescript
const { autoSync } = useTossSync();

useEffect(() => {
  const subscription = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      autoSync();
    }
  });
  return () => subscription.remove();
}, [autoSync]);
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit 2>&1; echo "exit:$?"
```
Expected: `exit:0`

- [ ] **Step 4: 커밋**

```bash
git add app/_layout.tsx
git commit -m "feat: 앱 포그라운드 진입 시 POS 자동 동기화 트리거"
```

---

## Task 9: POS 탭 메인 화면 재구성 (app/(tabs)/pos.tsx)

**Files:**
- Modify: `app/(tabs)/pos.tsx`

- [ ] **Step 1: pos.tsx 전체 교체**

```tsx
import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useTossSync } from '../../lib/hooks/useTossSync';
import { usePosAnalytics } from '../../lib/hooks/usePosAnalytics';
import { useAuth } from '../../lib/contexts/AuthContext';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { DailySummary } from '../../types';

function SummaryCard({ summary, onPress }: { summary: DailySummary; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.dayCard} onPress={onPress}>
      <View style={styles.dayCardLeft}>
        <Text style={styles.dayCardDate}>{summary.date}</Text>
        <Text style={styles.dayCardCount}>{summary.orderCount}건</Text>
      </View>
      <View style={styles.dayCardRight}>
        <Text style={styles.dayCardAmount}>{summary.totalAmount.toLocaleString('ko-KR')}원</Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
      </View>
    </TouchableOpacity>
  );
}

export default function PosScreen() {
  const { store } = useAuth();
  const {
    loading, error, lastSyncAt, todaySales, todayOrderCount,
    syncOrders, syncCatalog, loadTodaySales, syncByDate, autoSyncing,
  } = useTossSync();
  const { summaries, loadingSummaries, fetchSummaries } = usePosAnalytics();

  const [dateInput, setDateInput] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncingCatalog, setSyncingCatalog] = useState(false);

  const closingTime = (store?.closing_time as string | null | undefined)?.slice(0, 5) ?? '23:00';

  useFocusEffect(useCallback(() => {
    loadTodaySales();
    fetchSummaries(closingTime);
  }, [closingTime]));

  async function handleManualSync() {
    const date = dateInput.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('날짜 형식 오류', 'YYYY-MM-DD 형식으로 입력해주세요. 예: 2026-04-06');
      return;
    }
    setSyncing(true);
    try {
      await syncByDate(date);
      await fetchSummaries(closingTime);
      setDateInput('');
    } catch (e: any) {
      Alert.alert('동기화 실패', e.message);
    } finally {
      setSyncing(false);
    }
  }

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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Toss Place POS</Text>
        {lastSyncAt && (
          <Text style={styles.lastSync}>
            최근 동기화: {new Date(lastSyncAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 오늘 요약 */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Ionicons name="cash-outline" size={22} color={Colors.primary} style={styles.summaryIcon} />
            <Text style={styles.summaryValue}>{todaySales.toLocaleString('ko-KR')}원</Text>
            <Text style={styles.summaryLabel}>오늘 매출</Text>
          </View>
          <View style={styles.summaryCard}>
            <Ionicons name="receipt-outline" size={22} color={Colors.primary} style={styles.summaryIcon} />
            <Text style={styles.summaryValue}>{todayOrderCount}건</Text>
            <Text style={styles.summaryLabel}>오늘 주문</Text>
          </View>
        </View>

        {/* 수동 날짜 조회 */}
        <View style={styles.manualSection}>
          <Text style={styles.sectionTitle}>날짜 조회</Text>
          <View style={styles.manualRow}>
            <TextInput
              style={styles.dateInput}
              value={dateInput}
              onChangeText={setDateInput}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
            <TouchableOpacity
              style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
              onPress={handleManualSync}
              disabled={syncing}
            >
              {syncing
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <Text style={styles.syncBtnText}>조회</Text>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* 일별 요약 목록 */}
        <Text style={styles.sectionTitle}>최근 영업 내역</Text>
        {autoSyncing && <ActivityIndicator size="small" color={Colors.primary} style={{ marginBottom: 8 }} />}
        {loadingSummaries
          ? <LoadingSpinner />
          : summaries.length === 0
            ? <Text style={styles.emptyText}>동기화된 내역이 없습니다.</Text>
            : summaries.map(s => (
                <SummaryCard
                  key={s.date}
                  summary={s}
                  onPress={() => router.push(`/pos/${s.date}?from=${encodeURIComponent(s.dateFrom)}&to=${encodeURIComponent(s.dateTo)}`)}
                />
              ))
        }

        {/* 카탈로그 동기화 */}
        <TouchableOpacity
          style={[styles.catalogBtn, syncingCatalog && styles.syncBtnDisabled]}
          onPress={handleSyncCatalog}
          disabled={syncingCatalog}
        >
          {syncingCatalog
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <>
                <Ionicons name="sync-outline" size={16} color={Colors.primary} />
                <Text style={styles.catalogBtnText}>카탈로그 동기화</Text>
              </>
          }
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    paddingHorizontal: 20, paddingVertical: 16, backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  title: { fontSize: 20, fontWeight: '800', color: Colors.black },
  lastSync: { fontSize: 12, color: Colors.gray400, marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 40 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  summaryCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 14,
    padding: 16, alignItems: 'center', borderWidth: 1, borderColor: Colors.gray100,
  },
  summaryIcon: { marginBottom: 6 },
  summaryValue: { fontSize: 18, fontWeight: '800', color: Colors.black, marginBottom: 2 },
  summaryLabel: { fontSize: 12, color: Colors.gray500 },
  manualSection: { marginBottom: 20 },
  manualRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  dateInput: {
    flex: 1, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15,
  },
  syncBtn: {
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center',
  },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.black, marginBottom: 10 },
  dayCard: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: Colors.gray100, marginBottom: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  dayCardLeft: { gap: 2 },
  dayCardDate: { fontSize: 15, fontWeight: '700', color: Colors.black },
  dayCardCount: { fontSize: 13, color: Colors.gray500 },
  dayCardRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayCardAmount: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  emptyText: { fontSize: 14, color: Colors.gray400, textAlign: 'center', paddingVertical: 20 },
  catalogBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 24, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.primary,
  },
  catalogBtnText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
});
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit 2>&1; echo "exit:$?"
```
Expected: `exit:0`

- [ ] **Step 3: 커밋**

```bash
git add "app/(tabs)/pos.tsx"
git commit -m "feat: POS 메인 화면 — 일별 요약 목록 + 수동 날짜 조회"
```

---

## Task 10: 일별 상세 화면 신규 (app/pos/[date].tsx)

**Files:**
- Create: `app/pos/[date].tsx`

- [ ] **Step 1: 파일 생성**

```tsx
import { useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { usePosAnalytics } from '../../lib/hooks/usePosAnalytics';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { DailyItem } from '../../types';

function ItemRow({ item }: { item: DailyItem }) {
  return (
    <View style={styles.itemRow}>
      <View style={styles.itemLeft}>
        <Text style={styles.itemName}>{item.itemName}</Text>
        {item.categoryName ? (
          <Text style={styles.itemCategory}>{item.categoryName}</Text>
        ) : null}
      </View>
      <View style={styles.itemRight}>
        <Text style={styles.itemQty}>{item.quantity}개</Text>
        <Text style={styles.itemAmount}>{item.totalAmount.toLocaleString('ko-KR')}원</Text>
      </View>
    </View>
  );
}

export default function PosDateScreen() {
  const { date, from: encodedFrom, to: encodedTo } = useLocalSearchParams<{ date: string; from: string; to: string }>();
  const from = decodeURIComponent(encodedFrom ?? '');
  const to = decodeURIComponent(encodedTo ?? '');

  const {
    items, allItems, categories, activeCategory, setActiveCategory,
    loadingItems, error, fetchItems,
  } = usePosAnalytics();

  useFocusEffect(useCallback(() => {
    if (from && to) fetchItems(from, to);
  }, [from, to]));

  const totalAmount = allItems.reduce((sum, i) => sum + i.totalAmount, 0);
  const totalQty = allItems.reduce((sum, i) => sum + i.quantity, 0);

  if (error) return <ErrorMessage message={error} onRetry={() => fetchItems(from, to)} />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerDate}>{date}</Text>
          <Text style={styles.headerSub}>{totalQty}개 · {totalAmount.toLocaleString('ko-KR')}원</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* 카테고리 필터 */}
      {categories.length > 1 && (
        <View style={styles.filterBar}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={categories}
            keyExtractor={c => c}
            contentContainerStyle={styles.filterContent}
            renderItem={({ item: cat }) => (
              <TouchableOpacity
                style={[styles.filterChip, activeCategory === cat && styles.filterChipActive]}
                onPress={() => setActiveCategory(cat)}
              >
                <Text style={[styles.filterChipText, activeCategory === cat && styles.filterChipTextActive]}>
                  {cat || '미분류'}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {loadingItems
        ? <ActivityIndicator size="large" color={Colors.primary} style={{ flex: 1 }} />
        : (
          <FlatList
            data={items}
            keyExtractor={i => i.itemId || i.itemName}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <ItemRow item={item} />}
            ListEmptyComponent={
              <Text style={styles.emptyText}>해당 카테고리의 판매 내역이 없습니다.</Text>
            }
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )
      }
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  headerDate: { fontSize: 16, fontWeight: '800', color: Colors.black },
  headerSub: { fontSize: 12, color: Colors.gray500, marginTop: 2 },
  filterBar: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  filterContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.gray200, backgroundColor: Colors.white,
  },
  filterChipActive: { backgroundColor: Colors.dark, borderColor: Colors.dark },
  filterChipText: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  filterChipTextActive: { color: Colors.white },
  list: { paddingHorizontal: 16, paddingVertical: 12 },
  itemRow: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  itemLeft: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '600', color: Colors.black },
  itemCategory: { fontSize: 12, color: Colors.gray400, marginTop: 2 },
  itemRight: { alignItems: 'flex-end', gap: 2 },
  itemQty: { fontSize: 13, color: Colors.gray500 },
  itemAmount: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  separator: { height: 8 },
  emptyText: { textAlign: 'center', color: Colors.gray400, paddingVertical: 40 },
});
```

- [ ] **Step 2: _layout.tsx에 스크린 등록**

`app/_layout.tsx`의 `<Stack>` 내부에 추가:
```tsx
<Stack.Screen name="pos/[date]" options={{ headerShown: false }} />
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit 2>&1; echo "exit:$?"
```
Expected: `exit:0`

- [ ] **Step 4: 최종 커밋 및 PR 업데이트**

```bash
git add "app/pos/[date].tsx" app/_layout.tsx
git commit -m "feat: POS 일별 상세 화면 — 상품별 집계 + 카테고리 필터"
git push
```

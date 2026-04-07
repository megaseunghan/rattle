# POS 일별 결제 내역 자동/수동 동기화 설계

**날짜**: 2026-04-07  
**범위**: Toss Place POS 결제 내역 일별 자동 동기화 + 수동 조회 + 상품별 집계

---

## 1. 개요

사용자가 설정한 마감 시간 기준으로 매일 1회 결제 내역을 자동으로 가져오고,
원하는 날짜의 내역을 수동으로 조회할 수 있는 기능.
일별 상세 화면에서 해당 날의 모든 결제 상품을 카테고리 필터와 함께 집계 리스트로 표시.

---

## 2. DB 스키마

### 2-1. `stores` 테이블 컬럼 추가

```sql
ALTER TABLE stores ADD COLUMN closing_time TIME DEFAULT '23:00';
```

- 사용자가 `settings/profile` 화면에서 직접 입력
- 날짜 범위 계산 기준: `전날 closing_time ~ 당일 closing_time`

### 2-2. `toss_catalog` 테이블 신규 생성

```sql
CREATE TABLE toss_catalog (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID REFERENCES stores(id) ON DELETE CASCADE,
  item_id       TEXT NOT NULL,
  item_name     TEXT NOT NULL,
  category_name TEXT NOT NULL DEFAULT '',
  price         INTEGER NOT NULL DEFAULT 0,
  is_available  BOOLEAN NOT NULL DEFAULT true,
  synced_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (store_id, item_id)
);
```

- 카탈로그 동기화 시 `(store_id, item_id)` 기준 upsert
- `toss_sales.items[].itemId`로 조인 → `categoryName` 추출

---

## 3. 자동 동기화

### 트리거 방식

- Expo Background Fetch + `AppState` 포그라운드 진입 이벤트 조합
- **핵심 보장**: 앱을 열 때 오늘 데이터가 없으면 자동 실행
- `app/_layout.tsx`에서 `AppState.addEventListener('change')` 등록

### 날짜 범위 계산 로직

```
closing_time = stores.closing_time (예: "23:00")

오늘 기준:
  - 현재 시각 >= closing_time → 오늘 closing_time ~ 내일 closing_time (오늘 영업일)
  - 현재 시각 < closing_time  → 어제 closing_time ~ 오늘 closing_time (어제 영업일)
```

### 자동 실행 조건

1. `stores.closing_time` 조회
2. 오늘 영업일 범위 계산
3. `toss_sales`에 해당 범위 데이터 존재 여부 확인
4. 없으면 `syncOrders(dateFrom, dateTo)` 자동 실행

---

## 4. 화면 구성

### 4-1. POS 탭 메인 (`/pos`)

- 오늘 매출/주문 건수 요약 카드 (기존)
- 날짜 선택 DatePicker + 조회 버튼 → 해당 날 동기화 실행
- 동기화된 일별 카드 목록 (날짜, 총매출, 주문 건수) → 탭 시 `/pos/[date]` 이동
- 하단 카탈로그 동기화 버튼

### 4-2. 일별 상세 화면 (`/pos/[date]`)

- 상단: 날짜, 총매출, 주문 건수
- 카테고리 필터 탭 (전체 + 카탈로그 카테고리 목록)
- 상품별 플랫 리스트: `itemName` 기준 수량 합산 + 금액 합산
  - 카탈로그 미동기화 시: 카테고리 없이 상품명만 표시

### 4-3. 설정 화면 (`/settings/profile`)

- 마감 시간 입력 필드 추가 (HH:MM 형식)

---

## 5. 서비스 & 훅 구조

| 파일 | 변경 내용 |
|------|-----------|
| `supabase/migrations/..._pos_catalog.sql` | closing_time + toss_catalog 마이그레이션 |
| `lib/services/tossplace.ts` | `saveCatalog(storeId, items[])` 추가 — toss_catalog upsert |
| `lib/services/posAnalytics.ts` | 신규 — `getDailySummaries()`, `getDailyItems(storeId, date)` |
| `lib/hooks/useTossSync.ts` | closing_time 기반 날짜 계산, 자동 동기화 트리거 추가 |
| `lib/hooks/usePosAnalytics.ts` | 신규 — 일별 상품 목록 + 카테고리 필터 상태 관리 |
| `app/(tabs)/pos.tsx` | 메인 화면 재구성 |
| `app/pos/[date].tsx` | 신규 — 일별 상세 화면 |
| `app/settings/profile.tsx` | 마감 시간 입력 추가 |
| `app/_layout.tsx` | AppState 포그라운드 진입 시 자동 동기화 등록 |

---

## 6. 데이터 흐름

```
앱 포그라운드 진입
  → closing_time 조회
  → 오늘 영업일 범위 계산
  → toss_sales에 데이터 있는지 확인
  → 없으면 syncOrders() 실행
      → toss-proxy Edge Function
      → Toss Place API
      → toss_sales upsert

수동 조회
  → DatePicker로 날짜 선택
  → 해당 날 closing_time 범위 계산
  → syncOrders() 실행 → toss_sales upsert

일별 상세 화면
  → toss_sales 조회 (날짜 범위)
  → items JSONB 펼치기
  → toss_catalog 조인 (categoryName 추출)
  → itemName 기준 수량/금액 클라이언트 집계
  → 카테고리 필터 적용
```

---

## 7. 선행 조건

- 카테고리 필터 사용 전 카탈로그 동기화 1회 필요
- 카탈로그 미동기화 시 카테고리 없이 상품명 기준 집계만 표시 (그레이스풀 디그레이드)

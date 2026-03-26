# OCR 납품서 파싱 기능 설계

**날짜:** 2026-03-26
**목적:** 영수증/납품서 촬영 → AI 파싱 → 검토/수정 → 발주 등록 자동화
**우선순위:** 높음 (데모 핵심 기능)

---

## 1. 전체 아키텍처

```
[앱]
  expo-image-picker (카메라/갤러리)
       ↓ 이미지 base64
  lib/services/ocr.ts          ← 비즈니스 로직 전담
       ↓
  Supabase Edge Function        ← API 키 보관 + Clova 프록시만 담당
       ↓
  Naver Clova OCR API
       ↓ 텍스트 원본
  lib/services/ocr.ts          ← 파싱 + 재고 매칭 + 단가 비교
       ↓ OcrLineItem[]
  app/orders/ocr-review.tsx    ← 검토·수정 화면
       ↓ 확정
  useOrders().create()          ← 기존 발주 등록 로직 재사용
```

**이식성 원칙:** Edge Function은 얇은 프록시만 담당. 비즈니스 로직은 `lib/services/ocr.ts`에 집중. 엔드포인트 URL 하나만 바꾸면 Supabase → 타 백엔드 교체 가능.

---

## 2. 화면 흐름

```
대시보드 "영수증 촬영" 버튼 (기존 QuickAction, onPress 연결)
       ↓
카메라/갤러리 선택 (expo-image-picker, 이미 package.json에 있음)
       ↓
로딩 화면 "영수증 분석 중..."
       ↓
app/orders/ocr-review.tsx
  - 원본 영수증 이미지 접기/펼치기 (상단)
  - 거래처명 입력
  - 발주일 (자동: 오늘)
  - 파싱된 품목 목록 (인라인 편집)
  - [발주 등록] 버튼
       ↓
app/(tabs)/orders.tsx (기존 목록)
```

---

## 3. 데이터 모델

```typescript
interface OcrLineItem {
  raw: string;                          // Clova 원본 텍스트
  name: string;                         // 파싱된 품목명
  quantity: number;
  unit: string;
  unit_price: number;
  confidence: 'high' | 'low';           // 파싱 성공 여부 (low = 주황색 하이라이트)
  matched_ingredient: Ingredient | null; // 재고 자동 매칭 결과
  match_candidates: Ingredient[];        // 후보 2개 이상일 때 선택 목록
  prev_price: number | null;            // 이전 발주 단가 (변동 표시용)
}
```

---

## 4. 검토 화면 UX

### 인라인 편집
- 품목명/수량/단가 탭 → 텍스트 인풋 전환 (기존 `IngredientRow` 패턴 동일)
- 단위 → 칩 선택 (기존 빠른 등록 패턴 동일)
- `✕` → 항목 제거
- `+ 항목 추가` → 수동 추가

### 인식 신뢰도 표시
- `confidence: 'low'` 항목 → 주황색 테두리로 수정 유도
- 수정 완료 시 → 일반 스타일로 전환

### 재고 자동 매칭
| 경우 | 동작 |
|------|------|
| 완전/부분 일치 1개 | 자동 연결, 초록 뱃지 표시 |
| 후보 2개 이상 | 드롭다운으로 선택 |
| 매칭 실패 | "신규" 뱃지 + 빠른 등록 유도 (기존 로직 재사용) |

### 이전 단가 비교
```
[소주 360ml] [10병] [1,800원]  ← 이전 1,500원 +20% ⚠️
```
- 이전 `last_price` 대비 변동 시 퍼센트와 방향 표시
- 등록 전에 인지 가능 (기존 입고 처리 후 알림보다 앞단에서 처리)

### 원본 이미지 토글
- 화면 상단에 촬영 이미지 접기/펼치기
- "이게 맞나?" 확인 시 원본 참조 가능

---

## 5. Edge Function

**경로:** `supabase/functions/ocr/index.ts`

```
POST /functions/v1/ocr
Body:    { image_base64: string }
Response: { text: string, words: ClovaWord[] }
```

- Naver Clova API 키는 Supabase secrets에 저장 (`CLOVA_OCR_API_KEY`, `CLOVA_OCR_URL`)
- 파싱/구조화 로직 없음 — 텍스트 원본만 반환
- CORS 처리 포함

---

## 6. 파싱 로직 (`lib/services/ocr.ts`)

```
clovaTextToLineItems(text, ingredients):
  1. 줄 단위 분리
  2. 각 줄에서 품목명/수량/단위/단가 정규식 추출
  3. 추출 실패 시 confidence = 'low'
  4. 품목명으로 재고 유사도 검색 (단순 includes 매칭)
  5. matched_ingredient.last_price로 prev_price 설정
  6. OcrLineItem[] 반환
```

---

## 7. 신규 파일 목록

| 파일 | 역할 |
|------|------|
| `supabase/functions/ocr/index.ts` | Clova 프록시 Edge Function |
| `lib/services/ocr.ts` | 파싱 + 매칭 비즈니스 로직 |
| `app/orders/ocr-review.tsx` | 검토·수정 화면 |

**수정 파일:**
| 파일 | 변경 내용 |
|------|-----------|
| `app/(tabs)/index.tsx` | 영수증 촬영 QuickAction onPress 연결 |
| `types/index.ts` | `OcrLineItem` 타입 추가 |

---

## 8. 사전 준비 (개발 시작 전)

1. Naver Cloud Platform 계정 생성
2. Clova OCR 서비스 신청 → API Gateway URL + Secret Key 발급
3. Supabase secrets 등록: `CLOVA_OCR_API_KEY`, `CLOVA_OCR_URL`
4. `app.json`에 카메라 권한 플러그인 추가:
   ```json
   ["expo-image-picker", { "cameraPermission": "납품서 촬영을 위해 카메라 접근이 필요합니다." }]
   ```

---

## 9. 범위 외 (이번 구현에서 제외)

- Clova Document OCR 템플릿 등록 (납품서 특화)
- OCR 결과 DB 저장 (`ocr_results` 테이블 활용은 추후)
- 이미지 Supabase Storage 영구 저장
- Toss POS 연동, stock_logs, multi-user 권한

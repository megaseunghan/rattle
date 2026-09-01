# Rattle — 2026 UX 트렌드 적용 요청

## 프로젝트 컨텍스트

Rattle은 소규모 식당/카페 사장님을 위한 다매장 손익 관리 앱입니다.
스택: **Expo SDK 55 + React Native + TypeScript + Supabase**
화면: 홈(오늘 매출+손익 요약) / 매입 / 인건비 / 재고·발주·레시피 / 관리자 대시보드

---

## 적용할 트렌드 목록 (우선순위 순)

아래 2026 UX 트렌드를 Rattle의 각 화면에 구체적으로 적용해줘.
**각 항목마다 어떤 파일을 수정할지, 코드 예시까지 함께 제시해줘.**

---

### 1. Glassmorphism (유리 형태 디자인) — 홈 대시보드 카드

**목표**: `app/(tabs)/index.tsx`의 오늘 매출 + 손익 요약 카드를 글래스모피즘 스타일로 업그레이드

**구현 조건**:
- `constants/colors.ts`에 glassmorphism 관련 토큰 추가 (`glass.background`, `glass.border`, `glass.shadow`)
- React Native에서는 `expo-blur`의 `BlurView`를 활용해 frosted glass 효과 구현
- 기존 `StyleSheet` 기반 카드 컴포넌트를 `BlurView` + 반투명 오버레이 방식으로 교체
- 매장별 컬러(`Colors.*`, store.id 기반)를 글래스 틴트에 연동
- iOS/Android 렌더링 차이 처리 필요 (BlurView는 iOS에서 더 정확함)

**참고 파일**: `constants/colors.ts`, `app/(tabs)/index.tsx`, `lib/components/`

---

### 2. Intent-based Design (의도 기반 설계) — 홈 스마트 알림

**목표**: 홈 화면에서 사용자의 상황을 파악해 다음 행동을 선제적으로 안내하는 "의도 카드" 추가

**구현 조건**:
- `lib/hooks/useDashboard.ts`의 데이터를 기반으로 아래 상황별 인텐트 카드 표시:
  - 품절 임박 재료 3개 이상 → "지금 발주하시겠어요?" 카드 + 발주 화면 딥링크
  - 이번 달 인건비율 > 30% → "인건비율이 목표를 초과했어요" + 인건비 탭 이동
  - 오늘 TossPos 미동기화 → "오늘 매출 데이터를 불러올까요?" + 동기화 실행 버튼
  - 이번 달 손익 마감 D-3 → "이번 달 손익 정산을 완료해주세요" 리마인더
- 인텐트 카드는 `lib/components/IntentCard.tsx`로 별도 컴포넌트화
- 카드는 가로 스크롤 가능한 `ScrollView` 형태로 홈 상단에 배치
- 이미 처리한 인텐트는 Supabase 없이 `AsyncStorage`로 로컬 dismissed 처리

**참고 파일**: `lib/hooks/useDashboard.ts`, `app/(tabs)/index.tsx`

---

### 3. Emotionally Aware Modes (감성 인지 모드) — 손익 결과 피드백

**목표**: 손익계산서 결과를 단순 숫자가 아닌 감성적 맥락으로 전달

**구현 조건**:
- `lib/hooks/useProfitLoss.ts` 데이터를 기반으로 월 순이익 구간별 피드백 메시지 + 이모지 표시:
  - 흑자 (순이익 > 0): "이번 달도 흑자예요 🎉 잘 운영하고 계세요!"
  - 손익분기 (±5% 이내): "거의 다 왔어요 💪 다음 달엔 꼭 흑자로!"
  - 적자 (-10% 이하): "이번 달은 쉽지 않았네요 😔 원가율을 확인해볼게요"
- 관리자 대시보드(`app/admin/index.tsx`)에서는 전체 매장 중 최우수 매장 강조 표시
- `constants/colors.ts`에 sentiment 색상 토큰 추가: `sentiment.positive`, `sentiment.neutral`, `sentiment.negative`
- 메시지는 `lib/utils/sentimentMessage.ts`로 분리해 테스트 가능하게 구성

**참고 파일**: `lib/hooks/useProfitLoss.ts`, `app/admin/index.tsx`, `constants/colors.ts`

---

### 4. Nostalgia Design (노스탤지어 디자인) — 인건비 계산서 레이아웃

**목표**: 인건비 화면(`app/(tabs)/payroll.tsx`)을 실제 급여명세서 느낌으로 리디자인

**구현 조건**:
- 세로줄 구분선, 밑줄 스타일 행, 모노스페이스 폰트(`Platform.select`로 iOS: 'Courier New', Android: 'monospace') 적용
- 4대보험 공제 내역을 영수증 스타일 레이아웃으로 표현 (항목 / 금액 두 컬럼)
- 합계선은 `borderTopWidth: 2, borderStyle: 'dashed'` 로 구분
- "실수령액" 텍스트는 bold + 약간 큰 폰트로 강조
- 출력/공유 버튼: `expo-print` 또는 `expo-sharing`으로 PDF 내보내기 기능 추가 검토 (선택사항)

**참고 파일**: `app/(tabs)/payroll.tsx`, `lib/hooks/usePayroll.ts`

---

### 5. Multimodal Experience (멀티모달 경험) — OCR 발주서 등록 플로우

**목표**: `app/orders/ocr-review.tsx`의 OCR 결과 검토 화면을 멀티모달 방식으로 개선

**구현 조건**:
- 현재: 이미지 업로드 → OCR 결과 텍스트 표시 → 수동 확인
- 개선: 이미지와 파싱 결과를 **좌우/상하 스플릿 뷰**로 동시 표시
  - 상단: 원본 이미지 (pinch-to-zoom 지원, `react-native-gesture-handler` 활용)
  - 하단: 파싱된 품목 리스트 (인라인 수정 가능한 `TextInput`)
  - 이미지의 각 줄과 파싱 결과 행을 하이라이트로 연동 (선택사항 — 복잡하면 skip)
- 품목별 수량/단가 수정 후 "발주 확정" 버튼으로 `create_order_with_items` RPC 호출
- 로딩 중에는 `LoadingSpinner` 컴포넌트 사용 (기존 컨벤션 준수)

**참고 파일**: `app/orders/ocr-review.tsx`, `lib/services/ocr.ts`, `lib/components/LoadingSpinner.tsx`

---

## 공통 개발 컨벤션 (반드시 준수)

- **서비스 레이어**: DB 접근은 `lib/services/`에서만. 컴포넌트에서 supabase 직접 호출 금지
- **색상**: `Colors.*` 사용. 하드코딩 금지
- **에러/로딩**: `ErrorMessage`, `LoadingSpinner` 컴포넌트 사용
- **새 파일 추가 순서**: `types/index.ts` → `lib/services/` → `lib/hooks/` → `app/`
- **브랜치**: `feature/ux-trend-{기능명}` 형식으로 작업

---

## 작업 순서 제안

1. `constants/colors.ts`에 glassmorphism + sentiment 토큰 추가 (기반 작업)
2. `lib/components/IntentCard.tsx` 신규 생성 (Intent-based)
3. `lib/utils/sentimentMessage.ts` 신규 생성 (Emotionally Aware)
4. 각 화면 파일 순서대로 UI 수정 (홈 → 인건비 → OCR 리뷰)
5. `expo-blur` 패키지 설치 필요 여부 확인 후 glassmorphism 적용

---

## 우선순위가 낮아 이번 스프린트에서 제외할 항목

- Spatial UI / AR (Expo에서 지원 미흡)
- AI Generated Design System (현재 디자인 시스템 안정화 우선)
- On-device Intelligence (Supabase 기반 아키텍처와 충돌)

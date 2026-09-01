---
id: rattle
name: Rattle
country: KR
category: b2b-finance
platform: react-native-expo
primary_color: "#3182F6"
derived_from:
  ref: toss (TDS Mobile)
  ref_url: "https://tossmini-docs.toss.im/tds-mobile/"
  note: "토스 TDS 기반으로 파랑 브랜드 차용. Rattle은 다매장 손익관리 RN 앱."
omd: "0.1"
tokens:
  source: constants/colors.ts
  colors:
    primary: "#3182F6"        # 인터랙션/주요 액션
    primary-hover: "#2272EB"  # dark: 강조·pressed
    deep: "#1B64DA"           # deeper
    light: "#74A8F9"
    pale: "#C9E2FF"
    weak-background: "#E8F3FF" # bg
    tinted: "#F0F6FF"
    foreground: "#191F28"      # black
    canvas: "#FFFFFF"
    surface: "#F3F4F6"         # gray100
    border: "#E5E7EB"          # gray200
    body: "#4B5563"            # gray600
    muted: "#9CA3AF"           # gray400
    on-primary: "#FFFFFF"
    # 재무 의미색 (브랜드와 분리 — 이익/손실 판독용, 리브랜딩에도 유지)
    positive: "#1D9E75"        # 이익(gain)
    negative: "#EF4444"        # 손실(loss)
    warning: "#F59E0B"
  typography:
    family: { sans: "System (Pretendard 지향), 숫자는 tabular-nums" }
    display-amount: { size: 28, weight: 700 }  # 금액 강조 (모바일)
    headline: { size: 22, weight: 700 }
    title: { size: 17, weight: 700 }
    body: { size: 16, weight: 400 }
    label-sm: { size: 13, weight: 500 }
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }
  rounded: { sm: 8, md: 10, card: 14, pill: 9999 }
  components:
    button-primary: { bg: "#3182F6", fg: "#FFFFFF", radius: 10, use: "주요 액션" }
    button-ghost: { border: "1px #3182F6", fg: "#3182F6", radius: 10 }
    card: { radius: 14, border: "1px #F3F4F6", padding: 16 }
    glass-card: { blur: 20, fill: "rgba(255,255,255,0.55)", border: "rgba(255,255,255,0.65)", use: "손익/요약 강조 카드만" }
    segmented-toggle: { track: "#F3F4F6", active: "#FFFFFF pill + soft shadow", active-fg: "#3182F6", use: "상단 분할탭(재고/레시피, 매입/경비)" }
    input: { bg: "#F9FAFB", border: "1px #E5E7EB", focus-border: "#3182F6", radius: 8 }
    badge: { shape: pill, use: "상태 표시(수습·연동완료 등), 액션 아님" }
    tab-bar: { bg: "#FFFFFF", top-border: "0.5px", active: "#3182F6 아이콘+라벨+상단 인디케이터" }
---

## 1. Visual Theme & Atmosphere

Rattle은 다매장 손익을 한 곳에서 관리하는 **B2B 사장님 도구**다. 복잡한 재무를
차분하고 즉답 가능한 형태로 보여주는 게 목표. 토스 TDS의 **강한 파랑 인터랙션
색 + 넓은 위계 + 직설적 언어**를 차용하되, 초록이 아니라 **파랑(#3182F6)** 을
Primary로 쓴다. (토스 POS 연동 생태계와 시각적 일관성)

**핵심 특징**
- Primary `#3182F6` — 액션·활성 탭·긍정 인터랙션
- 금액은 굵고 크게(display-amount), 숫자는 tabular-nums로 정렬감
- 재무 의미색은 브랜드와 분리: 이익=초록 `#1D9E75`, 손실=빨강 `#EF4444`
- 카드/버튼/입력/탭의 geometry를 화면 전체에서 통일 (제각각 금지)

## 2. Color Palette & Roles

- **Primary** `#3182F6`: 주요 액션 버튼, 활성 탭/세그먼트, 링크
- **Primary Hover/Pressed** `#2272EB`
- **Deep** `#1B64DA`: 진한 강조
- **Weak Background** `#E8F3FF`: 파랑 약배경(칩·강조 영역)
- **Foreground** `#191F28`, **Body** `#4B5563`, **Muted** `#9CA3AF`
- **Surface** `#F3F4F6`, **Border** `#E5E7EB`, **Canvas** `#FFFFFF`
- **재무 의미색(브랜드 아님)**: 이익 `#1D9E75`, 손실/경고 `#EF4444`, 주의 `#F59E0B`

> 이익을 초록으로 유지하는 이유: 파랑 Primary와 손익 판독을 분리해 "이익/손실"이
> 브랜드색에 묻히지 않게 함. 이건 의도된 예외.

## 3. Typography

- 시스템 산세리프(Pretendard 지향), 한글 가독 우선
- 금액: `display-amount`(28/700) — 사용자 시선이 "바텀라인"에 먼저 닿게
- 라벨: `label-sm`(13/500) 소형 라벨로 데이터 분류, 숫자와 경쟁 금지
- 통화 기호(₩)는 숫자보다 약간 작게/가볍게

## 4. Components (Rattle 실사용)

- **Primary 버튼**: 파랑 채움 + 흰 글자, radius 10
- **Ghost 버튼**: 1px 파랑 보더 + 투명 배경, radius 10
- **카드**: radius 14, 부드러운 그림자. 손익/요약 강조 카드만 **글래스모피즘**
- **세그먼트 토글**(상단 분할탭): 회색 트랙 + 흰 알약 활성칸 + 파랑 글자.
  밑줄형 금지, 모든 화면 동일 (재고/레시피, 매입/경비)
- **입력필드**: 연회색 배경 + 포커스 시 파랑 보더, radius 8, 라벨은 필드 위
- **뱃지/칩**: pill 형태. 상태 표시용(수습·연동완료), 액션 아님
- **탭바**: 흰 배경 + 상단 얇은 보더, 활성 탭 파랑(아이콘+라벨+상단 인디케이터)

## 5. Do's and Don'ts

**Do**
- 모든 색은 `constants/colors.ts`의 `Colors.*` 토큰 경유 (하드코딩 금지)
- 버튼·카드·입력·탭 geometry를 화면 전체에서 통일
- 이익/손실은 의미색(초록/빨강)으로, 브랜드 파랑과 분리
- 로딩/비활성/pressed 상태를 명시적으로 유지

**Don't**
- Primary 파랑을 장식용으로 남발하지 말 것 (액션·활성에만)
- 화면마다 다른 탭/버튼 모양 (지금까지의 문제 — 반드시 통일)
- 글래스모피즘을 아무 카드에나 (손익/요약 강조에만)

## 10. Voice & Tone

토스식 "일 덜어주는 안내자". 짧고 직설적이되, 사장님이 **결과와 다음 행동을
정확히** 알게 쓴다. 모호한 위안·전문용어·기관 말투 금지. 예: "이번 달 손익 정산",
"품절 임박 3건 — 매입 등록할까요?" 처럼 결과+다음행동을 붙인다.

---

**Derived:** 2026-08-11 · 토스 TDS Mobile 레퍼런스 기반 파랑 리브랜딩
**적용:** `constants/colors.ts` Primary #1D9E75(green) → #3182F6(blue) 전환 완료

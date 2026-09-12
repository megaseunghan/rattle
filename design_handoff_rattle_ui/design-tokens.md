# Design Tokens

HTML 프로토타입은 루트 `<div>`에 CSS 변수로 토큰을 선언하고 모든 화면이 이를 참조합니다. 실제 구현 시에는 리포지토리의 `constants/colors.ts` / `constants/designTokens.ts`에 이미 있는 값을 우선 사용하고, 없는 값만 추가하세요.

## Color

| 토큰 | Hex | 용도 |
| --- | --- | --- |
| `primary` | `#3182F6` | 주요 액션 버튼, 선택 상태, 링크성 텍스트("등록하기 ›"), 활성 탭, 강조 수치(마진율) |
| `primaryDark` | `#2272EB` | primary의 pressed 상태 |
| `tinted` | `#F0F6FF` | primary의 연한 배경 — 요약 카드, 선택된 카드 배경, 아이콘 배경, 읽지 않은 알림 배경 |
| `black` | `#191F28` | 본문 최상위 텍스트, 헤딩, 선택된 칩 배경 |
| `gray600` | `#4B5563` | 보조 본문 텍스트 |
| `gray500` | `#6B7280` | 캡션, 라벨, 비활성 탭 |
| `gray400` | `#9CA3AF` | 메타 텍스트(시각, 단위), placeholder, 아이콘 stroke |
| `gray300` | `#D1D5DB` | 체크박스·라디오 테두리, 점선 테두리 |
| `gray200` | `#E5E7EB` | 입력 필드 테두리, 프레임 테두리, 토글 off 트랙 |
| `gray100` | `#F3F4F6` | 카드 테두리, 구분선, 게이지 트랙, 뱃지 배경 |
| `gray50` | `#F9FAFB` | 섹션 배경, 합계 행 배경, 안내 박스 배경 |
| `positive` | `#1D9E75` | 상승 증감률, 정산완료 뱃지, 자동입력 뱃지 |
| `negative` | `#EF4444` | 하락 증감률, 지각/공제/삭제, 일요일 |

파생 색상:
- positive 뱃지 배경: `rgba(29,158,117,.1)`
- negative 뱃지 배경: `#FEE2E2`
- warning 아이콘 배경: `#FEF3C7`, stroke `#D97706`
- 오버레이(코치마크): `rgba(17,24,39,.6)` / 바텀시트: `rgba(17,24,39,.45)`
- 카카오 버튼: 배경 `#FEE500`, 텍스트 `#191919`

## Typography

폰트: **Pretendard** (본문·UI 전체), 숫자 강조에 **Space Grotesk** (금액·시각 등, fallback Pretendard).

| 역할 | 스펙 |
| --- | --- |
| 화면 제목 (앱바) | 20px / 700 |
| 홈 인사말 | 22px / 700 |
| 온보딩 헤드라인 | 22px / 700 / line-height 1.35 |
| 대표 금액 | 28~30px / 700 / Space Grotesk / letter-spacing -0.5px |
| 서비스코드·매장코드 | 32~36px / 700 / Space Grotesk / letter-spacing 0.08~0.1em |
| 섹션 헤더 | 11px / 600 / gray400 / letter-spacing 0.04em |
| 리스트 항목 제목 | 14px / 600~700 |
| 리스트 메타 | 11~12px / 400~500 / gray400~500 |
| 본문 설명 | 13px / 500 / line-height 1.5~1.6 |
| 버튼 라벨 | 15px / 700 (주요), 13px / 600~700 (보조·칩) |
| 필드 라벨 | 12px / 600 / gray500 |
| 뱃지 | 10~11px / 600~700 |

최소 크기: 10px(뱃지)를 하한으로 하며 본문은 12px 이상.

## Spacing

- 프레임(화면) 폭: **390px** (iPhone 기준). 실제 구현은 반응형.
- 좌우 기본 여백: **22px**
- 온보딩·설명형 화면 좌우 여백: **28px**
- 섹션 상단 간격: **20px** (섹션 헤더 위), 헤더-콘텐츠 간격 **6px**
- 카드 내부 패딩: **13~16px**
- 리스트 항목 간격: **8px**
- 폼 필드 간격: **14px**
- 하단 CTA 영역 패딩: **22px**

## Radius

| 대상 | 값 |
| --- | --- |
| 기기 프레임 | 32px (목업 전용, 구현 불필요) |
| 요약/큰 카드 | 16px |
| 리스트 카드, 입력 필드 컨테이너 | 14px |
| 입력 필드, 주요 버튼 | 12px |
| 작은 아이콘 컨테이너 | 9~11px |
| 칩 / 뱃지 / pill 버튼 | 20px (완전 라운드) |
| 체크박스 | 6~7px |
| 토글 트랙 | 높이의 절반 (11~12px) |
| 바텀시트 상단 | 24px 24px 0 0 |
| 게이지 바 | 2~3px |

## Shadow

- 기기 프레임: `0 20px 40px -14px rgba(17,24,39,.14)` (목업 전용)
- 코치마크 카드: `0 12px 30px rgba(0,0,0,.25)`
- 탭 내부 활성 항목: `0 1px 3px rgba(17,24,39,.08)`

실제 앱에서는 카드에 그림자를 쓰지 않고 `gray100` 테두리로 구분합니다.

## Icons

Lucide 스타일 라인 아이콘 (stroke-width 1.8~2, stroke-linecap/linejoin round). 크기 15/16/17/20/22/26px. React Native에서는 `lucide-react-native` 또는 리포에서 이미 쓰는 아이콘 세트를 사용하세요.

## Toggle / Control 스펙

| 컴포넌트 | 스펙 |
| --- | --- |
| 토글 (큰) | 트랙 40×23px, 노브 19px, off 배경 `gray200`, on 배경 `primary`, 노브 여백 2px |
| 토글 (작은) | 트랙 36×21px, 노브 17px |
| 체크박스 | 20×20px (전체동의) / 18×18px (개별), radius 5~6px, 테두리 1.5px `gray300`, 체크 시 `primary` 배경 + 흰 체크 |
| 라디오 | 20px 원형, 미선택 테두리 1.5px `gray300`, 선택 `primary` 채움 + 흰 체크 |
| 칩 (선택) | 배경 `black`, 텍스트 흰색, 13px/600, padding 8×16px |
| 칩 (미선택) | 테두리 1px `gray200`, 텍스트 `gray600`, 13px/500 |
| 세그먼트 탭 | 컨테이너 배경 `gray50`, radius 11px, padding 4px / 활성 항목 흰 배경 + radius 8px + 그림자 |
| 코드 입력 칸 | 정사각형(aspect-ratio 1), 입력됨: 테두리 1.5px `primary` + 배경 `tinted`, 빈칸: 테두리 1px `gray200` |

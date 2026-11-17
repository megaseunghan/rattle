# ui

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

도메인과 무관한 Rattle 디자인 시스템 기본 컴포넌트다. 헤더·버튼·배지·입력·카드·시트·빈 상태·수치 텍스트를 제공하며 `constants/colors.ts`, `constants/fonts.ts`, `constants/designTokens.ts` 토큰만으로 스타일을 정한다. 시각 기준은 루트 `DESIGN.md`.

## Key Files

| File | Description |
|------|-------------|
| `index.ts` | 배럴 export: `AppBar`, `Badge`, `BottomSheet`, `Button`, `ChipRow`, `EmptyState`, `Field`, `GaugeBar`, `ListCard`, `SectionHeader`, `SummaryCard`. `NumericText`·`SheetModal`은 포함하지 않으므로 파일 경로로 import |
| `AppBar.tsx` | 화면 자체 헤더. 메인 탭(좌측 메뉴)과 하위 화면(뒤로가기 chevron) 변형, 부모 `GlassBackdrop` 투과 옵션 |
| `Badge.tsx` | `BadgeVariant`(`positive`/`negative`/`neutral`/`employment`/`auto`) 배지. 색은 `BadgeColors` 토큰 |
| `BottomSheet.tsx` | 제목 있는 하단 시트(`Colors.overlaySheet` 스크림) |
| `Button.tsx` | `primary`/`secondary`/`danger`/`text`/`pill`/`kakao` 버튼, 비활성·로딩 상태(라벨 유지, 스피너 겹침) |
| `ChipRow.tsx` | 단일 선택 칩 행(`selectedKey`, `accessibilityState.selected`) |
| `EmptyState.tsx` | 일러스트·설명·CTA가 있는 빈 상태 |
| `Field.tsx` | 라벨·도움말(`helpText`)이 있는 `TextInput` 래퍼, 우측 슬롯(`rightSlot`, 주소 검색 등) |
| `GaugeBar.tsx` | 0~1 진행률 막대, 부족 상태 시 negative 색 |
| `ListCard.tsx` | 목록 행 카드, 우측 `chevron`(이동)/`pencil`(수정) 아이콘 |
| `NumericText.tsx` | 금액·수치용 Geist 굵기별 텍스트와 고정폭 숫자. 조회 상태 문구는 본문 서체 유지 |
| `SectionHeader.tsx` | 섹션 제목·우측 액션. 이미 패딩이 있는 컨테이너용 이중 여백 방지 옵션 |
| `SheetModal.tsx` | 스크림은 고정하고 콘텐츠 레이어만 시트 높이만큼 이동시키는 모달 래퍼. 자식 오버레이의 키보드 처리·배경 탭·안전영역을 보존 |
| `SummaryCard.tsx` | 핵심 수치·증감·하위 지표(`subMetrics`) 요약 카드 |

## For AI Agents

### Working In This Directory

- 이 폴더에는 도메인 로직·서비스·훅 호출을 넣지 않는다. 업무 맥락이 필요하면 상위 `lib/components/`에 만든다.
- 색·서체·반경·간격은 `Colors`, `Fonts`, `Type`/`Radius`/`Spacing`/`CardStyle` 토큰을 사용하고 hex 값을 새로 넣지 않는다.
- 변형(variant)·props를 바꾸면 사용처가 많으므로(`NumericText` 17곳, `SheetModal` 10곳 등) `grep`으로 사용처를 확인하고 기본값 동작을 보존한다.
- 터치 영역 44pt 이상, `accessibilityRole`/라벨, 로딩 중 중복 탭 방지를 유지한다.
- 공용 컴포넌트를 `index.ts`에 추가할 때는 기존 named export 형식을 따른다.

### Testing Requirements

- 대응 테스트: `__tests__/components/SheetModal.test.tsx`. 그 외 ui 컴포넌트는 상위 화면·컴포넌트 테스트에서 간접 검증된다.
- 실행: `npm test -- --runInBand --no-coverage __tests__/components/SheetModal.test.tsx`, `npm run typecheck`. 시각 변경은 빌드된 앱에서 모바일 기준으로 확인한다.

### Common Patterns

- `StyleSheet.create` + 토큰, 상태별 스타일 배열 결합.
- 아이콘은 `../../icons/AppIcon`, 일러스트는 `../../icons/Illustration`.

## Dependencies

### Internal

- `../../../constants/colors`, `../../../constants/fonts`, `../../../constants/designTokens`, `../../icons/*`(`AppBar`·`EmptyState`·`ListCard`)

### External

- `react`, `react-native`, `react-native-reanimated`·`react-native-worklets`(`SheetModal` 시트 이동)

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

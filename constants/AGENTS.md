# constants

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

앱 전역 디자인 토큰이다. 색상(`colors.ts`), 서체(`fonts.ts`), 크기·반경·간격·카드/배지 스타일(`designTokens.ts`)을 정의하며 `app/`·`lib/`의 약 100개 파일이 사용한다. 루트 규칙의 "`Colors.*` 사용, 하드코딩 금지"와 "Wanted Sans 본문, Geist 숫자를 `constants/fonts.ts` 토큰으로 사용"의 기준 파일이다. 시각 결정 원문은 루트 `DESIGN.md`.

## Key Files

| File | Description |
|------|-------------|
| `colors.ts` | `Colors` 토큰: Toss TDS 기반 파랑 브랜드(`primary` `#3182F6`, `action`, `dark`, `deeper`, `light`, `pale`, `bg`, `tinted`), 홈 바탕·테두리·업무/맥락 배경(`homeCanvas`, `homeBorder`, `taskBg`, `contextBg`, `focusBg`, `fieldErrorBg`, `totalBg`), `gray50`~`gray900`, 오버레이(`overlay`, `overlaySheet`, `overlayDetail`, `overlayCoach`), 상태(`success`/`warning`/`danger`/`info`/`positive`/`negative` 및 배경), `kakao`, `glass`(`background`/`border`/`shadow`/`tint`), `sentiment`. `ColorKey` 타입, 매장 ID 해시로 글래스 틴트를 고르는 `glassTintForStore` |
| `fonts.ts` | `Fonts`(Wanted Sans·Geist 정적 굵기별 이름, 기존 `pretendard*`/`spaceGrotesk*` 이름은 호환 별칭), `FONT_ASSETS`(`app/_layout.tsx`의 `useFonts` 입력), `FONT_LICENSES`(`assets/fonts/licenses.json` 번들 포함), 굵기 → 폰트 매핑 함수 `pretendard()`/`spaceGrotesk()` |
| `designTokens.ts` | `Type`(글자 크기 스케일), `Radius`, `Spacing`(화면 좌우 20 등), `DetailSheetMotion`(시트 진입/퇴장 ms), `CardStyle`, `ScreenTitle`, `SummaryCardStyle`, `ListCardStyle`/`ListCardSelectedStyle`, `BadgeVariant`/`BadgeColors`/`BadgeStyle`/`BadgeTextStyle` |

## For AI Agents

### Working In This Directory

- 화면·컴포넌트에서 hex·rgba 값을 직접 쓰지 말고 여기 토큰을 사용한다. 필요한 색이 없으면 의미 이름으로 토큰을 추가하고 `DESIGN.md`와 대조한다.
- 매장별 색은 `glassTintForStore(store.id)`처럼 `store.id` 기준으로 매핑한다(루트 규칙). 매장 이름·순서로 색을 정하지 않는다.
- 토큰 값 변경은 전 화면에 영향을 준다. 기존 토큰의 의미를 바꾸기보다 새 토큰을 추가하고, 값 변경 시 대비(작은 글자 `action` 등)와 빌드된 앱 화면을 확인한다.
- `Fonts`의 호환 별칭(`pretendard*`, `spaceGrotesk*`)은 기존 화면이 사용 중이므로 제거하지 않는다. 새 코드는 `wanted*`/`geist*` 이름을 쓴다.
- 폰트 파일을 추가·교체하면 `FONT_ASSETS`와 `assets/fonts/licenses.json` 라이선스를 함께 갱신한다. 서체 패밀리를 늘리지 않는다(승인된 서체는 2종).
- `designTokens.ts`는 `colors.ts`를 import한다. 반대 방향 import로 순환을 만들지 않는다.

### Testing Requirements

- 전용 테스트는 없다. `npm run typecheck`로 토큰 이름 변경 영향을 확인하고, 주요 사용처 컴포넌트 테스트(`__tests__/components/`)를 `npm test -- --runInBand --no-coverage <path>`로 실행한다. 시각 변경은 루트 규칙대로 빌드된 앱 시뮬레이터 전후 비교로 검증한다.

### Common Patterns

- `color: Colors.gray600`, `fontFamily: Fonts.wantedSemiBold`, `fontSize: Type.sm`, `borderRadius: Radius.md`, `paddingHorizontal: Spacing.screenX`.
- 숫자 강조는 `lib/components/ui/NumericText`(Geist)를 거친다.

## Dependencies

### Internal

- `../assets/fonts/*.ttf`, `../assets/fonts/licenses.json`

### External

- `react-native`(`ViewStyle`/`TextStyle` 타입)

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

# assets

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

앱 아이콘·스플래시·로그인 보조 이미지, 번들 서체, Rattle 공통 아이콘(SVG 선 아이콘·입체 PNG 일러스트) 원본과 런타임 파생본을 보관한다.

## Key Files

| File | Description |
|---|---|
| `Rattle_ios_1024.png`, `Rattle_512x512.png`, `Rattle_adaptive_fg.png`, `Rattle_192x192.png` | `app.json`의 iOS/Android 아이콘, adaptive foreground, web favicon |
| `Rattle_<N>x<N>.png`, `Rattle_master_original.png`, `Rattle_1024x1024.png` | 크기별 앱 아이콘 파생본과 마스터 원본 |
| `splash-blank.png`, `home-ledger.png`, `google-g.png` | 스플래시 배경, 홈 이미지, Google 로그인 로고 |
| `rattle-common-icons-2026-10-30.zip` | 최초 고해상도 공통 아이콘 납품본(미추적) |

## Subdirectories

| Directory | Purpose |
|---|---|
| `fonts/` | Wanted Sans(본문·한글), Geist(숫자 강조) 400/500/600/700 TTF와 OFL 라이선스, `FONT-SOURCES.md`, `licenses.json`. Pretendard·Space Grotesk는 현재 `FONT_ASSETS`에서 참조하지 않는 이력 자산 |
| `icons/` | 공통 아이콘 패키지. `README.md`, `preview.html`, `preview-board.png`, `catalog.json`·`validation.json`·`processing.json`·`generation.json`·`raster-plan.json` |
| `icons/navigation/` | 직접 작성한 24×24 선 아이콘 SVG 58개(의미 56 + checkbox/radio 선택 변형 2), `README.md` |
| `icons/business/` | 업무용 투명 PNG 16종 |
| `icons/status/` | 상태·빈 화면 투명 PNG 8종 |
| `icons/originals/` | 이미지 생성 PNG 원본 24개(가공 전 보존) |
| `icons/runtime/` | 앱이 실제로 쓰는 256px 파생 PNG(`business/`, `status/`) |
| `icons/brand/` | 기존 iOS·Android 앱 아이콘 보관용 사본 |
| `icons/providers/` | 기존 Google G 공식 자산 사본 |
| `icons/reference/` | 사용자 제공 스타일 참조 보드(하단 안 3만 근거, 미추적) |

## For AI Agents

### Working In This Directory

- 서체는 `constants/fonts.ts` 토큰으로만 사용한다. 본문 Wanted Sans, 숫자 Geist. 새 서체 추가 시 출처·SHA256·라이선스를 `FONT-SOURCES.md`, `licenses.json`에 남긴다.
- SVG는 `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, 선 1.8, 둥근 끝·모서리 규격을 지킨다. RN에서는 SVG import transformer를 가정하지 말고 `lib/icons/AppIcon.tsx`(react-native-svg)와 생성된 `lib/icons/vectorAssets.ts`를 거친다.
- PNG 일러스트는 `lib/icons/Illustration.tsx`가 이름으로 참조하며 `runtime/` 파생본을 쓴다. 고해상도 원본과 `originals/`는 지우지 않는다.
- 생성 스크립트는 수정된 파일을 덮어쓰지 않고 중단한다. 손으로 고친 SVG가 있으면 생성 전에 차이를 확인한다.
- 색은 UI(`Colors.*`)에서 제어하고 선택 의미를 색만으로 전달하지 않는다. 터치 영역 44pt와 접근성 이름은 버튼 쪽에서 확보한다.
- Apple·Kakao·Toss 공식 로고를 새 스타일로 다시 그리지 않는다. `brand/`, `providers/`는 사본이며 원본 교체용이 아니다.
- 앱 아이콘 파일명을 바꾸면 `app.json` 참조를 함께 고쳐야 한다.

### Testing Requirements

- `node scripts/create-rattle-icons.mjs --check`, `node scripts/validate-rattle-icon-assets.mjs --report`
- 갤러리 재생성 `node scripts/build-rattle-icon-gallery.mjs`, RN 모듈 재생성 `node scripts/build-rattle-native-icons.mjs`, 런타임 PNG 재생성 `node scripts/build-rattle-runtime-images.mjs`(pngjs 간접 의존성 필요)
- 자동 형식 검사는 실제 16/20/24pt 렌더링·VoiceOver·Android 표시 검증을 대신하지 않는다. 앱 화면 변경은 빌드 앱에서 확인한다.

### Common Patterns

- 납품·가공 기록은 JSON(경로·치수·SHA-256)으로 남기고 README에 상태(미실행 포함)를 적는다.

## Dependencies

### Internal

- `../app.json`, `../constants/fonts.ts`, `../lib/icons/`, `../scripts/*rattle-icon*.mjs`, `../docs/archive/2026-10/공통-아이콘-Assets-제작목록-2026-10-30.md`

### External

- `react-native-svg`, `expo-font`, pngjs(간접 의존성, 가공 스크립트용)

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

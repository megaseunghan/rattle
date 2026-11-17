# icons

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

Rattle 공통 아이콘과 장식 일러스트 렌더러다. 단색 벡터 아이콘은 생성 파일 `vectorAssets.ts`의 SVG 문자열을 `react-native-svg`로 그리고, 업무·상태 일러스트는 `assets/icons/runtime/` PNG를 `Image`로 그린다. 기존 Ionicons 이름을 새 자산으로 매핑해 점진적으로 이전 중이다.

## Key Files

| File | Description |
|------|-------------|
| `AppIcon.tsx` | 공용 아이콘 컴포넌트. `vectorAssets` 이름 또는 Ionicons 레거시 이름을 받아 `legacyIconAssets`로 매핑하고, 매핑이 없으면 Ionicons로 대체. 기본 색 `#191F28`, `glyphMap` 호환 속성 제공 |
| `vectorAssets.ts` | `scripts/build-rattle-native-icons.mjs`가 `assets/icons/navigation/*.svg`에서 생성한 SVG 문자열 맵과 `VectorAssetName`. 직접 수정 금지 |
| `Illustration.tsx` | 업무(`open-prep`, `inventory`, `payroll` 등)·상태(`empty-data`, `load-error`, `access-denied` 등) PNG 일러스트. 접근성 트리에서 숨김(라벨은 네이티브 UI가 담당) |
| `MoreDrawerIcon.tsx` | 더보기 드로어용 30pt 아이콘. 매장 전용 인라인 SVG(`store-overview`/`store-add`/`store-settings`) 또는 `Illustration` |
| `homeActionIllustrations.ts` | `HomeActionId` → `IllustrationName` 매핑(홈 업무 액션 카드) |

## For AI Agents

### Working In This Directory

- 아이콘을 추가하려면 `assets/icons/navigation/`에 SVG를 넣고 `node scripts/build-rattle-native-icons.mjs`로 `vectorAssets.ts`를 재생성한다. 생성 파일을 손으로 고치지 않는다. 자산 규칙은 `assets/icons/navigation/README.md`(현재 다른 작업의 미커밋 변경 있음)를 확인한다.
- 새 화면 코드는 `vectorAssets` 이름을 우선 사용하고 Ionicons 레거시 이름을 새로 늘리지 않는다. `legacyIconAssets` 매핑 제거 시 사용처를 함께 바꾼다.
- 아이콘 색은 호출자가 `Colors.*`로 넘긴다. SVG 안에 하드코딩된 색(`MoreDrawerIcon`의 매장 아이콘)은 승인된 일러스트 예외이며 일반 아이콘에 색을 박지 않는다.
- 일러스트는 장식이므로 접근성에서 숨긴다. 의미 있는 상태·행동은 텍스트 라벨로 전달한다.
- `assets/icons/reference/`·zip 등 미추적 자산은 다른 작업 소유일 수 있으니 임의로 런타임에 연결하지 않는다.

### Testing Requirements

- 대응 테스트: `__tests__/components/AppIcon.test.tsx`. `Illustration`·`MoreDrawerIcon` 전용 테스트는 없다. Jest는 `@expo/vector-icons`를 `__mocks__/@expo/vector-icons.js`로 대체한다.
- 실행: `npm test -- --runInBand --no-coverage __tests__/components/AppIcon.test.tsx`, `npm run typecheck`. 실제 렌더 품질은 빌드된 앱에서 확인한다.

### Common Patterns

- `<AppIcon name="inventory" size={20} color={Colors.gray600} />`
- `<Illustration name="empty-data" size={64} />`

## Dependencies

### Internal

- `../../types`(`HomeActionId`), `assets/icons/runtime/**`(PNG), `assets/icons/navigation/*.svg`(생성 원본), `scripts/build-rattle-native-icons.mjs`

### External

- `react-native-svg`(`SvgXml`), `@expo/vector-icons`(Ionicons 대체), `react-native`(`Image`)

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

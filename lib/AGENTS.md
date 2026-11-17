# lib

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

앱 화면(`app/`)이 공유하는 비화면 계층이다. Supabase 접근(`services/`), 도메인 상태 훅(`hooks/`), 공통 UI(`components/`), 순수 계산·검증(`utils/`), TanStack Query 클라이언트(`query/`), 전역 컨텍스트(`contexts/`), 벡터 아이콘(`icons/`), 통합 대기 중인 보조 타입(`types/`)을 둔다.

의존 방향은 `app/` → `hooks/`·`components/` → `services/` → `supabase.ts`이며, `utils/`와 `../types`는 어느 계층에서나 쓰는 하위 계층이다.

## Key Files

| File | Description |
|------|-------------|
| `supabase.ts` | Supabase 클라이언트 단일 인스턴스. 세션은 `utils/secureStorageAdapter`(Keychain/Keystore)에 저장한다. URL·키는 `EXPO_PUBLIC_*` 환경값에서 읽으며 값을 출력·복사하지 않는다 |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `services/` | DB·Edge Function·외부 API 호출 계층. 앱에서 `supabase`를 직접 쓰는 유일한 곳 (see `services/AGENTS.md`) |
| `hooks/` | 서비스를 감싸 매장·역할·기간 범위 상태를 제공하는 도메인 훅 (see `hooks/AGENTS.md`) |
| `components/` | 여러 화면이 공유하는 도메인 컴포넌트와 `home-financial/` 차트 (see `components/AGENTS.md`) |
| `components/ui/` | 도메인 무관 디자인 시스템 기본 컴포넌트 (see `components/ui/AGENTS.md`) |
| `utils/` | 부작용 없는 계산·검증·포맷·저장 어댑터 (see `utils/AGENTS.md`) |
| `query/` | TanStack Query 클라이언트·키·무효화·재무 요약 배치 (see `query/AGENTS.md`) |
| `contexts/` | `AuthContext`(인증·매장·역할)와 `TabPagerContext` (see `contexts/AGENTS.md`) |
| `icons/` | 생성된 벡터 자산과 아이콘·일러스트 렌더러 (see `icons/AGENTS.md`) |
| `types/` | `types/index.ts` 통합 전 임시 보조 타입 (see `types/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- 루트 `AGENTS.md`의 개발 컨벤션(서비스 레이어 전용 DB 접근, 훅이 서비스를 감쌈, `Colors.*`·`constants/fonts.ts` 토큰, 새 도메인 순서 `types/index.ts` → `lib/services` → `lib/hooks` → `app`)을 그대로 따른다.
- `lib/contexts/AuthContext.tsx`, `lib/query/`, 루트 `types/index.ts`는 공유 파일이다. 한 작업에서 한 작성자만 수정하고, 소유자를 정하지 않았으면 수정하지 않는다.
- 계정·매장·역할·미리보기·기간이 바뀔 때 이전 응답이 섞이지 않게 하는 범위 키(`useQueryScope` 또는 훅 내부 `scope`/`identity` + 요청 번호) 패턴을 유지한다.
- 금액 데이터를 AsyncStorage에 새로 저장하지 않는다. 저장 후에는 `services/cacheInvalidation.ts`·`query/client.ts`의 취소 후 무효화를 거친다.

### Testing Requirements

- 대응 테스트: `__tests__/services`, `__tests__/hooks`, `__tests__/components`, `__tests__/utils`, `__tests__/query`, `__tests__/contexts`. `__tests__/setup.ts`가 `lib/supabase`를 전역 mock한다.
- 실행: `npm test -- --runInBand --no-coverage <path>`, 정적 검사 `npm run typecheck`.

### Common Patterns

- 서비스는 Supabase 오류를 throw하고, 훅은 `utils/error`의 `getErrorMessage`로 사용자 문구를 만든다. 내부 DB/API 오류 원문은 화면에 노출하지 않는다.
- 미확인 금액은 0원으로 바꾸지 않는다(`utils/financialCoverage.sumKnown`).

## Dependencies

### Internal

- `../types/index.ts`(도메인 타입), `../constants/`(색상·서체·디자인 토큰)

### External

- `@supabase/supabase-js`, `@tanstack/react-query`, `react-native`, `expo-router`, `react-native-reanimated`, `react-native-svg`, `@react-native-async-storage/async-storage`

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

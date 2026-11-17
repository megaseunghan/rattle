# __tests__

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

Jest(`jest-expo` preset) 기반 단위·컴포넌트·훅·서비스·Edge Function 핸들러 테스트다. 2026-11-17 기준 133개 테스트 파일. 모두 mock 기반이며 실제 Supabase 인증·RLS·서버 상태를 검증하지 않는다. 테스트 설명(`it`/`test` 이름)은 한국어로 동작을 서술한다.

## Key Files

| File | Description |
|---|---|
| `setup.ts` | `lib/supabase`를 전역 mock하는 레거시 설정 파일. **현재 어디에서도 로드되지 않는다** — `package.json`의 `testPathIgnorePatterns`로 테스트 수집에서 제외되고 `setupFilesAfterEnv`에도 없다. 각 테스트가 필요한 mock을 직접 선언한다 |

관련 루트 파일:

| File | Description |
|---|---|
| `../__mocks__/@expo/vector-icons.js` | `moduleNameMapper`로 `@expo/vector-icons`(및 하위 경로)를 아이콘 이름을 `Text`로 렌더하는 가짜 컴포넌트로 대체 |
| `../jest.animations.js` | `setupFilesAfterEnv`. `react-native-reanimated`·`react-native-worklets`를 즉시 완료되는 mock으로 대체(네이티브 모션은 Release 앱에서 확인) |

## Subdirectories

| Directory | Purpose |
|---|---|
| `components/` (55) | 화면·공통 컴포넌트 렌더/상호작용. `@testing-library/react-native`로 `app/` 라우트 화면(예: `LoginScreen`, `StoreSettingsRecovery`, `NewPurchaseFlow`)과 `components/`를 렌더하고 `expo-router`·서비스 모듈을 mock |
| `contexts/` (1) | `AuthContext.test.tsx`: 세션·매장·역할 전환 흐름 |
| `functions/` (3) | `deleteAccount`, `tossProxy`, `tossWebhook`: `supabase/functions/*/handler.ts`를 직접 import해 의존성 mock으로 HTTP 경계 검사(`@jest-environment node`) |
| `hooks/` (24) | `lib/hooks/*`를 `renderHook` + `QueryClientProvider`로 검사. `useAuth`·서비스 mock, 캐시 무효화·복구·권한 |
| `query/` (2) | `lib/query/client`의 `queryKeys`·`invalidateStoreData`·`clearQueryData`, 알림 폴링 |
| `services/` (35) | `lib/services/*`의 DB/RPC 호출 계약. 파일마다 `jest.mock('../../lib/supabase', ...)`로 `from`/`rpc`/`functions.invoke`를 대체 |
| `utils/` (13) | `lib/utils/*` 순수 함수(단위 환산, 급여 조건, 홈 워크플로, 스플래시 모핑 등) |

## For AI Agents

### Working In This Directory

- 새 테스트는 대상 계층과 같은 하위 폴더에 `<대상이름>.test.ts(x)`로 둔다. 테스트 파일 이름 변경은 다른 작업 소유일 수 있으니 확인한다(예: 현재 `deleteEmptyOwnedStore.test.ts` → `storeDeletion.test.ts`는 미커밋 이름 변경).
- `lib/supabase` mock이 누락되면 실제 클라이언트가 외부로 요청할 수 있다. 서비스·훅 테스트에는 반드시 mock을 선언하고, 필요하면 가짜 환경값을 쓴다.
- `jest.mock` 팩토리에서 참조하는 외부 변수는 `mock` 접두사를 붙인다(`mockStore`, `mockGet`).
- 계정·매장·기간 전환 시 이전 응답·캐시가 섞이지 않는지, 저장 성공 후 조회 실패·응답 유실 같은 분기를 별도 케이스로 둔다.
- mock 통과를 실제 JWT/RLS·네이티브 화면 검증 완료로 보고하지 않는다.

### Testing Requirements

- 전체: `npm test -- --runInBand --no-coverage`
- 대상 지정: `npm test -- __tests__/services/storeDeletion.test.ts --runInBand --no-coverage`
- 무시 경로(`package.json` `jest`): `/node_modules/`, `/__tests__/setup.ts`, `/.worktrees/`(`modulePathIgnorePatterns`에도 포함), `<rootDir>/supabase/functions/`. 따라서 `.worktrees/` 아래 사본의 테스트는 기본적으로 실행되지 않고, `supabase/functions/_shared/*.test.ts`(Deno)도 Jest에서 돌지 않는다.
- 타입 검사는 별도: `npm run typecheck`.

### Common Patterns

- AAA 구조. mock 초기화는 파일마다 다르다(`beforeEach(() => jest.resetAllMocks())` 또는 개별 `mockReset`/`mockClear`); 기존 파일의 방식을 따른다.
- 훅: `createElement(QueryClientProvider, { client: queryClient }, children)` 래퍼 + `afterEach`에서 `clearQueryData()`.
- 컴포넌트: `render` → `fireEvent` → `waitFor`/`screen` 단언, `Alert`·`Platform` 분기 확인.
- 서비스: `const rpc = supabase.rpc as jest.Mock`으로 RPC 이름·인자·오류 매핑 단언.

## Dependencies

### Internal

- `app/`, `components/`, `lib/services/`, `lib/hooks/`, `lib/contexts/AuthContext`, `lib/query/client`, `lib/utils/`, `supabase/functions/*/handler.ts`

### External

- `jest` ^29.7.0, `jest-expo` ^55.0.11, `@testing-library/react-native` ^13.3.3, `@tanstack/react-query`

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

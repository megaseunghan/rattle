# contexts

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

앱 전역 React Context다. `AuthContext`는 인증 세션·매장 목록·선택 매장·매장별 역할·재무 접근 권한·관리자 미리보기를 관리하는 신원/권한의 단일 출처이고, `TabPagerContext`는 탭 페이저 이동과 홈 범위·선택 월 같은 탭 간 UI 상태를 공유한다.

## Key Files

| File | Description |
|------|-------------|
| `AuthContext.tsx` | `AuthProvider`/`useAuth`. `user`·`session`·`store`·`stores`·`memberRoles`·`currentRole`(미리보기 적용)·`realRole`·`canReadFinancials`·`signOut`·`refreshStore`·`switchStore`·`devPreviewMode`/`devPreviewEmployeeId`/`setDevPreview`. `onAuthStateChange` 구독, 마지막 매장 ID(`LAST_STORE_ID`)만 AsyncStorage에 저장, 앱 활성/5분 주기로 매장·재무 접근 재검증, 신원 변경·로그아웃 시 쿼리 캐시·POS 동기화 게이트·레거시 금액 캐시 정리 |
| `TabPagerContext.tsx` | `TabPagerContext`/`useTabPager`. 활성 탭, `goToTab`, 사장님 홈 모드(`dashboard`/`store`), 매장 선택기 열기·범위 선택, 선택 월, 화면별 보기 상태, 직원 등록 진입 신호, 내부 가로 제스처 잠금. Provider는 `app/(tabs)/_layout.tsx` |

## For AI Agents

### Working In This Directory

- `AuthContext.tsx`는 루트 규칙상 단일 소유자 공유 파일이다. 소유자를 정하지 않은 작업에서는 수정하지 않는다.
- 인증·매장·역할 상태 변경 경로에는 요청 번호(`storeRequestId`, `authRequestId`)로 늦은 응답이 현재 선택을 덮어쓰지 않게 하는 패턴을 유지한다.
- 신원(사용자·매장 목록·소유자·공유 범위·재무 접근·역할)이 바뀌면 `clearQueryData()`로 캐시를 비운다. 이 순서를 제거하면 다른 계정·권한의 금액이 섞일 수 있다.
- 재무 접근 조회 실패 시 멤버는 차단(fail closed)한다. 서버 확인 없이 `canReadFinancials`를 true로 만들지 않는다.
- `onAuthStateChange` 콜백 안에서 Supabase 쿼리를 직접 await하지 않는다(파일 내 주석 참고).
- AsyncStorage에는 마지막 매장 ID 외 금액·세션 토큰을 저장하지 않는다. 세션은 `lib/utils/secureStorageAdapter`가 보관한다.
- `currentRole`은 미리보기 반영 값이고 화면 분기용이다. 서버 권한 검증을 대체하지 않으며, 미리보기 스위처 노출 판단은 `realRole`로 한다.
- `TabPagerContext`에 새 필드를 추가할 때는 optional로 두어 기존 Provider·테스트 mock과 호환을 유지한다.

### Testing Requirements

- 대응 테스트: `__tests__/contexts/AuthContext.test.tsx`. 탭 페이저 동작은 `__tests__/components/TabsScope.test.tsx` 등 화면 테스트에서 간접 검증.
- 실행: `npm test -- --runInBand --no-coverage __tests__/contexts`, `npm run typecheck`. 실제 로그인·소셜 인증·RLS는 Jest로 대체되지 않는다.

### Common Patterns

- 소비 측은 `const { user, store, currentRole, devPreviewMode, canReadFinancials } = useAuth();`로 범위 키를 만든다.
- `useTabPager()`는 Provider 밖에서 호출하면 throw한다. 테스트에서는 `TabPagerContext.Provider`로 감싼다.

## Dependencies

### Internal

- `../supabase`, `../services/stores`(`getFinancialAccess`), `../services/posSyncCoordinator`, `../query/client`(`clearQueryData`), `../query/legacyPosCache`, `../utils/financialSharing`, `../utils/expenseCategorySession`, `../utils/error`, `../../types`

### External

- `react`, `react-native`(`AppState`), `@supabase/supabase-js`, `@react-native-async-storage/async-storage`

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

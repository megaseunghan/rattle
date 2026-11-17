# (auth)

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

인증 전 및 매장 미선택 상태의 라우트 그룹. 소셜 로그인, 매장 선택·생성·복구, 참여 코드 기반 직원 합류 신청을 담당한다. 진입·이탈 리다이렉트는 이 폴더가 아니라 `app/_layout.tsx`의 `RootNavigator`가 결정한다(미로그인 → `login`, 매장 없음 → `select-store`, 매장 있음 → `/(tabs)`; `select-store`·`join-store`는 매장이 있어도 머물 수 있음).

## Key Files

| File | Description |
|---|---|
| `_layout.tsx` | 헤더 없는 Stack(`login`, `select-store`, `join-store`) |
| `login.tsx` | 카카오·Google·Apple 로그인(`signInWithSocialProvider`). `isQaLoginEnabled()`일 때만 QA 역할 로그인 패널(`signInForQa`, `qaRole` 파라미터) 표시. 약관·개인정보처리방침(`/legal/*`) 링크 |
| `select-store.tsx` | 소속 매장 목록·전환(`switchStore` → `/(tabs)`), 새 매장 생성(`StoreSetupWizard`; POS "지금" 선택 시 `/settings/pos-sync?setup=1`), 삭제한 매장 복구(`listMyDeletedStores`, `restoreDeletedStore`), 매장 참여 진입, 로그아웃 |
| `join-store.tsx` | 참여 코드 확인(`getStoreInviteCode`) 후 질문 하나씩 진행하는 합류 온보딩(`joinSteps`, `validateJoinQuestion`), 진행률 표시, 최종 요약에서 개별 수정, `submitJoinOnboarding` 제출. 고용 형태에 따라 시급/월급·비과세 단계가 달라짐 |

## For AI Agents

### Working In This Directory

- 리다이렉트 조건을 바꿀 때는 `app/_layout.tsx`와 `lib/contexts/AuthContext.tsx`를 함께 본다. 로그아웃 직후 빈 화면이 생기지 않도록 `segments` 검사(`login`, `select-store`, `join-store`)를 유지한다.
- 로그인 정책(Apple은 iOS 전용, 탈퇴·재인증 순서)은 루트 `AGENTS.md`「탈퇴·인증」과 `docs/에이전트-제품결정-기술참고.md`의 소셜 로그인 절을 따른다. OAuth 콜백 처리는 `lib/services/authCallback`에 있다.
- QA 로그인은 `isQaLoginEnabled()` 게이트 밖으로 노출하지 않는다. 테스트 계정 정보·토큰을 코드나 문서에 넣지 않는다.
- 합류 신청 제출은 관리자 최종 합류가 아니다. 제출 완료 화면에서 합류·급여 반영을 완료로 표시하지 않는다(루트「직원 합류」).
- 매장 생성 시 사업자번호 입력을 필수로 만들지 않고 POS 연결은 지금/나중 선택을 유지한다(루트「최초 설정·공유」). 생성 요청 중복은 `knownRequestIds`(`setup_request_id`)로 막는다.
- 질문형 입력은 뒤로가기 시 답변 보존, 현재 단계 오류 표시, `useConfirmLeave` 이탈 확인을 유지한다.

### Testing Requirements

- `npm run typecheck`
- `__tests__/components/LoginScreen.test.tsx`, `JoinStoreOnboarding.test.tsx`, `StoreSetupWizard.test.tsx`, `StoreSettingsRecovery.test.tsx`(삭제 후 `select-store` 이동)
- 관련: `__tests__/contexts/AuthContext.test.tsx`, `__tests__/services/socialAuth.test.ts`, `authCallback.test.ts`, `qaLogin.test.ts`, `storeDeletion.test.ts`, `__tests__/utils/joinOnboarding.test.ts`
- 실행: `npm test -- --runInBand --no-coverage __tests__/components/LoginScreen.test.tsx`
- 실제 소셜 로그인·딥링크 복귀는 빌드 앱에서만 검증된다. mock 테스트 통과를 실제 인증 통과로 보고하지 않는다.

### Common Patterns

- 비동기 처리 중 버튼 `loading`/`accessibilityState.busy` 표시, 실패 시 `Alert` + `getErrorMessage`.
- 목록·복구 조회는 `Promise.allSettled`로 부분 실패를 분리해 표시.
- 디자인 토큰: `Colors`, `Spacing`/`Radius`/`Type`(`constants/designTokens`), `Fonts`.

## Dependencies

### Internal

- `lib/contexts/AuthContext`, `lib/services/{socialAuth,qaLogin,stores,storeMembers}`, `lib/components/{StoreSetupWizard,ErrorMessage,ui}`, `lib/utils/{joinFlow,joinOnboarding,storeDeletion,error}`, `lib/hooks/useConfirmLeave`

### External

- `expo-router`, `@expo/vector-icons`, `@react-native-community/datetimepicker`, `react-native-safe-area-context`

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

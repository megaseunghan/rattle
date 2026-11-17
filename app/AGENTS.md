# app

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

expo-router 파일 기반 라우트 루트. 루트 Stack, 인증·매장 선택 리다이렉트, 역할·손익 공유 기반 경로 차단, 탭 셸과 각 도메인 화면(매출·매입·재고·레시피·인건비·손익·설정 등)을 둔다. 화면은 표시와 상호작용만 담당하고 자료 접근은 `lib/hooks`·`lib/services`를 거친다(루트 `AGENTS.md`의 서비스 레이어 규칙).

## Key Files

| File | Description |
|---|---|
| `_layout.tsx` | 루트 레이아웃. 폰트 로드, `RattleQueryProvider` + `AuthProvider`, 스플래시(`SplashAnimation`), OAuth 콜백 딥링크(`completeAuthCallback`), 포그라운드 복귀 시 `autoSyncOnForeground`. 미로그인 → `/(auth)/login`, 매장 없음 → `/(auth)/select-store`, 그 외 `(auth)` 진입 시 `/(tabs)`로 보낸다. `isFinancialRoute`(pos·purchases·expenses·profit-loss)는 `canReadFinancials`가 없으면, `/admin`·`/profit-loss`·`/settings/pos-sync`는 관리자가 아니면 `/(tabs)`로 되돌린다. `__DEV__`에서 `DevRoleSwitcher` 표시 |
| `+not-found.tsx` | 알 수 없는 경로 화면. 인증 상태에 따라 로그인·매장 선택·홈으로 복귀 |
| `expenses.tsx` | 비용 등록 단독 화면. `ExpensesPanel`을 `AppBar`와 함께 감싼 얇은 래퍼(매입 탭의 비용 섹션과 같은 패널) |

## Subdirectories

| Directory | Purpose |
|---|---|
| `(auth)/` | 로그인·매장 선택/생성/복구·매장 참여 온보딩. `(auth)/AGENTS.md` 참고 |
| `(tabs)/` | PagerView 기반 하단 탭 셸(홈·재고·매입·인건비·매출)과 빠른 등록 FAB·더보기 드로어. `(tabs)/AGENTS.md` 참고 |
| `admin/` | `index.tsx` — 전체 매장 통합 대시보드(`AdminDashboardScreen`, `useAdminDashboard`). 홈 탭의 `dashboard` 모드에 `embedded`로 재사용. 관리자 전용 |
| `cleaning/` | `index.tsx` 청소 체크리스트 진행, `edit.tsx` 체크리스트 편집(`useCleaningChecklist`) |
| `legal/` | `terms.tsx` 이용약관, `privacy.tsx` 개인정보처리방침. 정적 문서, 로그인 화면에서 링크 |
| `mypage/` | `index.tsx` 마이페이지, `schedule.tsx` 내 스케줄, `requests.tsx` 스케줄 변경 요청함(`useRequestApprovals`), `payslip.tsx` 급여 명세서, `work-minutes.tsx` 파트타이머 일별 근무 제출(`DailyWorkPanel`, `usePayrollSubmissions`; `LegacyWorkMinutesScreen` 함께 export) |
| `notifications/` | `index.tsx` 알림 목록(스와이프 행, 모두 읽음), `settings.tsx` 알림 설정 |
| `payroll/` | `settlement.tsx` 월 급여 정산 리포트(`yearMonth` 파라미터), `wage-condition.tsx` 직원 급여 조건 변경(`wageHistory` 서비스, 적용일 기준) |
| `pos/` | `index.tsx` 매출 탭 본문(`PosScreen`, Toss 동기화·분석·수기 매출), `[date].tsx` 일자별 매출 상세, `new.tsx` 수기 매출 추가/수정(`manualSales`) |
| `profit-loss/` | `index.tsx` 매장 손익계산서(`profitLoss` 서비스). 관리자 + 손익 열람 권한 필요 |
| `purchases/` | `new.tsx` 매입 등록(유형·품목·식자재 연결, `date` 파라미터), `[id].tsx` 매입 상세 |
| `recipes/` | `index.tsx` 레시피 목록·카탈로그 가져오기·일괄 분류, `new.tsx` 등록, `[id].tsx` 상세. `useStorePermissions`로 열람/관리 분기 |
| `settings/` | 계정·매장·멤버·손익 공유·일 정산 시간·POS 연동·홈 업무 설정. `settings/AGENTS.md` 참고 |
| `stock/` | `new.tsx` 식자재 등록, `[id].tsx` 식자재 수정. `canManageStock` 권한 확인 |

## For AI Agents

### Working In This Directory

- 새 라우트는 기본 `headerShown: false`(루트 `screenOptions`)를 따르고 화면 안에서 `AppBar`(`lib/components/ui`)를 그린다. `_layout.tsx`의 `Stack.Screen` 목록은 일부만 명시돼 있으며 파일만 추가해도 라우트가 생긴다.
- 권한이 필요한 새 경로는 메뉴 숨김만으로 끝내지 말고 `_layout.tsx`의 경로 차단(`isFinancialRoute` 정규식 또는 관리자 전용 prefix)에 포함할지 판단하고, 서버 RLS도 확인한다.
- `(tabs)` 안에서 렌더되는 화면(`admin/index`, `pos/index`)은 named export(`AdminDashboardScreen`, `PosScreen`)와 `active` prop을 유지한다. 이름을 바꾸면 탭 셸과 `TabsScope` 테스트가 깨진다.
- 매장·계정·역할 전환 시 이전 응답이 남지 않게 `store.id`·`user.id` 기준으로 상태를 초기화하는 기존 패턴(scope ref, request counter)을 유지한다.
- 화면 ID(`Sxx`)·명세 연결은 루트 규칙을 따른다. 라우트 추가·삭제 시 `node scripts/validate-screen-coverage.mjs`를 실행한다.

### Testing Requirements

- `npm run typecheck`
- 라우트 화면 테스트는 `__tests__/components/`에 있다. 예: `NotFoundScreen.test.tsx`, `TabsScope.test.tsx`, `ProfitLossScreen.test.tsx`, `PosSetupScreen.test.tsx`, `NewPurchaseFlow.test.tsx`, `PurchaseDetailRecovery.test.tsx`, `StockRecipePermissions.test.tsx`, `MyPageScreen.test.tsx`, `PayslipScope.test.tsx`, `WageConditionScreen.test.tsx`, `NotificationsScreen.test.tsx`, `CleaningChecklistScreen.test.tsx`
- 실행: `npm test -- --runInBand --no-coverage __tests__/components/<파일>`
- 화면 변경의 완료 판단은 빌드된 시뮬레이터 앱에서 확인한다(루트 규칙).

### Common Patterns

- 미저장 입력이 있는 화면은 `useConfirmLeave(dirty || saving, { blockLeave: saving })`로 이탈을 막는다.
- 오류 표시는 `ErrorMessage`, 로딩은 `LoadingSpinner`; 사용자 문구는 `getErrorMessage(e, '<안내 문구>')`로 내부 오류 원문을 숨긴다.
- 배경은 `Colors.homeCanvas` + `GlassBackdrop`, 숫자 표시는 `NumericText`/Geist 토큰.
- 권한 분기는 `useAuth()`의 `currentRole`·`canReadFinancials` 또는 `useStorePermissions()`.

## Dependencies

### Internal

- `lib/contexts/AuthContext`, `lib/contexts/TabPagerContext`, `lib/hooks/*`, `lib/services/*`, `lib/components/*`, `lib/query`, `lib/utils/financialSharing`
- `constants/colors`, `constants/fonts`, `constants/designTokens`, `types/index.ts`

### External

- `expo-router`, `expo-linking`, `expo-web-browser`, `expo-font`, `expo-status-bar`
- `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-pager-view`, `@react-native-community/datetimepicker`

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

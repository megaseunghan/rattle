# (tabs)

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

로그인·매장 선택 후 진입하는 메인 셸. expo-router `Tabs`가 아니라 `react-native-pager-view`로 탭 페이지를 직접 스와이프·전환하고, 하단 탭 바·빠른 등록 FAB·매장 범위 선택·더보기 드로어를 한 레이아웃에서 관리한다. 각 탭 파일은 named export 화면 컴포넌트를 제공하고 `_layout.tsx`가 이를 페이지로 렌더한다.

## Key Files

| File | Description |
|---|---|
| `_layout.tsx` | 탭 셸. 역할별 탭 구성(손익 비공개 또는 파트타이머 → `home`·`stock`, 그 외 → `home`·`stock`·`purchases`·`payroll`·`sales`), 방문한 페이지만 마운트, `TabPagerContext` 제공(`goToTab`, `homeMode`, `selectedMonth`, `viewState`, `returnScope`, 직원 등록 요청, 내부 제스처 잠금). 소유자 본인일 때만 홈이 `dashboard`(통합 대시보드)↔`store` 전환. `StoreScopePicker`, `QuickAddMenu` + `DraggableFab`, `MoreDrawer`, `StoreAppBar`. 라우트 파라미터 `targetTab`·`homeScope`·`month`로 탭 복원 |
| `index.tsx` | `HomeScreen`. `HomeAlertsPanel`, 손익 열람 가능 시 `HomeFinancialCard`(`useHomeFinancialCard`), `DailyOperationsHome`(오픈·영업·마감 업무). 당겨서 새로고침, `scheduleIdleTask`로 지연 로드, 포그라운드 Toss 자동 동기화 |
| `stock.tsx` | `StockScreen`. `재고현황`/`레시피` 내부 섹션(`viewState['stock.section']`), 재고 부족·품절 표시, 분류 관리, `/stock/[id]`·`/stock/new`·`/recipes/new` 이동. `useStorePermissions`로 열람/관리 분기 |
| `purchases.tsx` | `PurchasesScreen`. `매입`/`비용` 내부 섹션(`viewState['purchase.section']`), 월 달력·공급처 필터(`LedgerFilters`), 매입 유형 관리, `ExpensesPanel`. `/purchases/new`(날짜 파라미터)·`/purchases/[id]` 이동 |
| `payroll.tsx` | `PayrollScreen`(1000줄+). 월별 직원 카드(`EmployeeCard`), 공제 입력 초안(`usePayrollDeductionDraft`), 파트타이머 제출 검토(`PayrollSubmissionReview`), 직원 등록/수정 `SheetModal`, 수습 90% 적용, `/payroll/settlement`·`/payroll/wage-condition` 이동 |

`sales` 탭은 `app/pos/index.tsx`의 `PosScreen`, 홈 `dashboard` 모드는 `app/admin/index.tsx`의 `AdminDashboardScreen embedded`를 렌더한다. `more`는 페이지가 아니라 드로어다.

## For AI Agents

### Working In This Directory

- 탭 화면은 `export function XxxScreen({ active })` + `export default` 형태를 유지한다. `active`가 false일 때는 조회·자동 동기화를 시작하지 않는다.
- 탭 목록·순서를 바꾸면 `tabs` 배열, `TAB_CONFIG`, `TabName`(`lib/contexts/TabPagerContext.tsx`), 인덱스 보정 effect, `targetTab` 복원 로직을 함께 확인한다.
- 탭 간 이동은 `goToTab`/`useTabPager()`를 쓴다. 통합 대시보드 상태에서 매장 단위 탭·빠른 등록을 누르면 먼저 매장 선택을 요구하는 흐름(`openStorePicker` → `selectStoreScope`)을 깨지 않는다.
- 내부 섹션 선택 등 탭 전환 후에도 남아야 하는 UI 상태는 `setViewState(key, value)`에 둔다. 금액 자료를 AsyncStorage에 두지 않는다.
- 가로 제스처(스와이프 행, 차트 등)는 `setPagerGestureActive(owner, active)`로 페이저 스크롤을 잠근다.
- 빠른 등록 FAB는 숨기지 말고 `bottomInset`·`dockBottom`·하단 여백으로 가림을 해결한다(루트 규칙). 직원 등록 항목은 관리자에게만 보인다.
- `payroll.tsx`는 이미 크므로 새 로직은 `lib/components`·`lib/hooks`·`lib/utils`로 분리한다.

### Testing Requirements

- `npm run typecheck`
- `__tests__/components/TabsScope.test.tsx`(탭 구성·매장 범위), `DailyOperationsHome.test.tsx`, `HomeFinancialCard.test.tsx`, `HomeFinancialSummary.test.tsx`, `StockRecipePermissions.test.tsx`, `PurchaseSupplierFilters.test.tsx`, `PayrollDeductionDraft.test.tsx`, `PayrollSubmissionReview.test.tsx`, `MoreDrawerMotion.test.tsx`
- 훅: `__tests__/hooks/usePurchasesUX.test.ts`, `usePayrollDeductions.test.ts`, `useHomeFinancialCard.test.ts`
- 실행: `npm test -- --runInBand --no-coverage __tests__/components/TabsScope.test.tsx`
- 스와이프·FAB 위치·탭 바 안전영역은 빌드된 시뮬레이터 앱에서 직접 확인한다.

### Common Patterns

- 역할 판정: `currentRole`, `resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId)`로 본인 직원 기록을 찾아 파트타이머 여부 결정(개발 미리보기 반영).
- 월 상태는 셸의 `selectedMonth`(`YYYY-MM`)를 공유한다.
- 목록 변경 애니메이션은 `animateListChange`, 배지·빈 상태는 `lib/components/ui`(`Badge`, `EmptyState`, `SummaryCard`).

## Dependencies

### Internal

- `lib/contexts/TabPagerContext`, `lib/contexts/AuthContext`
- `lib/components/{StoreAppBar,StoreScopeHeader,DraggableFab,MoreDrawer,GlassCard,GlassBackdrop,DailyOperationsHome,HomeAlertsPanel,HomeFinancialCard,ExpensesPanel,LedgerFilters,PayrollSubmissionReview,WorkMinutesForm,RecipeCard,CategoryManageModal}`
- `lib/hooks/{useEmployees,useNotifications,useTossSync,useIngredients,useRecipes,usePurchases,useExpenses,usePayroll,useStorePermissions}`
- `app/admin/index.tsx`, `app/pos/index.tsx`

### External

- `react-native-pager-view`, `react-native-safe-area-context`, `expo-router`, `expo-constants`

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

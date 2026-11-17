# hooks

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

`lib/services/` 함수를 감싸 화면에 로딩·오류·데이터·변경 함수를 제공하는 도메인 React 훅이다. `useAuth()`의 사용자·매장·역할·미리보기 값으로 요청 범위를 정하고, 범위가 바뀌면 이전 응답을 버린다. 일부는 TanStack Query(`../query`)를, 나머지는 `useState` + 요청 번호 패턴을 쓴다.

## Key Files

| File | Description |
|------|-------------|
| `useAdminDashboard.ts` | 통합 대시보드 기간(`DashboardPeriod`)별 다매장 손익·추이·주간 청소·근무 조회 (Query) |
| `useCategories.ts` | 재고 카테고리용 `useCategoryTaxonomy` 래퍼 |
| `useCategoryTaxonomy.ts` | `CategoryTaxonomy` 인스턴스를 받아 매장 카테고리 목록·추가·이름 변경·삭제·사용 건수(`countByCategory`)를 제공 |
| `useCleaningChecklist.ts` | 날짜별 청소 항목·로그 조회와 체크/해제·추가·수정·정렬 (Query) |
| `useConfirmLeave.ts` | 작성 중 폼을 벗어날 때 `beforeRemove`로 확인 알림, 의도적 이동용 `bypass()` 반환 |
| `useDailyChecklistSummary.ts` | 홈용 오늘 체크리스트 완료 요약 (Query) |
| `useDailyWork.ts` | 직원·월별 날짜별 근무 기록 조회, 범위 키와 요청 번호로 지연 응답 차단 |
| `useDashboard.ts` | 레거시 홈 대시보드(최근 활동·추정 소모량). `supabase`를 직접 호출하며 2026-11-17 기준 import하는 곳 없음 |
| `useDashboardBreakdown.ts` | 손익 항목 분해 카드 데이터 (Query + `buildDashboardBreakdown`) |
| `useDismissedIntents.ts` | 닫은 의도 카드 ID를 AsyncStorage에 기록. 의도 카드 폐기로 현재 import하는 곳 없음 |
| `useEmployees.ts` | 매장 직원 목록 조회·생성·수정·비활성/삭제 (Query) |
| `useExpenseCategoryExpansion.ts` | 비용 카테고리 펼침 상태를 `utils/expenseCategorySession`에서 구독(`useSyncExternalStore`) |
| `useExpenses.ts` | 월별 비용·이월 고정비 조회와 생성·수정·삭제·고정비 복사, `identity` 기반 응답 격리 |
| `useHomeAlerts.ts` | 홈 경고 배너 목록과 읽음 처리 |
| `useHomeFinancialCard.ts` | 홈 재무 카드 일별 타임라인 (Query) |
| `useHomeWorkflow.ts` | 매장 홈 업무 구성 조회 (Query) |
| `useIngredients.ts` | 재고 목록 페이지 조회(`loadMore`)·CRUD·일괄 생성·카테고리 일괄 변경 |
| `useLowStockCount.ts` | 품절 임박 재고 HEAD count. `supabase`를 직접 호출하며 현재 import하는 곳 없음 |
| `useManualSales.ts` | 매출 수기 입력 월 목록·저장·삭제 (Query) |
| `useMemberApproval.ts` | 합류 승인 후보·온보딩 답변 준비(`prepare`)와 최종 합류 확정(`confirm`), 범위 밖 선택 폐기 |
| `useNotifications.ts` | 알림 목록·미읽음 수·읽음/숨김 처리, 가시 상태 폴링(`query/notificationPolling`) (Query) |
| `useNotificationSettings.ts` | 알림 설정 조회·토글, 저장 중 항목(`savingKey`) 표시 |
| `usePayroll.ts` | 월 급여 조회·계산·저장·삭제·공제 수정·근무 분 저장. 정규직은 급여 이력 스냅샷(`utils/regularWages`)으로 계산 |
| `usePayrollDeductionDraft.ts` | 급여 공제 입력 초안, 변경 여부(`dirty`)와 서버 값 변경 감지(`changedOnServer`) |
| `usePayrollSubmissions.ts` | 직원·월별 근무시간 제출 목록 조회 (검토 저장은 서비스 직접 호출) |
| `usePosAnalytics.ts` | POS 일별 요약·기간 요약·품목 조회 (Query). `clearLegacyPosCache`를 재수출 |
| `useProfitLoss.ts` | 월 손익계산서 단건 조회. 현재 import하는 곳 없음(화면은 Query 기반 훅 사용) |
| `useProfitLossTrendChart.ts` | 손익 추이 막대용 월별 재무 요약을 독립 쿼리로 병렬 조회 (`useQueries`) |
| `usePurchaseCategories.ts` | 매입 카테고리용 `useCategoryTaxonomy` 래퍼 |
| `usePurchases.ts` | 월별 매입 조회와 생성·품목 포함 생성·삭제, 저장 후 재조회 실패(`refreshFailed`) 구분 |
| `usePurchaseTypes.ts` | 매입 유형 목록 조회·변경 |
| `useRecipes.ts` | 레시피 목록 페이지 조회(`loadMore`)·생성·삭제·카테고리 일괄 변경 |
| `useRecurringFixedExpenses.ts` | 반복 고정비 규칙 조회·저장 |
| `useReducedTransparency.ts` | 시스템 투명도 줄이기 설정 구독. 확인 전에는 불투명 표면을 기본값으로 사용 |
| `useRequestApprovals.ts` | 스케줄 변경 요청 대기 목록과 승인/거절 (Query) |
| `useSchedule.ts` | 직원 스케줄·대기 요청 조회와 요청 제출 |
| `useStoreMembers.ts` | 매장 멤버 목록 조회 (범위 키로 이전 매장 목록 차단) |
| `useStorePermissions.ts` | 현재 매장 권한 플래그(관리자, 파트타이머, 레시피 조회/관리 분리). 직원 유형 미확인 시 쓰기 불허. 서버 권한 검사를 대체하지 않음 |
| `useTossSync.ts` | POS 주문 자동/수동 동기화. `posSyncCoordinator`로 훅 간 쓰로틀 공유 후 주문 저장 |

## For AI Agents

### Working In This Directory

- 훅은 서비스만 호출한다. 새 훅에서 `supabase`를 직접 import하지 않는다(`useDashboard`·`useLowStockCount`는 레거시 예외이며 따라 하지 않는다).
- 범위 키에 `user.id`, `store.id`, `currentRole`, `devPreviewMode`(필요 시 `devPreviewEmployeeId`), 기간을 포함한다. Query 훅은 `useQueryScope()` + `queryKeys.store(...)`를 사용한다.
- 비-Query 훅은 `requestVersion`/`request` ref와 `currentIdentity`를 비교해 늦게 도착한 응답을 버린다. 저장 중 중복 실행은 `mutationBusy` 같은 ref로 막는다.
- 저장 후 무효화는 서비스 계층이 처리한다. 훅에서 금액을 AsyncStorage에 저장하지 않는다.
- 재무 조회 훅은 `canReadFinancials`가 true일 때만 활성화하고, `isAccessDenied` 오류를 0원 데이터로 바꾸지 않는다.
- 미사용 훅을 되살리기 전에 루트 제품 정책(의도 카드·품절 알림 폐기 등)을 확인한다.

### Testing Requirements

- 대응 테스트: `__tests__/hooks/*.test.ts` (예: `useAdminDashboard`, `useExpenses`, `useStorePermissions`, `useTossSync`, `usePaginatedStockCache`, `OperationsReadRecovery`).
- 서비스 모듈을 `jest.mock`하고 `renderHook`으로 범위 전환·지연 응답·실패 복구를 검사한다.
- 실행: `npm test -- --runInBand --no-coverage __tests__/hooks/<file>.test.ts`, `npm run typecheck`.

### Common Patterns

- 반환 형태: `{ data/rows/employees, loading, error, refetch, ...mutations }`. 범위가 다르면 빈 값과 `loading`을 반환한다. 오류 문구는 `getErrorMessage`, 사용자 입력 오류는 `UserFacingError`.
- 독립 관찰자(`useQueries`)로 선택 월 값을 먼저 그리고 과거 월은 나중에 채운다.

## Dependencies

### Internal

- `../services/*`, `../contexts/AuthContext`(`useAuth`), `../query`(`queryClient`, `useQueryScope`, `isAccessDenied`), `../utils/*`, `../../types`

### External

- `react`, `@tanstack/react-query`, `react-native`, `expo-router`, `@react-native-async-storage/async-storage`(`useDismissedIntents`만)

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

# services

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

Supabase 테이블·RPC·Edge Function과 외부 API 호출을 담당하는 데이터 접근 계층이다. 루트 규칙상 앱에서 DB에 접근하는 코드는 이 폴더에만 둔다. 각 파일은 도메인 단위로 조회·저장 함수를 export하고, 저장 후에는 `cacheInvalidation.ts`로 연결된 조회 캐시를 무효화한다.

## Key Files

| File | Description |
|------|-------------|
| `account.ts` | `deleteAccount` — `delete-account` Edge Function으로 회원 탈퇴 요청 |
| `adminDashboard.ts` | 통합 대시보드용 매장별 월/연 손익·추이(`getMultiStore*`), 주간 청소 진행률, 주간 근무 분해. 재무 요약·청소·스케줄 서비스를 조합 |
| `adminFinancialFallback.ts` | v2 RPC 배포 전 관리자 호환 조회. `assert_store_finance_access`로 권한을 먼저 확인하고 동시 조회를 제한 |
| `authCallback.ts` | `completeAuthCallback` — OAuth/이메일 콜백 URL을 세션으로 완료 |
| `cacheInvalidation.ts` | `invalidateCachedStore` — 매장 ID(없으면 전체) 기준으로 `rattle` 쿼리를 취소 후 무효화 |
| `categories.ts` | 재고(식자재) 카테고리용 `ingredientCategoryTaxonomy` 인스턴스 |
| `categoryTaxonomy.ts` | `createCategoryTaxonomy` — `store_taxonomies` 조회 + `change_store_taxonomy` RPC 기반 매장별 카테고리 CRUD 세트 |
| `cleaning.ts` | 청소/체크리스트 항목·로그 CRUD, 체크/해제, 정렬, 오늘 적용 여부(`isCleaningItemApplicableToday`) |
| `dailyExpenseSeries.ts` | `get_daily_expense_series` RPC로 일별 비용 시계열 조회 |
| `dailyLaborSeries.ts` | `get_daily_labor_sources` RPC로 일별 인건비 원천을 받아 `buildDailyLaborSeries`로 시계열·누락(gap) 계산 |
| `dailyWork.ts` | 파트타이머 날짜별 근무 분 조회·이력·저장(`save_daily_work`)·검토(`review_daily_work`)·월 급여 반영(`apply_daily_payroll`) |
| `dashboardBreakdown.ts` | 손익 항목별 분해 행과 지표 라벨을 만드는 순수 빌더(`buildDashboardBreakdown`) |
| `employees.ts` | 직원 목록·생성(`create_employee_with_initial_wage`)·수정·비활성/삭제·본인 직원 조회, 수습/4대보험 판정 |
| `expenses.ts` | 월별 비용 CRUD, 유효 고정비(레거시 포함) 조회, 월 합계, 고정비 복사(`copy_fixed_expenses_with_dates`) |
| `homeAlerts.ts` | 홈 경고 배너 생성(`buildHomeAlerts`), 재고·월 고정비 확인, 읽음 처리(`home_alert_reads`) |
| `homeFinancialSummary.ts` | 홈/대시보드 재무 요약 조회(`get_home_financial_summary`, 다매장 `get_financial_summaries_v2`) |
| `homeFinancialTimeline.ts` | 홈 재무 카드용 일별 매출·매입 타임라인. 재무 권한 확인 후 `toss_orders`·`manual_sales`·`purchases`를 읽음 |
| `homeWorkflow.ts` | 매장 홈 업무 구성(`store_home_workflows`) 조회·저장과 로드 실패 문구 |
| `ingredients.ts` | 재고(식자재) CRUD, 카테고리별 조회, 일괄 생성·카테고리 일괄 변경 |
| `kakaoLocal.ts` | Kakao Local REST 장소 검색·역지오코딩. 2026-11-17 기준 import하는 곳 없음(레거시) |
| `manualSales.ts` | POS 미연동 매장의 매출 수기 입력 월/일 조회·저장·삭제·합계 |
| `notifications.ts` | 알림 목록·숨김·읽음·미읽음 수, 알림 설정 정의(`NOTIFICATION_SETTING_DEFS`)·조회·변경, 설정 확인 후 생성(`notifyIfEnabled`) |
| `payroll.ts` | 인건비 계산(`calculatePayroll`, 세액표 `income_tax_table`, 수습 계수), 월 급여 조회·저장·삭제, 근무 분·공제 수정, 정산 확정과 미정산 확인 |
| `payrollSubmissions.ts` | 근무시간 제출 목록, 제출(`submit_work_minutes`)·검토(`review_work_minutes`) |
| `posAnalytics.ts` | KST 영업일 범위 계산, 자동 동기화 범위, POS 일별 요약·품목 RPC(`get_pos_daily_summaries`, `get_pos_daily_items`) |
| `posSyncCoordinator.ts` | 훅 간 POS 자동 동기화 게이트. 성공한 자동 시도만 쓰로틀을 소비 |
| `profile.ts` | 실명·연락처 수정(auth `user_metadata` + 본인 `store_members` 동기화), 비밀번호 변경 |
| `profitLoss.ts` | 월별·연간 손익계산서 조회. 재무 권한 확인 후 매출·급여·비용 등을 집계 |
| `purchaseCategories.ts` | 매입 카테고리용 `purchaseCategoryTaxonomy` 인스턴스 |
| `purchases.ts` | 매입·품목 조회, 품목 포함 생성(`create_purchase_with_items`), 품목 수정, 월 합계, 결과불명 쓰기를 구분하는 `PurchaseWriteError` |
| `purchaseTypes.ts` | 매입 유형 기본값·검증·조회·변경(`change_store_taxonomy`) |
| `qaLogin.ts` | QA 전용 로그인 브로커(환경 플래그로만 활성), 초기 QA 역할 |
| `readAllRows.ts` | 서버 응답 상한과 무관하게 빈 페이지까지 읽는 페이지네이션 헬퍼. 호출자가 유일 키 정렬을 지정 |
| `recipes.ts` | 레시피·원가(`recipe_costs`) 조회, 재료 포함 생성/전체 수정 RPC, 카테고리 변경·이름 변경·삭제, 카탈로그 일괄 upsert |
| `recurringFixedExpenses.ts` | 반복 고정비 규칙 조회·저장과 월 유효 비용 행 RPC |
| `schedule.ts` | 직원/매장 일·주 스케줄 조회, 스케줄 변경 요청 제출·대기 목록·검토 |
| `socialAuth.ts` | Apple(iOS 전용)/소셜 로그인, 취소 판정, Apple 자격 요청 |
| `storeMembers.ts` | 매장 합류 요청·초대 코드, 합류 온보딩 제출/조회/최종 승인, 멤버 목록·승인 후보·승인/거절/제거, 소유권 이전 |
| `stores.ts` | 매장 상세·정보·마감 시간 수정, 설정 포함 생성, 소유 매장 삭제·삭제 목록·복구, 재무 접근 조회·손익 공유 범위 변경 |
| `tossplace.ts` | Toss Place 주문·주문 상세·카탈로그 조회와 카탈로그 저장. 파일 내부 `tossProxyRequest`가 `toss-proxy` Edge Function을 호출 |
| `tossSync.ts` | 매장 Toss 가맹점 ID 조회, POS 주문 존재 확인, 주문 일괄 upsert(`upsert_pos_order_batch`) 후 매장 캐시 무효화 |
| `wageHistory.ts` | 급여 변경 이력 조회·추가(`add_employee_wage_change`)·최초 조건 보관, 날짜별 시급(`rateOnDate`), 정규직 월 세전액 |

## For AI Agents

### Working In This Directory

- 컴포넌트·화면·대부분의 훅은 `supabase`를 직접 import하지 않는다. 새 조회/저장은 여기에 함수로 추가하고 훅에서 감싼다.
- Toss Place 호출은 반드시 `toss-proxy` 경유(`tossplace.ts`의 `tossProxyRequest`). 클라이언트에서 Toss API를 직접 호출하지 않는다.
- 저장 함수는 성공 후 `invalidateCachedStore(storeId, domains)`를 호출해 이전 요청 취소와 무효화를 함께 처리한다.
- 재무 조회는 `assert_store_finance_access` 등 서버 권한 검사를 거친다. 권한 거절·RPC 미배포 오류를 호환 조회로 우회하지 않는다(`adminFinancialFallback.ts`는 명시적 예외).
- 거래·급여 당시 스냅샷을 현재 직원 조건 조인으로 대체하지 않는다. 미확인 인건비·이익을 0원으로 만들지 않는다.
- 큰 목록은 `readAllRows`로 끝까지 읽는다. 새 RPC·테이블을 쓰면 `supabase/migrations/`의 정의와 대조하고, SQL 원격 적용은 루트 규칙대로 별도 위임 없이 하지 않는다.
- `stores.ts`·`account.ts`는 현재 다른 작업의 미커밋 변경이 있을 수 있으니 수정 전 `git diff`로 확인한다.

### Testing Requirements

- 대응 테스트: `__tests__/services/*.test.ts` (예: `payrollCalculation`, `purchaseWriteOutcome`, `readAllRows`, `storeDeletion`, `SavedWriteRefresh`, `posSyncCoordinator`). Edge Function 테스트는 `__tests__/functions/`.
- `jest.mock('../../lib/supabase', ...)`로 `rpc`/`from`을 mock한다. mock 누락 시 외부 쓰기가 생길 수 있으니 확인한다.
- 실행: `npm test -- --runInBand --no-coverage __tests__/services/<file>.test.ts`, `npm run typecheck`. RPC/스키마 변경은 `npm run test:sql`도 고려.

### Common Patterns

- `const { data, error } = await supabase.rpc(...)` → `if (error) throw error` → 타입 변환 후 반환.
- 결과불명 쓰기(응답 유실)는 재시도 전에 조회로 확인하도록 오류 유형을 구분한다(`PurchaseWriteError` 참고).
- KST 기준 날짜 계산(`posAnalytics.getBusinessDayRange`)을 기기 시간대와 무관하게 사용한다.

## Dependencies

### Internal

- `../supabase`, `../query/client`(무효화), `../query/financial`, `../utils/*`(오류·계산), `../../types`

### External

- `@supabase/supabase-js`, `@react-native-async-storage/async-storage`(QA 역할만), `expo-apple-authentication`·`expo-crypto`·`expo-linking`·`expo-web-browser`(소셜 로그인), `expo-device`, `expo-constants`

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

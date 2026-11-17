# components

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

여러 화면(`app/`)이 공유하는 도메인 컴포넌트다. 홈·통합 대시보드·비용/매입 장부·급여·재고/레시피·매장 설정·알림·더보기 드로어처럼 업무 맥락을 가진 UI를 둔다. 도메인과 무관한 기본 요소는 `ui/`, 홈 재무 카드의 차트 조각은 `home-financial/`에 있다.

## Key Files

| File | Description |
|------|-------------|
| `BulkCategoryModal.tsx` | 여러 항목을 골라 카테고리를 일괄 지정하는 전체 화면 모달 (레시피 화면에서 사용) |
| `CatalogImportModal.tsx` | Toss 카탈로그 항목을 선택해 레시피로 가져오는 모달 |
| `CategoryManageButton.tsx` | 카테고리 관리 진입용 작은 텍스트 버튼 |
| `CategoryManageModal.tsx` | 카테고리 추가·이름 변경·삭제 모달. 삭제 확인 문구를 호출자가 지정 |
| `ChecklistProgress.tsx` | 알려진 비어 있지 않은 체크리스트에만 진행률 표시. 미확인 데이터를 0%로 그리지 않음 |
| `ClosingTimeWheel.tsx` | 정시 단위 마감 시간 휠. 페이드 행이 공유 배경을 가리지 않게 구성 |
| `DailyOperationsHome.tsx` | 하루 업무 홈(오픈 준비 → 영업 중 → 마감 정리). 홈 업무 구성과 오늘 체크리스트 요약을 연결 |
| `DailyWorkPanel.tsx` | 파트타이머 날짜별 근무 분 입력·제출 패널. 이탈 확인(`useConfirmLeave`) 포함 |
| `DashboardBreakdownCard.tsx` | 통합 대시보드 손익 항목 분해 카드 |
| `DashboardProfitRing.tsx` | 매출 대비 이익·매입·비용·인건비 링 차트와 항목 선택 범례 |
| `DashboardProfitTrend.tsx` | 기간별 이익 추이 막대(미확인 값은 `null`로 구분) |
| `DashboardSchedule.tsx` | 통합 대시보드 주간 근무 요약과 일별 근무 목록 |
| `DevRoleSwitcher.tsx` | 관리자 전용 역할 미리보기 스위처(직원/파트타이머 화면 확인용, `app/_layout.tsx`). 실제 직원 JWT/RLS 테스트를 대체하지 않음 |
| `DonutChart.tsx` | 범용 도넛 차트·범례. 2026-11-17 기준 import하는 곳 없음 |
| `DraggableFab.tsx` | 일반 탭의 드래그 가능한 플로팅 빠른 등록 버튼(경계 고무줄 효과, 하단 도킹) |
| `ErrorMessage.tsx` | 공통 오류 표시와 재시도. 루트 규칙상 오류 UI는 이것을 사용 |
| `ExpensesPanel.tsx` | 월 비용 장부 패널(카테고리 펼침, 반복 고정비, 필터) |
| `FinancialSharingChoices.tsx` | 손익 공유 범위(공유 안 함/직원만/직원과 파트타이머) 선택 카드 |
| `GlassBackdrop.tsx` | 화면 뒤 글래스 배경 레이어 |
| `GlassCard.tsx` | 매장 컬러 틴트 글래스 카드. 투명도 줄이기 설정 시 불투명 대체 |
| `HomeAlertsPanel.tsx` | 홈 경고 배너 목록(고정비·POS 미동기화·월마감) |
| `HomeFinancialCard.tsx` | 홈 하단 월 재무 카드. `home-financial/` 조각을 조합하고 로딩·오류·재시도를 처리 |
| `HomeWorkflowEditor.tsx` | 홈 단계별 업무 항목 편집 시트 |
| `IntentCard.tsx` | 의도 카드 UI. 의도 카드 폐기로 현재 import하는 곳 없음 |
| `JoinOnboardingFields.tsx` | 합류 온보딩 답변 필드 묶음(승인 모달에서 재사용) |
| `KakaoMap.tsx` | WebView 기반 카카오 지도. 위치 기반 출퇴근 미제공 결정 이후 import하는 곳 없음 |
| `LedgerFilters.tsx` | 매입·비용 장부의 칩 필터와 카테고리 관리 버튼 |
| `LedgerHeader.tsx` | 매입·비용 공통 월 장부 헤더 |
| `LoadingSpinner.tsx` | 공통 로딩 표시. 루트 규칙상 로딩 UI는 이것을 사용 |
| `MemberApprovalModal.tsx` | 합류 요청 최종 승인 모달(후보 선택, 온보딩 답변 확인) |
| `MoreDrawer.tsx` | 더보기 드로어: 매장 전환·전체 매장, 메뉴, 로그아웃/탈퇴 진입 |
| `NotificationSwipeRow.tsx` | 스와이프로 숨기는 알림 행과 상대 시간 포맷 |
| `PayrollSubmissionReview.tsx` | 관리자의 근무시간 제출 검토 목록 |
| `RecipeCard.tsx` | 재고 `last_price` 기준 원가·마진율을 계산해 보여주는 레시피 카드 |
| `RecurringFixedExpensesPanel.tsx` | 반복 고정비 편집 패널(외부에서 제어하는 `FixedExpenseEditorHandle`) |
| `SplashAnimation.tsx` | 시작 스플래시 모핑 애니메이션(감속 동작 설정 존중) |
| `StaffWorkHome.tsx` | 직원용 업무 홈 카드(청소·스케줄·급여). 현재 import하는 곳 없음 |
| `StoreAppBar.tsx` | 탭 화면 상단 글래스 매장 AppBar(로고 마크, 56pt) |
| `StoreScopeHeader.tsx` | 매장 범위 헤더 버튼과 매장 선택 시트(`StoreScopePicker`, 전체 매장 선택 포함) |
| `StoreSetupWizard.tsx` | 첫 매장 생성 단계별 입력(POS 지금/나중, 손익 공유 선택) |
| `WorkMinutesForm.tsx` | 월 근무 분 입력 폼(신규 및 `LegacyWorkMinutesForm`) |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `ui/` | 도메인 무관 기본 컴포넌트 (see `ui/AGENTS.md`) |
| `home-financial/` | 홈 재무 카드 전용 차트 조각. 별도 AGENTS.md 없음, 아래 표 참고 |

### home-financial/

| File | Description |
|------|-------------|
| `FinancialAreaChart.tsx` | 이번 달/전월 누적 영역 차트, 길게 눌러 일자 확인(`onInspect`), 진입 애니메이션·감속 동작 |
| `MetricChips.tsx` | 영업이익·매출·매입·인건비·비용 지표 선택 칩 |
| `MorphingArea.tsx` | 지표 전환 시 영역 경로 모핑과 경로 분할·보간 유틸 |
| `RollingAmount.tsx` | 금액 롤링 숫자 표시 |
| `theme.ts` | 재무 차트 색(`financialTheme`)과 지표 라벨(`metricLabels`) |

## For AI Agents

### Working In This Directory

- 컴포넌트에서 `supabase`를 import하지 않는다. 데이터는 `../hooks`로 받거나 props로 전달받는다. 일부 컴포넌트가 서비스 함수를 직접 호출(`MoreDrawer` → `account`/`socialAuth`, `StoreSetupWizard` → `stores`)하는 기존 구조는 유지하되 새로 늘리지 않는다.
- 색상은 `Colors.*`(`constants/colors.ts`), 서체는 `Fonts.*`(`constants/fonts.ts`), 크기·반경은 `constants/designTokens.ts`를 쓴다. `HomeWorkflowEditor`·`home-financial/theme.ts`에 남은 hex 값은 기존 예외이며 새 하드코딩을 추가하지 않는다.
- 모바일 기준(터치 44pt 이상, 키보드 가림, 안전영역, 투명도 줄이기·Android 대체)을 지킨다. `GlassCard`·`useReducedTransparency` 대체와 FAB 하단 여백을 제거하지 않는다.
- 미확인 금액·진행률을 0으로 표시하지 않는다. 내부 오류 원문을 사용자 문구로 노출하지 않는다.
- 미사용 컴포넌트(`IntentCard`, `KakaoMap`, `DonutChart`, `StaffWorkHome`)를 다시 쓰기 전에 루트 제품 범위(의도 카드 폐기, 위치정보 출퇴근 미제공)를 확인한다.
- 화면 변경 검증은 루트 규칙대로 빌드된 앱 시뮬레이터 전후 비교가 기준이다. 디자인 기준은 `DESIGN.md`.

### Testing Requirements

- 대응 테스트: `__tests__/components/` — 예: `ChecklistProgress`, `DailyOperationsHome`, `DailyWorkPanel`, `DashboardBreakdownCard`, `DashboardProfitTrend`, `DashboardViews`, `ErrorMessage`, `ExpensesPanel`, `FinancialAreaChartGesture`, `HomeFinancialCard`, `LoadingSpinner`, `MemberApprovalModal`, `MoreDrawerMotion`, `MorphingArea`, `NotificationSwipeRow`, `PayrollSubmissionReview`, `RecipeCard`, `RecurringFixedExpensesPanel`, `SplashAnimation`, `StoreAppBar`, `StoreSetupWizard`, `WorkMinutesForm`.
- 실행: `npm test -- --runInBand --no-coverage __tests__/components/<file>.test.tsx`, `npm run typecheck`. 컴포넌트 테스트는 실제 네이티브 화면 확인을 대체하지 않는다.

### Common Patterns

- 모달/시트는 `ui/SheetModal`·`ui/BottomSheet`를 사용하고 `Colors.overlaySheet` 스크림을 쓴다.
- 금액·숫자는 `ui/NumericText`(Geist, 고정폭 숫자).
- 애니메이션은 `react-native-reanimated`의 `useReducedMotion`을 존중한다.

## Dependencies

### Internal

- `./ui`, `../hooks/*`, `../icons/*`, `../utils/*`, `../contexts/AuthContext`, `../../constants/*`, `../../types`

### External

- `react-native`, `react-native-reanimated`, `react-native-svg`, `react-native-gesture-handler`, `react-native-webview`(`KakaoMap`), `expo-router`, `expo-blur`, `react-native-safe-area-context`

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

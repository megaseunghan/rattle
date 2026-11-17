# types

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

앱 전체가 공유하는 도메인 타입의 단일 파일이다. Supabase 테이블 행·RPC 결과·Toss Place 응답·화면 입력 타입을 정의하며 `app/`·`lib/`의 약 94개 파일이 import한다. 루트 규칙의 새 도메인 추가 순서 첫 단계(`types/index.ts` → `lib/services` → `lib/hooks` → `app`)다.

## Key Files

| File | Description |
|------|-------------|
| `index.ts` | 전체 도메인 타입(약 570줄). 구역: 매장(`Store`, `FinancialShareScope`, `PosSetupChoice`, `StoreTaxonomy`), 레거시 발주(`Order`, `OrderItem`), 재고·레시피(`Ingredient`, `Recipe`, `RecipeIngredient`), Toss POS(`TossOrder*`, `TossCatalog*`, `DailySummary`, `DailyItem`), 멤버·합류(`StoreMember`, `JoinOnboarding*`, `MemberApproval*`), 직원·급여(`Employee`(`is_probation`), `WageHistory`, `Payroll`(일별 근무·정규직 급여 스냅샷), `DailyWork*`, `PayrollWork*`), 매입(`Purchase`, `PurchaseItem`, `PurchaseItemInput`, `PurchaseCategory`, `PurchaseType`), 비용·손익(`Expense`, `ExpenseCategory`, `ProfitLoss`, `ManualSale`), 알림(`AppNotification`, `NotificationSetting`, `HomeAlert`), 청소·스케줄(`CleaningItem`, `CleaningLog`, `EmployeeSchedule`, `ScheduleRequest`), 홈(`HomeFinancialSummary`, `HomePhase`, `HomeActionId`, `HomeWorkflow`) |

## For AI Agents

### Working In This Directory

- `index.ts`는 루트 규칙상 단일 소유자 공유 파일이다. 소유자를 정하지 않은 병렬 작업에서는 수정하지 않고, 필요한 확장은 `lib/types/`에 임시로 두었다가 통합 시 병합한다(`lib/types/AGENTS.md`).
- DB 행 타입은 실제 `supabase/migrations/`의 컬럼·nullable 여부와 맞춘다. 레거시 컬럼이나 타입(`Order`/`OrderItem` 발주 등)으로 현재 기능 범위를 추정하지 않는다(루트 제품 정책: 발주·OCR 미제공).
- 급여·거래 스냅샷 필드(`daily_work_snapshot`, `regular_wage_snapshot`)는 당시 값을 보존하는 계약이다. 현재 조건으로 대체하는 형태로 바꾸지 않는다.
- 미확인 금액을 표현해야 하는 필드는 `number | null`을 유지하고 0 기본값으로 좁히지 않는다.
- 필드 추가·이름 변경 시 `npm run typecheck`로 전 사용처를 확인한다. 런타임 코드는 넣지 않는다(`regular_wage_snapshot`의 `import()` 타입 참조만 예외).

### Testing Requirements

- 타입 전용이므로 `npm run typecheck`가 기본 검증이다. 계약 변경이 서비스·훅 동작에 영향을 주면 해당 `__tests__/services`, `__tests__/hooks` 테스트를 `npm test -- --runInBand --no-coverage <path>`로 실행한다. DB 계약 변경은 `npm run test:sql`도 고려한다.

### Common Patterns

- DB 컬럼은 snake_case 필드 그대로, 문자열 유니언으로 상태값 표현(`RequestStatus`, `EmploymentType`).
- 선택적 신규 컬럼은 `?:`로 추가해 미배포 DB·기존 mock과 호환을 유지한다.

## Dependencies

### Internal

- `../lib/utils/regularWages`(`RegularWageSnapshot` 타입 참조)

### External

- 없음

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

# types (lib)

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

공유 도메인 타입 파일(루트 `types/index.ts`)을 단일 소유자가 통합하기 전까지, 특정 기능 작업이 임시로 보관하는 보조 타입이다. 현재는 비용 날짜 필드와 반복 고정비 도메인 타입만 있다.

## Key Files

| File | Description |
|------|-------------|
| `expenses.ts` | `DatedExpense` = `Expense & { occurred_on: string \| null }`. 파일 주석대로 통합 시 `types/index.ts`의 `Expense`로 병합할 대상 |
| `recurringExpenses.ts` | 반복 고정비 타입: `RecurringFixedExpenseVersion`/`Rule`/`Occurrence`(id `recurring:{rule_id}:{year_month}`, `due`/`scheduled`는 지급 확인이 아님)/`Month`, 저장 입력 `SaveRecurringFixedExpense`, 월 유효 행 `EffectiveExpenseRow` |

## For AI Agents

### Working In This Directory

- 새 도메인 타입은 원칙적으로 루트 `types/index.ts`에 둔다(루트 규칙의 새 도메인 순서). 이 폴더는 `types/index.ts` 소유자가 아닌 작업이 충돌 없이 타입을 추가해야 할 때만 사용하고, 통합 계획을 파일 주석에 남긴다.
- `types/index.ts`의 타입을 여기서 재정의하지 않는다. 교차 타입(`&`)으로 확장한다.
- 타입 변경은 사용처(`lib/services/expenses.ts`, `recurringFixedExpenses.ts`, `dailyExpenseSeries.ts`, `lib/hooks/useExpenses.ts`, `useRecurringFixedExpenses.ts`, `lib/components/ExpensesPanel.tsx`, `RecurringFixedExpensesPanel.tsx`, `lib/utils/recurringExpense.ts`)와 RPC 반환 형태(`supabase/migrations/`)를 함께 확인한다.
- 런타임 코드를 넣지 않는다.

### Testing Requirements

- 타입 전용이므로 `npm run typecheck`가 기본 검증이다. 사용 동작은 `__tests__/services/recurringFixedExpenses.test.ts`, `__tests__/hooks/useRecurringFixedExpenses.test.ts`, `__tests__/hooks/useExpenses.test.ts`, `__tests__/components/RecurringFixedExpensesPanel.test.tsx`로 확인한다 (`npm test -- --runInBand --no-coverage <path>`).

### Common Patterns

- DB 컬럼명은 snake_case 그대로 타입 필드로 쓴다(`occurred_on`, `rule_id`).

## Dependencies

### Internal

- `../../types`(`Expense`, `expenses.ts`만 import). `recurringExpenses.ts`는 독립 타입

### External

- 없음

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

# utils

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

DB·화면에 의존하지 않는 계산·검증·포맷·세션 보조 함수다. 급여·근무 분 계산, 홈 재무 카드 데이터 가공, 합류 온보딩 검증, 단위 변환, 오류 메시지 정규화, 보안 세션 저장 어댑터처럼 여러 계층이 공유하는 로직을 둔다.

## Key Files

| File | Description |
|------|-------------|
| `applyGlobalFont.ts` | `Text`/`TextInput` 렌더를 감싸 앱 전역 기본 서체를 Wanted Sans로 적용 |
| `error.ts` | 사용자에게 보여주기로 정한 `UserFacingError`와 내부 오류 원문을 숨기는 `getErrorMessage` |
| `expenseCategorySession.ts` | 사용자·매장별 비용 카테고리 펼침 상태(메모리 구독 저장소). 금액·인증 정보는 저장하지 않음 |
| `expenseDate.ts` | 비용 날짜·금액 입력 검증 |
| `financialCoverage.ts` | `sumKnown` — 미확인 월·매장을 0원으로 바꾸지 않고 합계도 미확인으로 유지 |
| `financialSharing.ts` | 손익 공유 선택지(`FINANCIAL_SHARE_OPTIONS`), 역할별 공유 허용 판정, 재무 라우트 판별 |
| `homeFinancialCard.ts` | 홈 재무 카드 지표·기간, 누적 일자 계산, 원화 포맷, 전월 비교 문구, 차트 좌표·경로 계산 |
| `homeWorkflow.ts` | 홈 단계(`HOME_PHASES`)·액션 목록, 기본 업무 구성, 구성 형태 검증 |
| `joinFlow.ts` | 직원 합류 단계 정의와 질문별 검증 |
| `joinOnboarding.ts` | 합류 온보딩 초안 필드 검증과 제출 payload 생성 |
| `layoutAnimation.ts` | 목록 변경 시 `LayoutAnimation` 적용 헬퍼 |
| `listKeys.ts` | 목록 key 생성. `get_pos_daily_items` 식별자와 맞추고 ID 누락과 이름 충돌을 구분 |
| `recurringExpense.ts` | 반복 고정비 월 검증, KST 기준 월·다음 월, 반복 발생일 계산 |
| `regularWages.ts` | 정규직 급여 이력 정규화와 월 계산 스냅샷(세전·비과세·발생분). 현재 직원 조건 조인이 아니라 저장된 이력 기준 |
| `remainingSchedule.ts` | KST 주간 확정 근무 중 종료 전 근무일 수. 시간이 불완전하면 미확인 |
| `resolveSelfEmployee.ts` | 로그인 계정의 본인 직원 레코드 결정. 관리자 미리보기 중이면 선택된 직원 반환 |
| `scheduleIdleTask.ts` | 선택 작업을 JS 큐 뒤로 미루고 blur/unmount 시 취소 |
| `secureStorageAdapter.ts` | Supabase 세션 토큰을 Keychain/Keystore(SecureStore)에 저장하는 어댑터. 평문 AsyncStorage 사용 금지 사유 포함 |
| `sentimentMessage.ts` | 월 손익 결과에 따른 감정 단계·피드백 문구 |
| `smoothTrendPath.ts` | 단조 3차 보간 추이 경로. 측정값 사이에 가짜 극값을 만들지 않음 |
| `splashMorph.ts` | 스플래시 모핑 윤곽·진행 곡선(UI worklet과 테스트 공용) |
| `storeDeletion.ts` | 매장 복구 기한을 기기 시간대와 무관한 한국 시간 문구로 포맷 (현재 미커밋 신규 파일) |
| `unit.ts` | 재고 단위(`STOCK_UNITS`), 레시피 단위 선택지, 단위 변환, 레시피 줄 원가, 재고 표시 포맷 |
| `wageCondition.ts` | 급여 조건 날짜(실제 선택한 달력 날짜) 검증과 금액 파싱 |
| `workMinutes.ts` | 근무 분 파싱(쉼표·소수·음수 묵시 보정 금지)·표시, 시급 세전액 계산 |

## For AI Agents

### Working In This Directory

- 순수 함수를 유지한다. `supabase`, 서비스, React 훅을 import하지 않는다(`applyGlobalFont`·`layoutAnimation`·`scheduleIdleTask`·`secureStorageAdapter`는 플랫폼 API만 사용).
- 날짜는 KST 기준 함수를 재사용하고 기기 시간대에 의존하지 않는다.
- 금액 계산은 원 단위 처리 규칙(루트 급여·파트타이머 결정)을 지키고, 미확인 값을 0으로 대체하지 않는다.
- 입력 검증은 잘못된 입력을 묵시적으로 고치지 않고 오류로 드러낸다.
- `secureStorageAdapter.ts`·`expenseCategorySession.ts`에 금액·추가 민감정보 저장을 넣지 않는다.

### Testing Requirements

- 대응 테스트: `__tests__/utils/` — `error`, `financialSharing`, `homeFinancialCard`, `homeWorkflow`, `joinOnboarding`, `listKeys`, `regularWages`, `remainingSchedule`, `scheduleIdleTask`, `sentimentMessage`, `splashMorph`, `unit`, `wageCondition`. `storeDeletion`은 `__tests__/services/storeDeletion.test.ts`에서 함께 다룬다.
- 실행: `npm test -- --runInBand --no-coverage __tests__/utils/<file>.test.ts`, `npm run typecheck`.

### Common Patterns

- 검증 함수는 오류 문자열 또는 `null`을 반환하거나 `UserFacingError`를 throw한다.
- 상수 목록은 `as const`로 정의하고 타입을 파생한다.

## Dependencies

### Internal

- `../../types`, `../types/recurringExpenses`(`recurringExpense`), `../../constants/fonts`(`applyGlobalFont`), 폴더 내 상호 참조(`error`, `expenseDate`, `joinOnboarding`, `regularWages`)

### External

- `react-native`, `expo-secure-store`(`secureStorageAdapter`)

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

# operations

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

관리자가 Supabase SQL Editor에서 **수동으로** 실행하는 운영 스크립트 모음이다. 마이그레이션이 아니며 자동 실행되지 않는다. 배포 전후 점검·진단용 읽기 전용 조회와, 시연·스크린샷·QA용 가상 자료 추가 스크립트로 나뉜다.

## Key Files

| File | Description |
|---|---|
| `health.sql` | 조회 전용. 카카오 해제 대기(`account_unlink_jobs`), 미매칭 POS 설치, 마지막 웹훅 처리 시각 등 집계만 출력 |
| `release-preflight.sql` | 조회 전용. 배포 대상 DB의 정책(`pg_policies`)·함수 정의(`prosecdef`, ACL)·매장 간 잘못 연결된 자료 확인. 자동 수정 없음 |
| `review-wage-history-gaps.sql` | `BEGIN READ ONLY`. 급여 이력 누락 직원 목록. 과거 조건을 자동 생성하지 않음 |
| `diagnose-member-approval.sql` | 읽기 전용. 승인 대기 신청과 이름·연락처가 겹치는 직원 조회. **개인정보 포함, 결과 외부 공유 금지** |
| `create-rattle-screenshot-store.sql` | 스크린샷 전용 가상 매장 생성. 기존 계정(이메일 또는 소유 매장명) 소유로 만들며 새 Auth 계정은 만들지 않음. 같은 데모 재실행은 오류로 중단 |
| `append-rattle-demo-data.sql`, `append-rattle-selected-store-data.sql` | 표식이 있는 래틀 데모 매장에 최근 2개월+이번 달 누락 자료만 추가. 기존 행 수정·삭제 없음, 재실행 시 건너뜀 |
| `add-rattle-selected-daily-payroll.sql`, `add-rattle-selected-dated-expenses.sql` | 데모 매장의 가상 급여 날짜별 근거·가상 비용 발생일/반복 일정 보완 (`lock_timeout`/`statement_timeout` 설정) |
| `add-rattle-demo-notifications.sql` | `QA-20261106-ALERTS`: 시연 매장에 알림 5개 추가. dedupe 키로 재실행 시 읽음 상태 유지, 외부 발송 없음 |
| `add-rattle-demo-schedule-20261109.sql`, `link-rattle-demo-schedule-account-20261109.sql` | `QA-20261109-SCHEDULE`: 기존 더미 직원의 빈 요일 일정 추가, 매장 소유자 계정에 더미 직원 연결 |

## For AI Agents

### Working In This Directory

- 이 폴더의 스크립트를 원격 DB에 직접 실행하지 않는다. 실행은 사용자가 SQL Editor에서 하거나 명시적으로 위임한 경우에만 한다. 이전 실행 기록은 재실행 승인이 아니다.
- 쓰기 스크립트는 대상 매장 ID·이름·`setup_request_id`·소유자를 `DO` 블록에서 먼저 확인하고 불일치 시 `RAISE EXCEPTION`으로 중단하는 가드를 유지한다. 가드를 약화하거나 다른 매장으로 확장하지 않는다.
- 새 QA 쓰기 스크립트는 머리 주석에 `QA-YYYYMMDD-...` 실행 ID, 가상 자료임, 수정·삭제 범위, 재실행 동작을 적는다. 실제 직원·급여 총액·계좌·연락처를 만들거나 바꾸지 않는다.
- 조회 스크립트는 개인 식별자·급여·외부 원문을 출력하지 않도록 집계 위주로 작성한다. 개인정보가 불가피하면 머리 주석에 공유 금지를 명시한다.
- 스크립트에 박힌 매장·직원·계정 UUID를 공유 문서·PR 본문에 옮기지 않는다.
- `create-rattle-screenshot-store.sql`은 다른 작업에서 수정 중(미커밋)이고, 다수 `add-*`/`append-*`/`link-*` 파일은 미추적 상태다. 다른 작업의 변경을 덮어쓰지 않는다.

### Testing Requirements

- 자동 테스트·`test:sql` 대상이 아니다. 문법·가드 논리는 diff 검토로 확인하고, 필요한 경우 로컬 PGlite에 축약 스키마를 만들어 별도로 확인한다.
- 실행 결과를 보고할 때는 실행 ID·대상 DB·시각·영향 행 수를 기록하고, 결과불명 쓰기는 조회로 확인한 뒤 재시도 여부를 판단한다.

### Common Patterns

- `BEGIN; DO $guard$ ... $guard$; ... COMMIT;` 구조, `ON COMMIT DROP` 임시 테이블로 대상 행 수집.
- `SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';`로 장시간 잠금 방지.
- 존재 여부 검사(`NOT EXISTS`)로 재실행 시 중복 삽입 방지.

## Dependencies

### Internal

- `supabase/migrations/` (테이블·RPC 정의), `supabase/functions/` (`health.sql`이 해제·웹훅 상태를 점검)
- `docs/배포전-보완-적용-2026-10-20.md`, `docs/시뮬레이터-역할별-테스트로그인-2026-10-29.md`

### External

- Supabase SQL Editor (대상 프로젝트 권한 필요)

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

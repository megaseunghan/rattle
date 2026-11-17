# migrations

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

Rattle DB의 스키마·RLS·RPC·권한 변경 이력 원본이다. 2026-11-17 기준 메인 체크아웃에 83개 파일(2026-04-01 ~ 2026-11-16)이 있다. 저장소 관행상 대상 DB에는 Supabase SQL Editor에서 순서대로 **수동 적용**하며, 파일 존재가 원격 적용을 의미하지 않는다.

## Key Files

파일을 하나씩 나열하지 않고 기간·영역별 대표 파일만 적는다. 전체 목록은 `ls supabase/migrations`로 확인한다.

| File | Description |
|---|---|
| `20260401_toss_store_info.sql`, `20260403_toss_sales.sql`, `20260407_pos_catalog.sql` | 2026-04 (14개): Toss POS 매장·매출·카탈로그 기초, `store_members`, 매장 RLS 재귀 수정, 레시피 RPC |
| `20260602_employees_payroll.sql`, `20260604_income_tax_table_2026.sql`, `20260608_wage_history.sql`, `20260608_role_based_rls.sql` | 2026-06 (22개): 직원·급여·2026 소득세표·급여 이력·역할 기반 RLS, 매입·비용, 재고 필드 정리 |
| `20260811_toss_webhook_matching.sql`, `20260902_purchase_consolidation.sql`, `20260910_notifications.sql`, `20260914_payroll_settlement.sql` | 2026-08~09 (13개): 웹훅 매장 매칭, 매입 통합, 청소 체크리스트, 알림, 일정·정정, 수기 매출, 급여 정산 |
| `20261020_01_access_and_purchase_integrity.sql`, `20261020_02_account_deletion.sql`, `20261020_03_webhook_transaction.sql` | 배포 전 보완 3종. 같은 날짜는 `_01/_02/_03` 순번으로 순서를 고정 |
| `20261023120000_read_models_and_integrity.sql`, `20261023121000_pos_read_models.sql`, `20261023123000_store_setup_financial_sharing.sql` | 2026-10-23부터 14자리 접두 사용: 조회 모델·POS 읽기 모델·손익 공유 |
| `20261027010000_wage_effective_baselines.sql`, `20261027011000_daily_work_snapshots.sql` | 급여 적용일 기준선·파트타이머 날짜별 근무 스냅샷 |
| `20261101010000_revoke_client_truncate.sql`, `20261105130000_recurring_fixed_expenses.sql`, `20261106092915_notification_personal_dismissals.sql` | 2026-11: 클라이언트 TRUNCATE 회수, 비용 발생일·반복 고정비, 개인 알림 숨김 |
| `20261114120000_store_soft_delete.sql` | 매장 7일 유예 소프트 삭제·복구·파기 (`is_store_active`, `deleted_store_ids`, `guard_deleted_store_write`) |
| `20261114121000_store_purge_schedule.sql` | 파기 예약(pg_cron, 매일 03:17 UTC). 원격 전용, pg_cron이 없으면 NOTICE 후 건너뜀. PGlite 검증 제외 |
| `20261116120000_qr_attendance.sql` | QR 출퇴근 1차(위치정보 미수집, 일회용 nonce, 정정은 새 기록). 선행: `20261114120000_store_soft_delete.sql` |

## For AI Agents

### Working In This Directory

- **파일명 규칙:** 신규 파일은 `YYYYMMDDHHMMSS_snake_case_name.sql`(14자리)로 만든다. 같은 날 여러 파일은 시각 자리로 순서를 정한다(예: `...120000`, `...121000`).
- **레거시 접두:** 2026-10-22까지 62개는 `YYYYMMDD_name.sql`(8자리)이며 같은 날짜에 여러 파일이 있다. 8자리 접두는 버전 고유성이 없으므로 Supabase CLI `db push`용 체인으로 가정하지 않는다(추론, 원격 이력은 대상 DB로 확인).
- **순서:** 파일명 사전순이 적용 순서다. 머리 주석의 "선행:" 의존성을 확인하고, 새 파일은 마지막 파일보다 뒤 타임스탬프를 쓴다.
- **불변성:** 원격에 적용됐거나 적용 여부가 불확실한 파일은 수정·이름 변경·삭제하지 않는다. 보정은 새 마이그레이션으로 한다. 아직 어디에도 적용되지 않았음이 확인된 미추적 신규 파일만 작성 중 수정할 수 있다.
- **현재 상태 주의:** `20261114120000`, `20261114121000`, `20261116120000`은 현재 git 미추적(untracked) 파일이다. `20261116130000_qr_attendance_fixes.sql`, `20261117120000_qr_attendance_retry_guard.sql`은 `.worktrees/qr-attendance`에만 있고 메인 체크아웃에는 없다. 다른 작업의 미커밋 파일을 정리·덮어쓰지 않는다.
- **원격 적용 금지:** 사용자 위임 없이 적용하지 않는다. 종료 시 "Supabase에서 SQL 적용을 진행해줘"와 파일·순서·미적용 상태를 보고한다.
- **DBA 관점 검토:** 통합 전 RLS 우회, 권한 확대, 잠금 시간, 기존 자료 보존, 재실행 안전성(`IF NOT EXISTS`, `CREATE OR REPLACE`)을 검토한다. 검토 통과 ≠ 적용 승인.
- `SECURITY DEFINER` 함수는 `SET search_path = ...`(예: `extensions, public, pg_temp`)를 고정하고 `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated` 후 필요한 역할에만 `GRANT EXECUTE`한다.
- 위치정보 기반 출퇴근은 제공하지 않는다. `20260908_store_attendance_radius.sql` 등 레거시 정의로 현재 기능을 추정하지 않는다.

### Testing Requirements

- 관련 PGlite 스크립트를 실행한다: `npm run test:sql` 또는 개별 `node scripts/validate-<영역>-sql.mjs`. 새 영역은 `scripts/`에 새 검증 스크립트를 추가하고 필요하면 `test:sql` 연결을 제안한다.
- 대표 매핑: soft delete → `validate-store-soft-delete-sql.mjs`, QR 출퇴근 → `validate-qr-attendance-sql.mjs`, 급여 스냅샷 → `validate-payroll-snapshot-integration.mjs`, 알림 → `validate-member-notifications-sql.mjs`(`test:sql` 미포함).
- PGlite는 선택한 마이그레이션만 축약 스키마에 적용한다. 원격 상태·전체 체인·pg_cron·동시성은 증명하지 않는다.

### Common Patterns

- `BEGIN; ... COMMIT;` 트랜잭션, 머리 주석에 정책 문서·선행 파일 명시.
- 내부 테이블은 `private` 스키마 + `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role`.
- 매장 접근 판정은 helper 함수(`can_read_store_financials` 등)와 RLS로 하며 클라이언트 메뉴 숨김에 의존하지 않는다.
- 원본 기록은 수정하지 않고 새 행(예: `source='correction'`)으로 정정한다.

## Dependencies

### Internal

- `scripts/validate-*.mjs`(파일을 직접 `readFile`로 읽어 실행), `lib/services/*`, `types/index.ts`
- `docs/QR-출퇴근-설계안-2026-11-16.md`, `docs/개인정보처리방침-보완안-2026-11-14.md`, `docs/급여-일별근무-적용안내-2026-10-26.md`

### External

- PostgreSQL/Supabase(Auth `auth.uid()`, RLS), `pgcrypto`, `pg_cron`

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

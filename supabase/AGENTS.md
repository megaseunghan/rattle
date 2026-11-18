# supabase

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

Rattle 백엔드(Supabase Postgres·RLS·RPC·Edge Functions)의 저장소 내 원본이다. 스키마 변경은 `migrations/`, 서버 함수는 `functions/`, 관리자가 SQL Editor에서 수동 실행하는 진단·시연 자료 스크립트는 `operations/`에 둔다. 이 디렉터리의 파일은 **원격 DB 상태를 증명하지 않는다**. 실제 적용 여부는 대상 DB를 조회해 확인한다.

## Key Files

| File | Description |
|---|---|
| `schema.sql` | 초기(2026-03) 기본 스키마 스냅샷(348줄). 현재 계약이 아니며, 현재 정의는 `migrations/` 체인과 대상 DB로 확인한다. |
| `seed_dummy_data.sql` | 로그인한 관리자의 첫 매장에 테스트용 더미 데이터를 넣는 수동 스크립트. 마이그레이션 아님, 자동 실행 안 됨. |

## Subdirectories

| Directory | Purpose |
|---|---|
| `migrations/` | 날짜 접두 SQL 마이그레이션 83개(2026-04 ~ 2026-11-16). 테이블·RLS·RPC·권한 변경 원본 (see `migrations/AGENTS.md`) |
| `functions/` | Deno Edge Functions: `delete-account`, `toss-proxy`, `toss-webhook`, `account-unlink-retry`, 공용 `_shared` (see `functions/AGENTS.md`) |
| `operations/` | SQL Editor 수동 실행용 조회·진단·QA 가상 자료 스크립트 (see `operations/AGENTS.md`) |
| `supabase/` | Supabase CLI 로컬 임시 폴더(`.temp`). `.gitignore` 대상이며 문서화·수정·출력 대상이 아니다. |

## For AI Agents

### Working In This Directory

- **원격 적용 금지(기본값):** 사용자의 명시적 위임 없이 원격 Supabase에 SQL을 실행하거나 `supabase db push`/`functions deploy`를 하지 않는다. 과거에 적용·배포한 기록은 새 실행 승인이 아니다.
- **작업 종료 보고:** SQL을 추가·변경했다면 마지막에 "Supabase에서 SQL 적용을 진행해줘"와 함께 적용 파일·적용 순서·현재 미적용 상태를 명시한다.
- **적용된 마이그레이션은 수정하지 않는다.** 원격에 이미 적용됐거나 적용 여부가 불확실한 파일은 그대로 두고 새 보정 마이그레이션을 추가한다.
- **DBA 관점 검토:** 마이그레이션은 통합 전에 RLS·권한·잠금·데이터 보존·재실행 안전성 관점으로 검토한다. 검토 통과는 원격 적용 승인이 아니다.
- **RLS 정책의 auth 호출은 감싼다:** 정책 `USING`/`WITH CHECK`에서는 `auth.uid()` 대신 `(select auth.uid())`처럼 쓴다(행마다 재계산 방지, Advisor `auth_rls_initplan`). `npm run test:sql`의 `scripts/validate-rls-auth-wrapping.mjs`가 새 마이그레이션을 검사한다. 보정 이전 파일은 `scripts/rls-auth-wrapping-baseline.json`에 고정돼 있으며 새 파일을 추가하지 않는다.
- **서버 집계 RPC와 앱 계산식은 함께 바꾼다:** 앱이 하던 계산을 RPC로 옮긴 경우(예: 홈 일별 매출·매입 합계, 시작 매장 목록) 판정 기준을 한쪽만 바꾸지 않는다. 대체 경로(`PGRST202`)가 남아 있으면 두 경로와 동등성 검사 스크립트를 함께 고친다.
- `SECURITY DEFINER` 함수는 `SET search_path`를 고정하고, 필요한 경우 `REVOKE ... FROM PUBLIC, anon, authenticated` 후 필요한 역할에만 `GRANT`한다.
- `~/.supabase`, `.env`, `supabase/supabase/.temp` 등 비밀·세션·프로젝트 식별 파일을 읽거나 출력하지 않는다.
- 앱 코드의 DB 접근은 `lib/services/`에서만 한다. 새 RPC를 만들면 서비스 계층 계약과 `types/index.ts`도 함께 맞춘다.
- 운영 데이터 변경, 대량 삭제, 전체 초기화는 "출시 전 초기화 예정" 설명만으로 허용되지 않는다.

### Testing Requirements

- 격리 SQL 검증: `npm run test:sql` (PGlite 축약 스키마, 원격 연결 없음). 포함 범위는 `scripts/AGENTS.md` 참고.
- Edge Function 핸들러: `__tests__/functions/*.test.ts`가 Jest로 `handler.ts`를 직접 검사한다. `supabase/functions/`는 Jest 수집 대상에서 제외돼 있다.
- PGlite 통과는 원격 배포 상태·전체 migration chain·실제 동시 트랜잭션·pg_cron·외부 OAuth/POS를 보증하지 않는다. 결과 보고 시 이 한계를 함께 적는다.

### Common Patterns

- 마이그레이션은 `BEGIN; ... COMMIT;`으로 감싸고, 파일 머리 주석에 목적·정책 문서·선행 마이그레이션을 적는다.
- 서버 전용 테이블(`account_unlink_jobs`, `toss_webhook_events` 등)은 클라이언트 역할 권한을 회수하고 `service_role` 또는 `SECURITY DEFINER` RPC로만 접근한다.
- 오류는 코드 문자열(`ACCOUNT_OWNS_STORES` 등)로 올리고 앱은 내부 원문 대신 짧은 안내만 표시한다.

## Dependencies

### Internal

- `lib/services/*` (RPC·테이블 호출), `lib/services/tossplace.ts`·`lib/services/account.ts` (`functions.invoke`)
- `scripts/validate-*.mjs` (PGlite 검증), `__tests__/functions/` (핸들러 테스트)
- `docs/배포전-보완-적용-2026-10-20.md`, `docs/QR-출퇴근-설계안-2026-11-16.md`, `docs/개인정보처리방침-보완안-2026-11-14.md`

### External

- Supabase (Postgres, Auth, Edge Functions, pg_cron), Toss Place Open API, Kakao·Apple 계정 해제 API

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

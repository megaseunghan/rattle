# scripts

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

저장소 루트에서 `node`로 실행하는 개발 보조 스크립트다. 세 갈래로 나뉜다: (1) PGlite 격리 SQL 검증 `validate-*-sql.mjs` 등, (2) 아이콘·네이티브 설정 생성 도구, (3) 시뮬레이터 역할별 QA 로그인 도구 `qa/`. (1)은 원격에 연결하지 않지만 (3)의 일부는 **원격 Supabase에 연결**한다.

## Key Files

| File | Description |
|---|---|
| `validate-operations-sql.mjs`, `validate-release-sql.mjs`, `validate-read-models-sql.mjs`, `validate-pos-read-models.mjs`, `validate-financial-sharing.mjs`, `validate-regular-wages-sql.mjs`, `validate-daily-work-sql.mjs`, `validate-payroll-snapshot-integration.mjs`, `validate-store-soft-delete-sql.mjs`, `validate-qr-attendance-sql.mjs` | `npm run test:sql`이 이 순서로 `&&` 연결 실행하는 10개. 각자 축약 스키마를 만들고 `supabase/migrations/`의 해당 파일을 읽어 적용한 뒤 역할별(`SET ROLE authenticated`, `request.jwt.claim.sub`) 결과를 `assert`한다 |
| `validate-member-notifications-sql.mjs`, `validate-notification-dismissals-sql.mjs`, `validate-catalog-permissions-sql.mjs`, `validate-daily-expenses-sql.mjs`, `validate-daily-labor-sql.mjs`, `validate-empty-store-deletion-sql.mjs`, `validate-home-workflow-sql.mjs`, `validate-recurring-fixed-expenses-sql.mjs` | `test:sql`에 포함되지 않는 개별 PGlite 검증. 관련 마이그레이션 변경 시 직접 실행 |
| `validate-screen-coverage.mjs` | 읽기 전용 라우트·명세 추적 검사. 인자: `[root] [manifest]`(기본 `docs/screen-manifest-2026-10-26.json`) |
| `validate-rattle-icon-assets.mjs` | 아이콘 산출물 읽기 전용 검사. `--report` 시 `assets/icons/validation.json` 작성 |
| `create-rattle-icons.mjs`, `build-rattle-native-icons.mjs` | 원본 SVG 생성(없는 파일만 `wx`), `assets/icons/navigation/*.svg` → `lib/icons/vectorAssets.ts` 생성(직접 편집 금지) |
| `prepare-rattle-icon-pngs.mjs`, `build-rattle-runtime-images.mjs`, `build-rattle-icon-gallery.mjs` | `assets/icons/raster-plan.json` 기반 PNG 정리·256px 런타임 파생본·오프라인 갤러리(`preview.html`, `catalog.json`) 생성 |
| `configure-native-updates.cjs` | `npm run updates:native`. prebuild 없이 기존 `ios/`·`android/` 네이티브 파일에 업데이트 설정만 동기화 |
| `backup-postgres.sh` | `bash scripts/backup-postgres.sh <libpq-service-name> <backup-directory>`. libpq 서비스 파일 연결로 `pg_dump` 후 `pg_restore --list` 형식 검사와 sha256 생성. 비밀번호·URL을 인자로 받지 않음 |

## Subdirectories

| Directory | Purpose |
|---|---|
| `qa/` | 시뮬레이터 역할별(관리자·정규직·파트타이머) 테스트 로그인 도구. 절차는 `docs/시뮬레이터-역할별-테스트로그인-2026-10-29.md`. `provision.mjs`: `.env`를 읽고 Supabase CLI로 service role 키를 조회해 기존 래틀 데모 매장용 QA Auth 계정을 생성하고 `.qa/accounts.json`(gitignore, 0600)에 저장 — **원격 쓰기**. `broker.mjs`: `127.0.0.1:18765` 루프백 세션 브로커(토큰 검사). `verify.mjs`: QA 계정으로 원격 로그인 확인. `simulators.mjs`: `xcrun simctl`로 역할별 시뮬레이터 준비(`--install`). `build-ios.mjs`/`rebundle-ios.mjs`: QA 로그인 활성 Release 시뮬레이터 빌드·JS 재번들. `check-bundle.mjs`: 번들의 브로커 토큰 일치 확인 |

## For AI Agents

### Working In This Directory

- PGlite 검증 스크립트는 로컬 전용이며 자격증명·네트워크를 쓰지 않는다. 이 성질을 유지하고 Supabase 클라이언트·환경변수를 추가하지 않는다.
- PGlite 통과는 원격 DB 적용 상태·전체 migration chain·실제 동시 트랜잭션·pg_cron(`20261114121000_store_purge_schedule.sql` 제외됨)을 증명하지 않는다.
- `qa/provision.mjs`, `qa/verify.mjs`, `qa/broker.mjs`는 원격 Auth/DB에 닿는다. 사용자 위임 없이 실행하지 않으며, `.qa/accounts.json`·`.env` 내용(비밀번호·키·토큰)을 읽어 출력하지 않는다. 스크립트에 박힌 프로젝트 ref·고정 UUID를 공유 문서로 옮기지 않는다.
- `backup-postgres.sh`도 실제 DB에 연결한다. 대상 서비스 확인과 사용자 지시 없이 실행하지 않는다.
- 새 마이그레이션 영역을 검증하려면 기존 `validate-*-sql.mjs`를 본떠 새 파일을 만든다: 머리 주석에 "로컬 PGlite 전용", 가짜 UUID, `checks` 카운터, `assert/strict`.
- `test:sql`에 새 스크립트를 추가하는 것은 `package.json` 변경이므로 소유자·범위를 확인한다.

### Testing Requirements

- `npm run test:sql` — 위 10개 연속 실행, 하나라도 실패하면 중단.
- 개별: `node scripts/validate-<name>.mjs`. 일부는 `RATTLE_PGLITE_MODULE` 환경변수로 PGlite 모듈 경로를 바꿀 수 있다.
- 화면 목록 변경 시 `node scripts/validate-screen-coverage.mjs`(행동 E2E 아님).
- 실행 결과는 명령·시각·커밋/미커밋 기준과 함께 기록한다.

### Common Patterns

- `const db = new PGlite()` → `CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;` 축약 → `readFile('supabase/migrations/...')` → 역할 전환 후 assert → `finally`에서 종료.
- QR 검증은 `pgcrypto` 확장(`@electric-sql/pglite/contrib/pgcrypto`)과 `node:crypto` HMAC을 사용한다.
- 생성 스크립트는 기존 원본을 덮어쓰지 않도록 `{ flag: 'wx' }`를 쓴다.

## Dependencies

### Internal

- `supabase/migrations/*.sql`, `package.json` (`test:sql`, `updates:native`), `assets/icons/`, `lib/icons/vectorAssets.ts`, `docs/screen-manifest-2026-10-26.json`

### External

- `@electric-sql/pglite` 0.5.10, `pngjs`, `@expo/config`·`@expo/config-plugins`·`@expo/plist`, `@supabase/supabase-js`(qa), Supabase CLI·`xcrun simctl`·`xcodebuild`(qa), `pg_dump`/`pg_restore`/`shasum`

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

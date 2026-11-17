# functions

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

Supabase Edge Functions(Deno) 소스다. 계정 탈퇴, Toss Place API 프록시, Toss 웹훅 수신, 카카오 연결 해제 재처리를 담당한다. 대부분 함수는 `index.ts`(환경변수·Supabase 클라이언트 주입)와 `handler.ts`(의존성 주입형 순수 HTTP 핸들러)로 나뉘어 Jest에서 핸들러만 검증할 수 있다.

## Key Files

| File | Description |
|---|---|
| `deno.json` | Deno 컴파일 옵션(`lib: ["deno.window"]`) |
| `deno.lock` | Deno 원격 import 잠금 파일. 직접 편집하지 않는다. |

## Subdirectories

| Directory | Purpose |
|---|---|
| `_shared/` | 공용 모듈. `accountUnlinks.ts`: `claim_account_unlinks` RPC로 작업을 가져와 카카오 `v1/user/unlink` 호출, 성공(또는 `-101` 이미 해제) 시 `account_unlink_jobs` 행 삭제, 실패 시 `last_error_code` 기록 후 `unlink_pending` throw. `appleUnlink.ts`: ES256 client secret(5분 만료) 생성 → 인증 코드 교환 → `id_token` subject 대조 → refresh token revoke, 실패 코드 `APPLE_REAUTH_REQUIRED`/`APPLE_ACCOUNT_MISMATCH`/`APPLE_UNLINK_FAILED`. 각 `*.test.ts`는 `Deno.test` 기반 |
| `delete-account/` | 탈퇴. 사용자 JWT 확인 → `assert_account_deletable` RPC → Apple 해제(실패 시 중단, 409/503) → `auth.admin.deleteUser` → 카카오 해제(실패 시 `202 cleanupPending`). 소유 매장이 있으면 `ACCOUNT_OWNS_STORES` 409 |
| `toss-proxy/` | 앱의 Toss Place API 호출 경유지. POST 본문의 `path`가 `/merchants/{id}/order/orders[/id]` 또는 `/catalog/items`인 GET 조회만 허용, 쿼리 키 화이트리스트(`from,to,page,size` / `page,size`). 사용자 JWT(anon 키 + RLS)로 소유자 또는 승인 구성원+`can_read_store_financials` 확인. 서비스 역할 키 미사용 |
| `toss-webhook/` | Toss 웹훅 수신. `x-toss-timestamp`(13자리, ±5분)·`x-toss-signature`(HMAC-SHA256 `v1=`) 검증, `x-toss-webhook-id`와 이벤트 id 일치 확인, `app.installation.created.v1`/`deleted.v1`만 `process_toss_webhook` RPC로 처리(나머지 `ignored`). 1MB 초과 413 |
| `account-unlink-retry/` | 개발자 수동 호출용 카카오 해제 재처리. `Authorization: Bearer <service role>`만 허용, 실패 시 503 `RETRY_PENDING`. `handler.ts` 없음 |
| `ocr/` | 빈 폴더. 매입 스캔·OCR은 제공하지 않는 기능이므로 여기에 구현을 추가하지 않는다 |

## For AI Agents

### Working In This Directory

- 배포(`supabase functions deploy`)와 원격 호출은 사용자 위임 없이 하지 않는다. `toss-webhook`은 과거 문서상 `--no-verify-jwt`로 배포됐다(`docs/배포전-보완-적용-2026-10-20.md`). 배포 순서가 SQL과 얽혀 있으므로 그 문서를 먼저 읽는다.
- 환경변수(`SUPABASE_SERVICE_ROLE_KEY`, `TOSS_ACCESS_KEY`, `TOSS_WEBHOOK_SECRET`, `KAKAO_ADMIN_KEY`, `APPLE_*` 등)는 이름만 참조한다. 값을 출력·로그·커밋하지 않는다. 로그는 `console.error(JSON.stringify({ event }))`처럼 이벤트 코드만 남긴다.
- 새 로직은 `handler.ts`에 의존성 주입 형태로 두고, 외부 API·DB 호출은 `index.ts`에서 주입한다.
- 응답 오류는 고정 코드(`AUTH_REQUIRED`, `DELETE_FAILED` 등)만 반환하고 내부 원문을 노출하지 않는다.
- 탈퇴 순서(Apple 해제 → Auth 삭제 → 카카오 해제)와 "Apple 실패 시 중단, 카카오 실패는 기록 후 수동 재처리"를 유지한다. 자동 예약 재시도를 추가하지 않는다.
- 삭제된 `submit-toss-application/`처럼 다른 작업의 미커밋 변경을 되돌리지 않는다.

### Testing Requirements

- Jest: `npm test -- __tests__/functions --runInBand --no-coverage` (`deleteAccount`, `tossProxy`, `tossWebhook` 핸들러, `@jest-environment node`).
- `package.json` Jest 설정이 `<rootDir>/supabase/functions/`를 제외하므로 `_shared/*.test.ts`는 Jest로 돌지 않는다. Deno 환경에서 `deno test`로 별도 실행해야 하며 전용 npm 스크립트는 없다.
- 핸들러 테스트는 실제 Auth·Toss·Kakao·Apple 서버 동작을 대체하지 않는다.

### Common Patterns

- `serve(createXxxHandler({...deps}))` 구조, `OPTIONS`/메서드 검사 → 인증 → 입력 검증 → 처리 순.
- 외부 `fetch`는 `AbortSignal.timeout(...)`과 `redirect: 'error'`(프록시)로 제한.
- 서비스 역할 클라이언트는 `persistSession: false`로 생성.

## Dependencies

### Internal

- `lib/services/account.ts` (`functions.invoke('delete-account')`), `lib/services/tossplace.ts` (`functions.invoke('toss-proxy')`)
- RPC: `assert_account_deletable`, `claim_account_unlinks`, `process_toss_webhook`, `can_read_store_financials` (`supabase/migrations/`)
- `supabase/operations/health.sql` (해제 대기·웹훅 상태 조회)

### External

- `deno.land/std@0.168.0/http/server.ts`, `esm.sh/@supabase/supabase-js@2`
- Toss Place Open API, Kakao `kapi.kakao.com`, Apple `appleid.apple.com`

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

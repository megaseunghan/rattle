# api

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

HTTP로 직접 호출되는 Supabase Edge Functions의 조회용 API 문서다. 테이블 CRUD는 `lib/services/*.ts`가 supabase-js로 호출하고 RLS로 보호하므로 범위 밖이다(PostgREST·RPC 전체 명세 미포함).

## Key Files

| File | Description |
|---|---|
| `openapi.yaml` | 원본 스펙(OpenAPI 3.0.3, "Rattle Edge Functions API"). 현재 경로 `/delete-account`, `/toss-proxy`, `/toss-webhook` |
| `index.html` | Swagger UI 5.17.14(cdnjs 고정 버전)로 `openapi.yaml`을 읽는 뷰어. Try it out 비활성화 |
| `README.md` | 실행 방법, 범위, Toss 프록시 권한 규칙, 배포 유의사항 |

## For AI Agents

### Working In This Directory

- 원본은 `openapi.yaml`이다. `index.html`은 뷰어일 뿐이니 스펙 내용을 HTML에 중복하지 않는다.
- 함수 추가·삭제·계약 변경 시 `supabase/functions/<name>/index.ts`와 대조해 스펙과 `README.md`의 함수 개수·범위를 함께 맞춘다. 2026-11-17 기준 `README.md`는 "Edge Functions 5개"라고 적고 있으나 `openapi.yaml`의 경로는 3개이고(`submit-toss-application` 삭제 진행 중), 디렉터리에는 `account-unlink-retry`, `ocr`도 있다. 고칠 때는 실제 코드를 기준으로 판단한다.
- 인증: `toss-webhook`을 뺀 모든 함수는 `Authorization: Bearer <user JWT>`와 `apikey`가 필요하다. `toss-webhook`은 HMAC-SHA256 서명을 검증하며 `--no-verify-jwt` 배포가 필요하다.
- `toss-proxy`는 소유자·승인 멤버만, 주문 목록/상세·카탈로그 GET만 허용하고 서비스 역할 키를 쓰지 않는다. 이 제약을 문서에서 완화하지 않는다.
- 문서 수정은 배포가 아니다. `supabase functions deploy`는 사용자 허가 없이 실행하지 않는다. 원격 배포 설정을 확인하지 않았다면 확인했다고 쓰지 않는다.
- Try it out을 다시 켜지 않는다(계정 삭제 등 실수 실행 방지).

### Testing Requirements

- `npm run docs:api` → http://127.0.0.1:8732 에서 렌더링 확인(인터넷 필요).
- YAML 문법과 `$ref` 해석 오류가 없는지 확인한다. 실제 호출 검증은 확인된 테스트 계정으로 별도 수행한다.

### Common Patterns

- 경로별 `description`에 권한·허용 쿼리·부작용을 한국어로 적는다.
- 에러 응답은 내부 원문을 노출하지 않는 앱 정책과 맞춘다.

## Dependencies

### Internal

- `../../supabase/functions/*` (실제 구현), `../../lib/services/` (`tossProxyRequest` 등 호출부), `../../package.json`의 `docs:api` 스크립트

### External

- Swagger UI 5.17.14 (cdnjs), Python `http.server` (로컬 제공)

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

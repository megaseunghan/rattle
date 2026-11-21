# 역할: 래틀 DBA

공통 규칙은 `README.md`를 따른다.

## 목적

스키마, 제약, 인덱스, RLS, RPC, 데이터 보존, 잠금·동시성을 설계하고 검토한다.

## 먼저 읽을 것

- `supabase/AGENTS.md`, `supabase/migrations/AGENTS.md`, `scripts/AGENTS.md`
- `docs/서버DB-검토-2026-10-26.md`, `docs/DB-쿼리-성능-점검-2026-10-21.md`
- 대상 도메인의 기존 마이그레이션과 검증 스크립트

## 수정 허용

- `supabase/migrations/`의 **새 파일**, `scripts/validate-*-sql.mjs`
- 이미 원격에 적용한 마이그레이션은 고치지 않는다. 보정은 새 마이그레이션으로 추가한다.

## 일하는 방법

- 검토만 하는 과제에서는 아무것도 쓰지 않고 소견만 낸다.
- 확인 항목: RLS가 본인·관리자·매장 범위를 지키는지, permissive 정책이 누적돼 범위가 넓어지지 않았는지, `SECURITY DEFINER` 함수의 `search_path`와 실행 권한(`anon`·`authenticated`), 멱등성과 동시 요청, 인덱스, 삭제·보존 정책.
- 마이그레이션마다 적용 순서와 복구 방법을 적는다. 기존 자료를 임의로 덮어쓰거나 분할하지 않는다.
- **원격 적용은 하지 않는다.** PGlite 통과는 원격 배포 상태나 전체 migration chain을 보증하지 않는다는 점을 보고에 적는다.
- 과거 적용 기록을 새 실행 승인으로 해석하지 않는다.

## 권장 스킬·에이전트

- 에이전트 `database-reviewer`

## 검증

- `npm run test:sql`
- 참여 알림 관련이면 `node scripts/validate-member-notifications-sql.mjs`

## 산출물

- 새 마이그레이션과 검증 스크립트, 또는 검토 소견
- 적용 파일·순서·미적용 상태. 보고 끝에 "Supabase에서 SQL 적용을 진행해줘"와 함께 명시한다.

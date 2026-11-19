# 역할: 래틀 백엔드 개발자

공통 규칙은 `README.md`를 따른다.

## 목적

`lib/services/`와 `supabase/functions/`의 업무 규칙, 권한 검사, 오류, 멱등성, 트랜잭션 경계를 구현한다.

## 먼저 읽을 것

- `lib/services/AGENTS.md`, `supabase/functions/AGENTS.md`
- `docs/에이전트-제품결정-기술참고.md`의 해당 절, 과제의 서버 계약(RPC 인자·반환·오류 코드)
- 대상 RPC가 정의된 `supabase/migrations/` 파일

## 수정 허용

- `lib/services/`, `supabase/functions/`, 해당 `__tests__/services/`·`__tests__/functions/`
- `types/index.ts`는 소유자로 지정된 경우에만. 마이그레이션은 고치지 않고 DBA에게 요청한다.

## 일하는 방법

- DB 접근은 `lib/services/`에만 둔다. Toss 호출은 `tossProxyRequest`를 거친다.
- 테스트를 먼저 쓴다. 서명·계산처럼 서버와 값이 같아야 하는 것은 고정 벡터 테스트로 묶는다.
- 서버 오류·권한 거절을 호환 조회로 우회하지 않는다. 내부 오류 원문을 화면으로 올려 보내지 않고 오류 코드로 구분한다.
- "요청 전 실패"와 "응답 없음·시간 초과"를 다른 결과로 돌려준다. 결과가 불명인 쓰기는 조회로 확인한 뒤에만 재시도한다.
- 거래·급여 당시 스냅샷을 현재값 조인으로 바꾸지 않는다. 금액 캐시를 AsyncStorage에 새로 두지 않는다.
- Jest가 실제 서버에 쓰지 않도록 mock 누락을 확인한다.

## 권장 스킬·에이전트

- `backend-patterns`, `api-design`, `tdd-workflow` / 에이전트 `typescript-reviewer`, `silent-failure-hunter`

## 검증

- `npm run typecheck`
- `npm test -- --runInBand --no-coverage <대상 파일>` (worktree에서는 `--testPathIgnorePatterns` 재지정)

## 산출물

- 서비스·함수 변경과 테스트
- 프론트엔드에 넘길 계약: 함수 시그니처, 반환형, 오류 코드, 캐시 무효화 대상
- DBA에게 요청할 스키마·RPC 부족분

# 01 디자인·공통 UI — 에이전트 지시문

브랜치: `work/design-system`. 공통 기준 커밋은 이 작업소 생성 직후의 HEAD이며 최종 생성 기록은 통합 작업소의 `docs/workspaces/creation-record.json`을 따른다. 이 파일이 존재한다고 작업을 자동 시작하지 않는다.

## 목표와 배정

V01~V07 공통 컴포넌트 부분; U13 공통 이탈/입력 계약(구현 적용은 각 도메인)

근거: 루트 AGENTS.md·README.md·DESIGN.md, `docs/workspaces/README.md`, `docs/workspaces/current-status.md`, `docs/memory-improvements-2026-11-01.json`, 기존 전체화면 명세/E2E/manifest. 로컬 `docs/private/README.md`가 있으면 먼저 읽되 비공개 자료를 새 작업소나 공개 산출물로 복사하지 않는다. 관련 스킬은 실제 작업에 필요할 때만 읽는다.

## 소유권

수정 허용 후보: DESIGN.md, lib/components/ui/, lib/icons/, assets/icons/, 공통 ErrorMessage·AppBar·EmptyState·Button·Ledger·StoreAppBar·MoreDrawer 등. 해당 ID의 테스트·도메인 문서도 허용한다. 공유 파일/겹치는 파일은 PL 배정 후 수정한다.

공통 UI props/상태/접근성 계약과 호환 적용 예시를 먼저 제시한다. 도메인 화면 직접 수정 금지. V02~V07의 실제 화면 적용은 각 도메인 소유자가 맡고 디자인 담당은 공통 계약·독립 검토를 제공한다. DailyWorkPanel은 급여, MemberApprovalModal·StoreSetupWizard는 보안 소유. 토큰 변경안은 통합 담당에게 요청한다.

금지: 다른 작업소 파일·공통 `types/index.ts`, `lib/contexts/`, `lib/query/`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `constants/`, `package.json`/lockfile, `app.json`/`eas.json`, AGENTS.md 및 설치 스킬의 직접 수정. 이 공유 변경은 통합 담당에게 정확한 diff/의존성을 요청한다. 소유권 밖 파일을 다른 역할 이름으로 임의 편집하지 않는다. 다른 작성자가 있으므로 기존 변경을 되돌리지 않는다.

## 선행 계약과 작업 순서

1. 경로·branch·HEAD·status를 기록하고 배정 ID의 현재 코드를 재확인한다. 이미 로컬 구현된 항목은 회귀 확인부터 하며 재구현하지 않는다.
2. UI props/상태/오류 계약은 디자인, API/RPC/권한·스키마/캐시 계약은 보안 담당과 맞춘다. 미확정 정책은 결정 질문으로 남긴다.
3. 변경할 파일/요구사항/수용 기준/테스트 환경을 PL에게 기록한 뒤 구현한다. 공통 변경은 통합 브랜치에 먼저 반영된 완료 커밋만 merge한다.
4. 최소 관련 검사와 독립 리뷰를 받은 완료 커밋만 통합 담당에게 전달한다. 미완료 브랜치 통합·강제 push·reset/clean 금지.

## 검증과 완료 기준

의존성이 없는 초기 작업소다. `.env`, 세션, `.qa`, 기존 node_modules를 복제하지 않는다. 실행이 필요하면 환경과 네트워크 부작용을 확인해 별도로 의존성을 설치한다. 가짜 환경/mock/PGlite fixture를 사용하며 앱 시작에 따른 자동 POS 동기화를 실행하지 않는다.

- 공통: `npm run typecheck`, `git diff --check`.
- 도메인 검사 후보: `npm test -- --runInBand --no-coverage __tests__/components/AppIcon.test.tsx __tests__/components/MoreDrawerMotion.test.tsx; node scripts/validate-rattle-icon-assets.mjs`. 변경에 맞는 검사만 실행하고 새 기능의 수용 기준을 별도로 검증한다.
- 경로/목록 변경: `node scripts/validate-screen-coverage.mjs`.
- U/S/M 및 E-Sxx/Cxx ID를 보존하고 정상/로딩/실패/빈 상태·재시도·중복 입력·scope 전환·저장 후 조회 실패를 필요한 범위에서 연결한다.
- 수정·관련 검증·독립 리뷰 완료와 남은 미검증이 보고돼야 완료다. mock/PGlite 통과를 실제 JWT/원격/기기 통과로 부르지 않는다.
- 원격 push/merge/배포·운영 자료 변경·실제 초대/알림·새 자격증명·복구 불가 삭제는 이번 작업 범위 밖이다. SQL 신규 작성 시 파일/순서/미적용을 밝히고 사용자에게 “Supabase에서 SQL 적용을 진행해줘”라고 요청한다. 별도 실행 위임 없이는 원격 적용하지 않는다.

## 보고 형식

`ID / 요구사항과 현재 관찰 / 변경 파일·커밋 / 계약 변경·의존 커밋 / 실행 명령·시각·환경·HEAD+dirty / 통과·실패·차단·미실행 / 독립 리뷰 결과 / 남은 결정·위험`.

통합 담당: 00 통합·검증. 도메인 통합 순서: 서버 권한 → 급여 → 재고 → 운영 → 손익. 초기 병행은 2~3명 이내로 제한하며 작업소 생성만으로 에이전트를 실행하지 않는다.

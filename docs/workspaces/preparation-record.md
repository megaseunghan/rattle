# 작업소 준비 실행 기록 — 2026-11-02

## 최초 준비 시점 상태

**지시문 준비 완료, 공통 기준 커밋·전문 작업소 생성 대기.** 사용자가 다른 작업이 진행 중이라고 확인했으므로 공유 작업본을 커밋하거나 그 상태에서 분기하지 않았다. 기존 변경·OCR·잠긴 워크트리는 보존했다. 에이전트 자동 실행·설치·원격 쓰기·push·배포 없음. 이 문서 작성에 독립 리뷰 에이전트 1명만 사용했다.

- 통합 경로: `/Users/cookhan/rattle`
- 브랜치: `feature/memory-improvements-2026-11-01`
- 시작 HEAD: `0d04e7860ed7b72af933854e5d347a7b8a23bb09` + tracked 94개 변경 및 신규 파일. 실행 중 다른 테스트 파일 변경이 추가 관찰됨.
- 원격 Git 최신 여부 미조회.
- Orca 등록 2개: 통합 경로와 `.worktrees/ocr-receipt-scanning` (OCR HEAD `59370fbc2d1709752c54f7a77442d747d1c476b9`).
- 별도 잠긴 준비 워크트리: `/Users/cookhan/orca/workspaces/.orca-preparing/91811-73af283b-aa8e-4b56-9d5c-a539bc8bfbab`, HEAD `adb48724637153075c2c45afe6b0ab4a0c8467e4`. 이번 작업에서 잠금 해제/삭제하지 않음. 후속 `git worktree list --porcelain`에서는 해당 항목이 사라진 것을 관찰했다. 다른 작업이 진행 중이므로 외부 변경으로 기록하며 재개 시 재조회한다.

## 실행 검증

기준은 시작 HEAD+당시 dirty 소스다. 실행 도중 외부 수정이 관찰됐으므로 아래 결과를 최종 기준 커밋 통과로 사용하지 않는다. 실제 JWT/원격 DB/네이티브/실기기/스토어 검증은 미실행.

| 명령/검토 | 결과 |
|---|---|
| `npm run typecheck` | 통과 |
| `npm test -- --runInBand --no-coverage` | 실패: 107 suites 중 105 통과, 661 tests 중 659 통과 |
| `npm run test:sql` | 통과: 로컬 합성 PGlite fixture |
| `node scripts/validate-catalog-permissions-sql.mjs` | 합성 90 checks 통과 |
| `node scripts/validate-member-notifications-sql.mjs` | 10 checks 통과 |
| `node scripts/validate-screen-coverage.mjs` | 42 routes 통과. 행동 E2E 아님 |
| `node scripts/validate-rattle-icon-assets.mjs` | PNG 24/SVG 58/누락 0. 기존 여백 경고 11건 |
| `git diff --check` | 시작 상태 통과 |
| 독립 코드/DB 관점 리뷰 | HIGH 1건: 공제 저장/재조회 겹침의 다른 명세 누락. 기준 커밋 전 해결 필요 |

Jest 실패 1: `weeklyDashboardBatch.test.ts`의 schedule mock이 추가된 `.select().maybeSingle()` 계약과 불일치. 실행 도중 다른 작업이 해당 mock 수정한 것을 확인했으나 새 통과 결과로 간주하지 않는다.

Jest 실패 2: `StoreSettingsRecovery.test.tsx`의 매장 정보 저장 후 읽기 재시도 버튼이 남는 assertion 실패. 제품 오류/비동기 타이밍 여부 재현·수정 필요.

로컬 실행 증거(비공개 내용은 복제하지 않음): `/private/tmp/rattle-worktree-rollout-20261102/` 아래 `tracked-start.patch`, `status-start.z`, `input-inventory.json`(파일별 크기·SHA-256), `jest.log`, `sql.log`. temp 증거는 영구 보관이나 Git 전달을 보장하지 않는다. 초기 inventory는 진행 중인 시점의 스냅샷이며 최종 기준본 목록이 아니다.

신규 지시문 9개 문서의 링크 검사와 독립 문서 리뷰 완료. 리뷰에 따라 통합 담당의 BUILD/RELEASE 관리와 V02~V07 도메인 적용 책임을 명시했다. 이 문서 검토 통과는 기존 코드 HIGH 해결을 의미하지 않는다.

## 포함/제외 예정과 재개 조건

신규 앱 소스/테스트/권한 SQL/런타임 아이콘·필요 생성·검증 입력과 라이선스는 의존성 검토 후 포함한다. 현재 `.agents/skills/make-interfaces-feel-better/`와 `skills-lock.json`, `docs/store-assets/`, 자산 ZIP, 미검토 참조 원본은 원래 위치에 보존하고 공통 기준본에서 제외할 예정이다. 비밀 환경/QA 인증/세션/비공개 분석 자료는 복제하지 않는다. 아직 staging/commit하지 않았으므로 최종 포함 파일은 미확정이다.

1. 사용자가 다른 작업 완료·파일 수정 중단을 확인한다.
2. 최신 status/diff/해시를 다시 수집하고 기존 검토 이후 변경을 대조한다. 두 테스트 실패 및 리뷰 HIGH를 해결하고 독립 재검토·관련 회귀 후 최종 전체 검증한다.
3. 포함/제외 목록과 의존성을 확정해 명시적 staging·민감정보 검사·로컬 기준 커밋을 만든다.
4. `README.md` 절차로 6개 작업소를 순차 생성하고 실제 반환 경로·브랜치·HEAD·부모·clean 상태를 `creation-record.json`에 기록한다.
5. Orca 등록 8개와 왼쪽 화면·접근 가능 여부를 확인한다. 원격 배포나 실제 개선 기능 전체 완성을 이번 준비 완료와 혼동하지 않는다.


## 재개 후 기준본 검증

사용자가 다른 작업 완료를 확인했다. HEAD는 동일하며 당시 inventory 이후 수정 범위를 재대조했다. 급여 조회 HIGH를 수정하고 직원 2명·월 합계 보존 회귀 2건을 추가했다. 저장중 새 조회 차단과 동일 범위 전체 스냅샷 보존을 독립 재검토해 APPROVE를 받았다. schedule mock은 다른 작업의 수정본을 보존했고 현재 통과했다. 매장 설정 재시도 테스트도 현재 통과했다.

- typecheck 통과.
- 전체 Jest 107 suites / 663 tests 통과(24.469초). 기존 DailyWorkPanel act 경고는 남음.
- 전체 로컬 PGlite SQL·catalog 90 checks·참여알림 10 checks·42-route manifest 통과.
- 아이콘 PNG 24/SVG 58 누락 0; 기존 여백 경고 11건 유지. 픽셀/실기기 시각 검증은 별도.
- 새 실행 로그: 같은 temp 폴더의 `targeted.log`, `jest-final.log`, `typecheck-final.log`, `sql-final.log`.
- 기준본 포함/제외와 SHA-256은 `baseline-files.json`. 비밀 패턴 검사에서 포함 후보 하드코딩 자격증명 패턴 0건. 보안 전수 인증은 아님.
- 초기 snapshot부터 현재까지 동료 변경을 덮어쓰지 않았다. 제외 파일은 원래 경로에 남기고 환경/QA/비공개 자료는 복제하지 않는다.
- 최종 기준 커밋/실제 작업소 생성/부모/경로·검증 상태는 생성 후 `creation-record.json`에 기록한다. 원격 push/배포/운영 자료 변경은 하지 않는다.


## 생성 완료 기록

로컬 공통 기준 커밋: `010541dfd7f8ff0e576f35fa92a3add1709ad67a` (291개 파일). 00 통합·검증의 브랜치는 유지했다. 전문 작업소 01~06은 이 커밋에서 생성됐으며 실제 경로/브랜치/부모/검증은 `creation-record.json`을 따른다. 6개 모두 생성 직후 Git 변경 없음, 지시문 파일 존재, `.env`/`.qa`/node_modules 미복제 확인. Orca metadata에 각 지시문 경로도 연결했다. 제외한 128개 파일은 SHA-256 대조로 원래 위치의 내용 보존을 확인했다.

Orca 목록은 통합 1 + 전문 6 + 기존 OCR 1 = 총 8개다. OCR 커밋과 기존 dirty 자료는 보존했다. 잠긴 준비 워크트리는 재개 시 이미 목록에 없었으며 이 작업에서 삭제·잠금 해제한 이력은 없다. 자동 설치와 전문 작업소 에이전트 실행은 하지 않았다.

GUI 확인은 차단: `orca computer get-app-state`가 `permission_denied`(Accessibility)를 반환했다. 안내된 permissions 조회가 granted를 보고한 뒤 재시도해도 같은 오류였다. CLI 등록·경로 접근 확인은 완료했지만 왼쪽 화면의 시각 확인을 통과로 보고하지 않는다. 권한 오류가 해소되면 화면 확인만 추가로 수행하면 된다.

최종 생성 기록은 통합 브랜치의 후속 문서 커밋으로 보관한다. 전문 작업소 6개는 공통 기준 커밋 그대로 유지한다. 원격 push/merge/배포·DB 적용·운영 자료 변경 없음. 기존 로컬 SQL 2개를 기준본에 포함했을 뿐 이번에 신규 SQL을 작성하거나 원격 적용하지 않았다.

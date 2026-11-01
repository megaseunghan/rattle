# Rattle 전문 작업소 운영

현재 폴더는 통합 담당이다. 전문 작업소 6개는 **검토·검증을 통과한 동일 로컬 커밋**에서 생성한다. 이 문서와 지시문 작성은 기능 개선 착수나 원격 배포를 의미하지 않는다.

| Orca 이름 | 브랜치 | 지시문 |
|---|---|---|
| 00 통합·검증 | feature/memory-improvements-2026-11-01 | 이 문서 |
| 01 디자인·공통 UI | work/design-system | [지시문](01-design-system.md) |
| 02 급여·근무 | work/payroll | [지시문](02-payroll.md) |
| 03 재고·레시피·매입 | work/inventory | [지시문](03-inventory.md) |
| 04 운영·알림·스케줄 | work/operations | [지시문](04-operations.md) |
| 05 손익·매출·설정 | work/finance-settings | [지시문](05-finance-settings.md) |
| 06 서버 권한·인증 | work/security-auth | [지시문](06-security-auth.md) |

기존 OCR 작업소는 별도 보존하며 자동 통합하지 않는다. 잠긴 `.orca-preparing` 워크트리도 삭제·잠금 해제하지 않는다. 정상 생성 후 Orca 등록은 기존 2개 + 신규 6개 = 8개이며, 잠긴 준비 워크트리는 별도다.

## 기준본 확정 절차

1. 다른 세션의 소스 수정이 끝났는지 확인한다. status/HEAD와 tracked·untracked 파일 SHA-256을 기록하고 검증 종료 때 다시 비교한다. 작업 중 바뀐 파일은 이전 검증을 자동 승계하지 않는다.
2. 신규 소스·테스트·필수 자산·라이선스를 포함해 의존성을 검토한다. 비밀 환경파일/세션/개인정보/비공개 연구/QA 인증/불필요 ZIP/스토어 자료/로컬 스킬 설치 변경은 원래 작업소에 보존한다. 제외 목록·사유·해시는 로컬 증거와 생성 기록에 남긴다.
3. 실제 staged 파일 목록을 확인하고 비밀정보 검사·diff check·typecheck·전체 Jest·관련 SQL·manifest와 독립 리뷰를 완료한다. 필수 의존성이 미확정이거나 검증이 실패하면 분기하지 않는다.
4. 명시한 파일만 로컬 커밋한다. 원격 최신 여부는 별도이며 fetch하지 않았으면 최신이라 부르지 않는다. push/merge/배포하지 않는다.
5. 기준 커밋 SHA를 고정하고 `creation-record.json`에 생성 전후 branch/HEAD/path/parent/status와 검증·제외를 기록한다. 이 기록은 생성 후 통합 작업소에서 작성하며 신규 작업소에 추가 변경을 만들지 않는다.

## Orca 생성 계약

Orca CLI `worktree create --help`에서 확인한 구문이다. **기준 커밋 확정 후** 각 역할별로 순차 실행한다. 재실행 전에 기존 이름/브랜치가 생성됐는지 확인해 중복을 만들지 않는다.

```sh
orca worktree set --worktree path:/Users/cookhan/rattle --display-name '00 통합·검증' --json
orca worktree create --repo path:/Users/cookhan/rattle --name '01 디자인·공통 UI' --branch work/design-system --base-branch feature/memory-improvements-2026-11-01 --parent-worktree path:/Users/cookhan/rattle --setup skip --activate --json
```

나머지도 표의 이름/브랜치로 실행한다. 매 호출 전 기준 브랜치 HEAD가 고정 SHA와 같은지 확인한다. `--agent`/`--prompt`/`--run-hooks`를 전달하지 않는다. 이름 충돌로 suffix 브랜치가 반환되면 즉시 중단하고 기존 작업소와 대조한다. 응답 유실도 목록/실제 Git 경로를 확인한 뒤 처리하며 새 생성 요청을 무조건 반복하지 않는다.

환경파일·node_modules를 복제하지 않고 설치도 자동 실행하지 않는다. 새 작업소는 코드 검토를 바로 시작할 수 있으나 테스트/앱 실행은 의존성·가짜 환경·원격 부작용 확인을 거쳐 별도로 준비해야 한다. 최종적으로 CLI 목록과 Orca 왼쪽 화면에서 8개 이름·접근을 확인한다. GUI를 보지 못했으면 미검증으로 보고한다.

## 공유 파일과 통합

- 통합 담당은 BUILD-01·RELEASE-01/02의 후속 검증과 증거를 관리한다. 이번 준비에서 빌드·배포를 자동 실행하지 않는다.
- V02~V07은 디자인 담당이 공통 계약·검토를 제공하고 실제 도메인 화면 적용은 해당 화면 소유자가 맡는다.
- 통합 담당 소유: `types/index.ts`, `lib/contexts/`, `lib/query/`, `constants/`, 루트·탭 라우팅, package/lock, 앱·EAS 설정, AGENTS.md. 공통 변경 요청은 담당이 순차 반영한다.
- 디자인은 공통 UI props·상태·접근성 계약과 예시를 제공하고 각 도메인이 자신의 화면에 적용한다. 도메인 화면을 디자인과 동시에 수정하지 않는다.
- 서버 담당은 API/RPC 인자·반환형·오류·권한·부작용·캐시 무효화 계약을 먼저 작성하고 DB 변경은 DBA 관점의 독립 검토를 받는다. 검토가 원격 실행 승인은 아니다.
- 공통 완료 커밋 → 통합 브랜치 → 필요한 작업 브랜치 merge 순서다. 각 도메인은 서버 권한 → 급여 → 재고 → 운영 → 손익 순서로 완료·검토된 커밋만 전달한다. 충돌은 통합 담당과 해당 작성자가 해결한다.
- 초기 병행은 2~3명으로 제한한다. 이 준비 작업은 에이전트 상시 실행 권한이 아니며 작업소 생성 시 자동 에이전트를 띄우지 않는다.

## 통합 담당 완료 기준

모든 신규 HEAD가 기준 커밋과 같고 생성 직후 porcelain status가 비어야 한다. 부모·실제 경로·브랜치·지시문 존재를 확인한다. OCR과 잠긴 작업소 전후 상태도 대조한다. 통합 이후 typecheck/전체 Jest/필요 SQL/manifest·독립 리뷰를 다시 완료한다. 실제 JWT·원격 DB·시뮬레이터·실기기·스토어 확인은 각각 별도 상태로 보고한다.

현 상태와 미해결 사항은 [현재 판정](current-status.md), 실행 증거와 재개 조건은 [준비 기록](preparation-record.md)을 따른다. 기존 과거 보고서의 통과 기록은 현재 기준본의 통과를 대신하지 않는다.

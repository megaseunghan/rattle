# archive

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

완료된 구현·점검·설치·배포 작업의 당시 기록을 월별로 보관한다. 보관은 전체 기능·실제 기기·서버 권한 검증의 완료 선언이 아니며, 각 문서의 미실행·차단·후속 확인 조건이 그대로 유효하다. 현재 작업은 `../README.md`와 `../workspaces/README.md`에서 확인한다.

## Key Files

| File | Description |
|---|---|
| `README.md` | 보관 목록(월·문서 링크 표)과 정리 기록(2026-11-02, 24개 이동, 삭제 없음) |

## Subdirectories

| Directory | Purpose |
|---|---|
| `2026-10/` | 22개 기록. EAS 첫 배포, TestFlight 1.0.0(3), SQL 원격 적용 확인, 탈퇴 함수 배포 확인, GitHub 정리, UX 하네스 네이티브 검증, 홈 하루업무·글래스, 손익 상세·스크롤, 급여변경 입사일 스냅샷, 리스트·화면전환 최적화, 공통 아이콘 제작목록 등 |
| `agent-roles-2026-11/` | 역할별 작업자 지침 보관본(2026-11-17~11-20 Orca 오케스트레이션, 2026-11-21 중단). 현행 지침 아님 |
| `2026-11/` | 2개 기록. 급여·일별근무 SQL 서버 대조, 체크리스트 즉시동기화 hotfix(2026-11-01) |

## For AI Agents

### Working In This Directory

- 이 폴더의 기록을 현재 서버·설치본의 검증 증거로 인용하지 않는다. 필요하면 현재 코드·DB·빌드로 다시 확인한다.
- 문서를 옮길 때는 `YYYY-MM/` 폴더에 원래 파일명으로 두고 `README.md` 표에 행을 추가한다. 문서 안 링크와 저장소 기준 경로만 새 위치에 맞추고 본문 결론은 바꾸지 않는다.
- 미검증 범위·후속 조치를 삭제하거나 완료로 고치지 않는다.
- 현재 명세, 운영/SQL 적용 안내, 미해결 감사·계획, 진행 중 QA, 작업소 지시문은 보관 대상이 아니다(상위 `docs/`에 유지).
- 다른 문서가 링크하는 기록(예: `assets/icons/navigation/README.md` → `2026-10/공통-아이콘-Assets-제작목록-2026-10-30.md`)은 이름을 바꾸지 않는다. 바꿔야 하면 역참조를 모두 갱신한다.
- `../workspaces/baseline-files.json`, `creation-record.json`은 당시 경로 스냅샷이므로 이동 때문에 고치지 않는다.

### Testing Requirements

- 이동·추가 후 상대 링크가 깨지지 않았는지 확인한다(`grep -rn "archive/" docs AGENTS.md assets` 등으로 역참조 대조).

### Common Patterns

- 파일명 `주제-YYYY-MM-DD.md`. 기록은 실행 명령·환경·커밋·결과·미실행 항목을 포함한다.

## Dependencies

### Internal

- `../README.md` (보관 기준), `../workspaces/README.md` (현재 진행), `../에이전트-제품결정-기술참고.md` (정책 원문)

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

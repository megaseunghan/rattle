# .agents

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

이 저장소에 포함된 에이전트 스킬(`skills/<name>/SKILL.md`)을 보관한다. 스킬은 작업 방법을 안내하는 문서이며, 사용자 요청 범위나 상위 `AGENTS.md`의 안전·승인 제약을 넓히는 허가가 아니다. 관련 있을 때만 사용한다.

## Subdirectories

| Directory | Purpose |
|---|---|
| `skills/rattle-design-dialogue/` | `name: rattle-design-dialogue`. Rattle 전용 모바일 UI 디자인 협업. 현재 코드 확인 → 질문 하나 → 실제 인터랙티브 시안 비교 → 선택 고정 → 모바일·상태별 검증 → 마무리. `references/review-and-handoff.md`(Nielsen H1~H10 검토·인계), `agents/openai.yaml`(표시 이름·기본 프롬프트) |
| `skills/hallmark/` | `name: hallmark`, v1.1.0. Anti-AI-slop 디자인 스킬(신규 페이지, 감사, 리디자인, URL/스크린샷 디자인 추출). `references/`에 색·레이아웃·카피·컴포넌트(`components/`)·장르·매크로 구조 등 참조 |
| `skills/write-swift/` | `name: write-swift`. 현대 Swift 작성법(값 타입, Swift 6 동시성, 프로토콜·제네릭, Swift Testing 등). `.claude/skills/write-swift`가 이 폴더를 가리키는 심볼릭 링크 |
| `skills/moliboy5000-.claude-ralplan/` | `name: ralplan`. `/omc-plan --consensus` 별칭 |


## For AI Agents

### Working In This Directory

- Rattle 화면을 함께 다듬거나 시안을 비교할 때는 `skills/rattle-design-dialogue/SKILL.md`를 따른다(루트 `AGENTS.md` 디자인 공통 기준). 한 번에 한 결정만 묻고, 확정된 부분은 유지하며, 시안 확정과 실제 앱 구현을 구분한다.
- rattle-design-dialogue는 디자인 방향·AI Slop 검토에 `../hallmark/SKILL.md`를 함께 참조한다. Hallmark가 없으면 부재를 알리고 자체 검토로 진행하며, 자동 설치하거나 실행 완료라고 주장하지 않는다.
- 시안 작업은 `docs/design/<주제>-<날짜>/`에 미리보기와 하나의 `design-state.md`를 두는 방식을 따른다. 모바일 기준 검증은 `DESIGN.md`의 모바일 공통 적용 규칙을 따른다.
- `write-swift`는 Swift 코드 작업에만 해당한다. 현재 앱은 Expo/React Native(TypeScript)이므로 일반 작업에 적용하지 않는다.
- 스킬 파일은 frontmatter(`name`, `description`)를 유지한다. 이름을 바꾸면 루트 `AGENTS.md`의 링크와 `.claude/skills` 심볼릭 링크를 함께 확인한다.
- 외부에서 받은 스킬(hallmark, write-swift, ralplan)을 고칠 때는 로컬 변경임을 기록한다. 스킬 설치·삭제는 사용자 요청이 있을 때만 한다.

### Testing Requirements

- 실행 코드가 아니다. 수정 후 frontmatter YAML이 유효한지, 본문의 상대 경로(`references/`, `../hallmark/SKILL.md`, `docs/...`)가 실제로 존재하는지 확인한다.

### Common Patterns

- 디렉터리당 `SKILL.md` 하나, 긴 내용은 `references/`로 분리, 에이전트별 표시 설정은 `agents/`에 둔다.

## Dependencies

### Internal

- `../AGENTS.md`, `../DESIGN.md`, `../docs/UIUX-휴리스틱-전체화면-검토-2026-10-30.md`, `../docs/design/`, `../.claude/skills/`

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

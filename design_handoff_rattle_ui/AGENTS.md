# design_handoff_rattle_ui

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-17 · **Updated:** 2026-11-17

## Purpose

초기 디자인 도구에서 넘겨받은 Rattle UI 핸드오프 묶음이다(2026-09-12 추가, 2026-10-20 마지막 수정). 화면별 레이아웃·카피, 공통 패턴, 토큰, 인터랙션·데이터 요구사항, Toss POS 온보딩 자동화 구상을 담는다. 현재 디자인 기준은 루트 `DESIGN.md`와 코드의 토큰이며, 이 폴더는 과거 참고 자료다.

## Key Files

| File | Description |
|---|---|
| `screens.md` | 화면별 목적·레이아웃·컴포넌트·카피. 캡션 `번호 · 화면명 (진입 경로) (역할)` 형식(예: `00 · 통합 대시보드`, `37 · 카카오 소셜 로그인`) |
| `patterns.md` | 공통 패턴 14종(화면 셸, AppBar, 탭바+FAB, 요약/리스트 카드, 폼 필드, 칩, 토글, 버튼, 바텀시트, 코치마크, 빈 상태 등) |
| `design-tokens.md` | Color·Typography·Spacing·Radius·Shadow·Icons·Toggle 스펙 |
| `interactions.md` | 역할·권한, 내비게이션 플로우, 화면별 상태, 애니메이션, 폼 검증, 로딩/에러, 데이터 요구사항 |
| `onboarding-toss-pos.md` | Toss POS 연동(웹훅 도착) 후 매장 정보 자동 입력·손익 튜토리얼 구상 |
| `support.js` | 디자인 도구 런타임 생성 번들(`dc-runtime`에서 생성, 직접 수정 금지) |

## Subdirectories

| Directory | Purpose |
|---|---|
| `screenshots/` | 캔버스 캡처 `01-canvas.png` ~ `22-canvas.png` |
| `uploads/` | 핸드오프 당시 붙여 넣은 참고 이미지 |

## For AI Agents

### Working In This Directory

- 화면 번호(`00`, `35`~`52` 등)는 핸드오프 고유 번호다. 저장소 화면 ID `Sxx`/`Mxx`/`E-Sxx`/`C01~C09`와 다르므로 섞거나 이 번호로 새 ID를 만들지 않는다. 대응이 필요하면 `docs/전체화면-기능명세-2026-10-26.md`의 ID를 쓴다.
- 현재 제품 범위와 충돌하는 내용이 있다. GPS 기준점·허용 반경·좌표 기반 근태, 매장 위치 자동 등록, 5탭 구성(홈|재고|매입|근태|매출) 등은 현재 결정(QR 출퇴근만, 위치정보 미수집; `docs/QR-출퇴근-설계안-2026-11-16.md`)과 다르다. 구현 근거로 쓰기 전에 `docs/에이전트-제품결정-기술참고.md`와 현재 코드를 대조한다.
- 승인된 방향(B안 따뜻한 분위기 + A안 2×2 금액 배치)과 `DESIGN.md` 모바일 공통 규칙이 이 문서보다 우선한다. 토큰 값은 `constants/`의 현재 값을 기준으로 한다.
- 원본 보존용 자료다. 현재 상태에 맞추려고 본문을 고쳐 쓰지 말고, 새 결정은 `docs/` 관련 문서나 `docs/design/<주제>-<날짜>/design-state.md`에 기록한다.
- `support.js`는 생성물이므로 편집하지 않는다.

### Testing Requirements

- 실행 코드가 아니므로 별도 테스트는 없다. 여기서 가져온 패턴을 앱에 반영하면 빌드된 앱(시뮬레이터)에서 전후 화면을 확인한다.

### Common Patterns

- 화면 문서는 공통 스펙을 `patterns.md`·`design-tokens.md`에 두고 `screens.md`에는 화면 고유 사항만 적는 구조다.

## Dependencies

### Internal

- `../DESIGN.md`, `../constants/`, `../docs/전체화면-기능명세-2026-10-26.md`, `../.agents/skills/rattle-design-dialogue/SKILL.md`

## Manual Notes

사람이 직접 적는 메모 영역이다. 재생성 시 이 제목 아래 내용은 보존한다.

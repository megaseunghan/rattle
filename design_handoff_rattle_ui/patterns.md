# Common Patterns

모든 화면이 공유하는 구조입니다. 화면별 문서를 읽기 전에 이 파일을 먼저 컴포넌트로 만들어두면 개별 화면 구현이 조립 수준으로 끝납니다.

## 1. 화면 셸

```
[상단 앱바]        높이 자동, padding 20px 22px 0
[콘텐츠]          스크롤 영역, 좌우 22px
[하단 CTA] (폼)    padding 22px, 주요 버튼 1개
[하단 탭바] (메인)  5탭 + FAB
```

## 2. 상단 앱바 (AppBar)

두 가지 변형:

**(a) 메인 탭 화면** — 좌측에 메뉴(설정) 아이콘, 제목, 우측에 프로필/알림 아이콘. 뒤로가기 없음.
```
padding: 20px 22px 0
제목: 20px/700 black (홈은 22px/700 인사말 + 상단에 매장명 13px/500 gray400)
```

**(b) 하위 화면** — 좌측에 뒤로가기 chevron(20px, stroke #374151, `M15 6l-6 6 6 6`), 제목, 우측에 선택적 액션 텍스트(12px/700 primary).
```
gap: 12px, 제목은 flex:1
```

## 3. 하단 탭바 + FAB

5탭: **홈 | 재고 | 매입 | 근태 | 매출**. 활성 탭은 `primary`, 비활성은 `gray400`. 우측 하단에 **+ FAB**가 탭바 영역 안에 위치합니다(별도 떠 있는 버튼이 아님). FAB 탭 시 화면 26(빠른 추가 시트)가 바텀시트로 올라옵니다.

역할별 탭 구성:
- 사장님: 대시보드 중심 (00) — 매장 전환 + 알림 진입
- 직원: 5탭 전체
- 파트타이머: 홈 / 근태 / 청소 / 재고 (매입·매출·인건비 없음, 금액 정보 전부 숨김)

## 4. 요약 카드 (Summary Card)

`tinted` 배경, radius 16px, padding 16px. 구조:
```
[라벨 12px/500 gray500]        [증감 뱃지 11px/700 positive|negative]
[대표 금액 28~30px/700 Space Grotesk, letter-spacing -.5px]
──── 구분선 0.5px rgba(49,130,246,.18) ────
[하위 지표 3열 flex: 라벨 11px/400 → 값 14px/700 → 증감 11px/600]
```
증감 뱃지: `전월 대비 +18.6%` / `전년 대비 +9.8%` / 퍼센트포인트는 `+3.4%p`. 상승은 `positive`, 상승이 나쁜 지표(지출)는 `negative`.

## 5. 리스트 카드 (List Card)

`1px solid gray100` 테두리, radius 14px, padding 13~14px. 항목이 클릭 가능하면 우측에 chevron 또는 연필 아이콘. 여러 개일 때 `gap: 8px`.

선택 상태: 테두리 `1.5px primary` + 배경 `tinted`.

## 6. 섹션 헤더

```
padding: 20px 22px 6px
텍스트: 11px/600 gray400, letter-spacing .04em
우측 액션(선택): 12px/700 primary + " ›"
```

## 7. 그룹 카드 (Grouped Rows)

설정·명세서에서 사용. 바깥 `1px solid gray100` + radius 16px 컨테이너 안에 행을 넣고 행 사이는 `0.5px solid gray100`. 마지막 합계 행은 `gray50` 배경 + 하단 radius.

## 8. 폼 필드 (Field)

```
[라벨 12px/600 gray500, margin-bottom 6px]
[입력 박스: 1px solid gray200, radius 12px, padding 13px 14px, 14px/500]
[헬프 텍스트(선택) 11px/400 gray400, margin-top 6px]
```
- placeholder는 `gray400`, 입력값은 `black` + 600 weight
- 포커스 상태: 테두리 `primary`
- 우측 액션 있는 필드(주소 검색 등): 같은 박스 안에 `justify-content: space-between` + 아이콘
- 2분할 필드(전화번호+인증): `display:flex; gap:8px`, 버튼은 `flex:none`

## 9. 칩 행 (Chip Row)

`display:flex; gap:8px`. 카테고리·업종·정정항목 등 단일 선택. 선택 = `black` 배경 흰 텍스트, 미선택 = `gray200` 테두리.

세그먼트 탭(월별/연도별, 오픈/마감)은 다른 컴포넌트입니다 — `design-tokens.md`의 세그먼트 탭 스펙 참고.

## 10. 토글 행 (Toggle Row)

```
[제목 14px/600 black]
[설명 11px/400 gray400, margin-top 3px]        [토글 40×23]
```
설정·스케줄 화면에서 사용. 그룹 카드 안에 배치.

## 11. 주요 버튼 / 보조 버튼

- 주요: `primary` 배경, radius 12px, padding 15px 0, 15px/700 흰색, 전체 폭, 중앙 정렬
- 비활성: `gray200` 배경 + `gray500` 텍스트
- 보조(외곽선): `1px solid gray200`, `gray600` 텍스트, 14px/700
- 위험: `1.5px solid negative` 테두리 + `negative` 텍스트 (연동 해제, 퇴사 처리)
- 텍스트 버튼: 13px/600 `gray400`~`gray500` 중앙 정렬 (건너뛰기 등)
- pill 버튼(카드 내 CTA): `tinted` 배경 + `primary` 텍스트, radius 20px, padding 9px 18px

## 12. 바텀시트

배경 오버레이 `rgba(17,24,39,.45)`. 시트는 하단 고정, radius `24px 24px 0 0`, padding `10px 22px 24px`, 최상단에 핸들(36×4px, `gray200`, radius 2px, 하단 마진 16px), 그 아래 제목 17px/700.

사용처: 19 매장 선택, 26 빠른 추가.

## 13. 코치마크 오버레이

배경 `rgba(17,24,39,.6)`. 카드는 흰 배경, radius 18px, padding 20px, 그림자 `0 12px 30px rgba(0,0,0,.25)`. 하단에 `1 / 3` 진행 표시 + 건너뛰기 + 다음(pill, primary). 뒤 화면은 blur(1px) + opacity .5로 흐리게.

## 14. 빈 상태 (Empty State) — 화면 41

```
[아이콘 컨테이너 48×48, gray50 배경, radius 14px, 아이콘 22px gray400]
[제목 14px/700 black, margin-top 14px]
[설명 12px/500 gray500, margin-top 6px, line-height 1.5]
[CTA pill(선택) margin-top 14px]
```
카드 컨테이너: `1px solid gray100`, radius 16px, padding 28px 20px, 전체 중앙 정렬. CTA가 없는 경우(권한 없거나 사용자가 할 일이 없을 때)도 있습니다.

## 15. 뱃지

| 종류 | 스펙 |
| --- | --- |
| 상태(정상) | `positive` 텍스트 + `rgba(29,158,117,.1)` 배경, 11px/600, padding 4×9px, radius 20px |
| 상태(주의) | `negative` 텍스트 + `#FEE2E2` 배경 |
| 상태(중립/대기) | `gray500` 텍스트 + `gray100` 배경 |
| 고용형태 | `primary` 텍스트 + `tinted` 배경, 11px/600, padding 3×8px |
| 자동입력 | `positive` 텍스트 + `rgba(29,158,117,.1)` 배경, 10px/700, padding 2×7px |

## 16. 게이지 / 진행 바

트랙 `gray100`, radius 2~3px, 높이 4px(리스트) 또는 6px(요약). 채움색은 정상 `primary`, 미달 `negative`. 우측에 수치 텍스트 12px/600.

## 17. 카피 톤

- 존댓말 + "~예요/~해요" 체. ("등록된 재고가 없어요", "사장님 승인 후 확정돼요")
- 사용자 행동 유도는 명령형 대신 청유형. ("품목 추가하기", "확인하고 시작하기")
- 금액은 천단위 콤마 + "원" 접미사. 음수는 `−`(U+2212) 사용.
- 시각은 `HH:MM` 24시간제. 기간은 `09:00 - 18:00`.
- 상대 시간: `5분 전`, `1시간 전`, `어제`.

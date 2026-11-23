# 매입 OCR 제거와 매입 화면 재설계 — 확정 의도

- 확정일: 2026-11-21 · 확정자: 사용자(승한) · 인터뷰(interview-me) 결과 v2 + 커밋 push 포함
- 연결 결정: RATTLE-PURCHASE-OCR-20261121-v1 (Notion 「매입·증빙」 https://app.notion.com/p/41fef865970a81bbb7b6cb4638e4f49e)
- 대상: PR #136 `feature/evidence-attachments` (기준 커밋 fe82b25), 보존 브랜치 로컬 `archive/ocr-device` = fe82b25

## 목표 (Why)

- 영수증 OCR이 완벽하게 동작하지 않아 출시 범위에서 제외한다. PR #136에서 OCR 코드를 완전히 제거한다.
- 매입 화면의 배치·문구를 새 시안으로 다시 설계해 반영한다. 기존 매입 시안은 사용자가 아니라 오케스트레이션이 자동 생성한 것이라 기준으로 삼지 않는다.
- 1.1.0을 "증빙 여러 장 첨부 + 품목별/금액 매입 입력 + 매장폰 해제"로 정리한다.

## 범위

- 제거: `modules/rattle-text-recognition`(iOS Vision·Android ML Kit), `app/dev/ocr-lab.tsx`, `lib/ocr/*`, `lib/hooks/usePurchaseReceipt.ts`, `lib/components/PurchaseReceiptReview.tsx`, OCR 테스트·설정. 삭제 전 참조를 추적한다.
- 유지: `lib/components/PurchaseReceiptRows.tsx`·`lib/hooks/useReceiptIngredientSearch.ts`(품목별 입력), 카테고리 금액 입력, 증빙 첨부, 매장폰 해제. 기능·권한은 보존하고 배치·문구만 재설계한다.
- 대상 화면: 매입 등록(`app/purchases/new.tsx`), 매입 수정(`app/purchases/[id].tsx`), 그 안의 증빙 첨부·품목 입력 영역.
- 새 정책 결정: 신규 수기 매입은 품목별 입력과 금액 입력을 함께 제공한다. 기존 "신규 수기 매입의 '금액만' 입력 미제공"을 대체하며 AGENTS.md·`docs/에이전트-제품결정-기술참고.md`·Notion에 반영한다.
- 문서·기록(승인됨): PR #136 제목·본문 수정(OCR 절·검증 항목 제거), 저장소 문서의 OCR은 "제외(2026-11-21)"로 표시하고 과거 기록 보존, Notion 「매입·증빙」 결과 반영.
- 커밋 push(승인됨): `feature/evidence-attachments` 브랜치로 push해 PR #136을 갱신한다.

## 진행 순서

1. OCR 제거
2. 제거 후 화면을 시뮬레이터에서 캡처
3. 사용자와 시안을 처음부터 비교해 확정(`rattle-design-dialogue`·design-playbook, 해요체)
4. 확정된 시안을 앱에 반영
5. 검증(타입·Jest·SQL, iOS 시뮬레이터)
6. Android 에뮬레이터 확인(iOS 시뮬레이터 종료 후)
7. iOS 1.1.0 TestFlight 빌드·업로드
8. 아이폰 실기기 확인(2026-11-23 사용자 추가): 매입 등록·상세, 금액 바로 고치기, 밀어서 빼기·되돌리기, 키보드 위 빈 공간, 증빙 업로드·보기·삭제
9. 1.1.0 설치본이 확인되면 EAS `preview` 업데이트 발행

## 완료 기준

- 시안을 사용자가 확정
- `npm run typecheck`, Jest, `npm run test:sql` 통과
- iOS 시뮬레이터 재빌드 후 매입 등록·수정, 증빙 첨부·보기·삭제, 품목별/금액 입력의 전후 확인과 녹화
- iOS 시뮬레이터를 종료한 뒤 Android 에뮬레이터 빌드·ADB 설치·같은 항목 확인
- TestFlight용 iOS `production` 빌드와 App Store Connect 제출
- EAS `preview` 발행은 runtime 호환을 확인한 경우에만 하고, 맞지 않으면 발행하지 않고 보고한다

## 제약

- iOS 시뮬레이터와 Android 에뮬레이터를 동시에 띄우지 않는다. 로컬 빌드와 EAS 빌드도 동시에 돌리지 않는다(메모리 부족).
- 시안이 확정되기 전에는 화면 구현·빌드·제출로 넘어가지 않는다.
- 작업량이 크므로 OCR 제거와 화면 재설계는 세션을 나눌 수 있다.

## 하지 않을 것 (Out of scope)

- App Store 심사 제출, Google Play 업로드
- PR merge
- 원격 DB 변경
- `archive/ocr-device` 원격 push
- OCR 대체 기능 개발
- 기존 자동 생성 시안을 기준으로 삼는 것
- 매입 외 화면(비용 등) 재설계
- 이미 적용된 증빙 마이그레이션 수정

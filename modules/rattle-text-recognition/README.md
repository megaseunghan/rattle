# Rattle 기기 OCR · iPhone 측정 1단계

2026-11-19 요청: 사진별 기기 OCR와 규칙 파서 측정만 수행한다. 매입 등록, 서버 호출·저장, 사진 합치기는 없다. 원문 결과는 화면 메모리에 보관하며 명시적인 공유에서만 임시 JSON 파일을 만든다. 사진은 PHPicker가 제공한 원본을 임시 복사하고 측정·취소 후 삭제한다. 앱 강제 종료 시 임시 파일은 OS 임시 저장소에 남을 수 있으며 다음 실측 진입 때 24시간 지난 자기 UUID 파일만 회수한다.

## 빌드와 진입 (PL 담당)

- Expo Modules 자동 연결: 루트 package.json의 `expo.autolinking.nativeModulesDir=./modules`.
- 네이티브 모듈이므로 OTA만으로 추가되지 않는다. PL이 1.1.0 네이티브 빌드의 pod 연결과 설치를 확인한다. 이 작업자는 빌드·설치·EAS·원격 작업을 실행하지 않는다.
- 관리자 계정으로 매장을 선택한 뒤 `/dev/ocr-lab` (`rattle://dev/ocr-lab`) 직접 경로로 진입한다. 일반 메뉴에는 노출하지 않는다.
- `user + store + permissionsReady + canManageStore + devPreviewMode=self`를 화면에서 검사한다. 계정·매장·권한 revision 변경 시 본문을 재생성하고 이전 응답을 폐기한다.
- 사진 선택 → 최대 20장 순서 선택 → 장별 OCR → 합계 후보·선택 합계·품목 수·날짜·거래처 후보·원문/신뢰도·ms 확인 → 선택적으로 Mac 비교 키 입력 → JSON 공유 → AirDrop.
- Mac 비교 키는 원본 벤치마크 파일 이름의 확장자를 뺀 값이다. 선택 순서로 원본을 추정하지 않는다.
- 이전 빌드/웹에는 새 기기 빌드 안내를 표시한다. Android는 기존 expo-document-picker로 image/* 여러 파일을 캐시에 복사하고 공용 recognize에 넘기며 React Native Share로 JSON 텍스트를 공유한다. 시스템 파일 선택기에서 사진 공급자를 선택할 수 있으며 iOS 사진 선택 UX와 동일하지 않다. Android OCR 엔진 구현은 별도 담당이며 iPhone lab helper는 optional이다.

## 인식 계약과 비교 기준

공용 계약은 `index.ts`: `RattleTextRecognition.recognize(fileUri)`, `lines[{text,confidence:number|null,box:{x,y,w,h}}]`, `elapsedMs`, `engine=apple-vision|mlkit`, optional `metadata`. 좌표는 **EXIF를 반영한 정방향 이미지의 좌상단 원점**, 0~1 정규화다. ph://는 직접 받지 않으며 iOS PHPicker가 임시 file:// 원본으로 변환한다. 외부 URL은 받지 않는다.

iOS: VNRecognizeTextRequest, accurate, ko-KR/en-US, usesLanguageCorrection=true, 기본 OS revision, topCandidates(1). CGImageSource 원본 픽셀과 명시 EXIF 방향을 handler에 넘긴다. 리사이즈·JPEG 재압축·명암 보정은 없다. 한국어 지원 언어를 먼저 검사한다. monotonic elapsedMs는 이미지 decode·Vision 실행을 포함하고 SHA-256 계산·JS 파싱·picker·공유는 제외한다. metadata에는 revision/OS/방향/원본 크기/전처리 없음/원본 SHA-256을 넣는다.

Mac 실험도 accurate·ko-KR/en-US·언어보정을 사용했지만 URL handler와 macOS revision 3을 사용했다. iOS 모델·OS·하드웨어·방향 처리까지 같다는 보장은 없다. SHA-256 일치 여부와 revision/OS를 함께 확인한다.

## 파서

`lib/ocr/receiptParser.ts`: 원본 좌표 복사 → 필요 시 회전·표 헤더 기울기 기준 행 정렬 → 같은 높이 셀 묶기 → 날짜·거래처 후보 → 금액 의미 분리 → 합계 우선순위 → 인쇄된 공급가+VAT/매출−회수 관계 확인 → 품목 열 연결 → 검산·경고.

합계 후보의 점수는 금일합계를 우선하고 전일/이월/미수잔액을 후보에서 제외한다. 확정·제안은 아래 4회차 판정 계약을 적용한다. 다른 행의 숫자를 합계 라벨에 연결하지 않는다. 공급가·세액·상품·배송·할인·보증금·회수·잔액을 나눠 보관한다. 수량·단가·금액 누락은 null이며 산술 불일치를 자동 수정하지 않는다. 날짜는 후보만 보관하고 미노출 거래일을 현재 날짜로 채우지 않는다. 출처 이미지·좌표·원문·OCR confidence·규칙 confidence·observed/derived를 필드에 남긴다. parserConfidence는 규칙 우선순위이며 정확도 확률이 아니다.

Mac 실험의 구조를 이식하되 잔액 오연결을 막기 위해 행 연결을 좁혔다. 과거 Mac 파서와 완전히 동일한 품목별 전용 규칙이나 동일 정확도를 주장하지 않는다. 표 머리글·열이 없는 온라인 화면, 여러 줄 품목명, 잘린 원본은 추가 파서 보완 대상으로 남긴다. 여러 장 중복 제거·완전성·카테고리·매입 반영은 후속이다.

## 검증과 QA 인계

- 합성 fixture만 저장소 테스트에 사용한다. 실영수증 텍스트·사업자번호·원본 이미지는 저장소에 넣지 않는다.
- `npm run typecheck`
- `npx jest --runInBand --no-coverage --testPathIgnorePatterns='/node_modules/' '/__tests__/setup\.ts' '<rootDir>/supabase/functions/' '<rootDir>/dev/'`
- 대상 테스트: `__tests__/ocr` (파서·이전 빌드/URI 계약·권한·범위 변경·공유).
- Swift 구문 parse 및 autolinking 발견은 네이티브 컴파일/링크 성공이나 실기기 동작 증거가 아니다.
- 실제 빌드 QA: EXIF 1/3/6/8, HEIC/JPEG, 사진 선택 취소·20장·일부 인식 실패·중지·뒤로·권한 변경·공유 취소/AirDrop·키보드/스크롤/안전영역/큰 글자 확인.
- 닐슨 원칙 정적 적용: 1 진행 상태, 2 원·품목·후보 용어, 3 선택 취소/측정 중지/뒤로/결과 지우기, 4 공통 AppBar/오류/서체, 5 중복 실행 차단/관리 권한/원문 공유 확인, 6 후보·원문 병기, 7 다중 선택/장별 진행, 8 단순 목록, 9 장별 실패와 재선택, 10 사진별 측정/합계 후보 안내. 네이티브 사용성·접근성은 미검증이다.
- 초기 구현은 자체 검토였으며 이후 독립 검토 1회차의 OCR-R1~R6을 반영했다. 같은 검토자의 2회차와 실제 빌드 확인은 PL이 배정한다.

Mac 비교 스크립트는 저장소 밖 `/private/tmp/rattle-ocr-bench/compare-iphone.mjs`. 실행: `node /private/tmp/rattle-ocr-bench/compare-iphone.mjs <공유 JSON 경로> <Rattle 저장소 경로>`. Mac과 iPhone 원문을 동일한 현재 TS 파서에 넣고 truth/금액/품목/날짜/시간/원문 관측 일치를 비교한다. SHA-256이 다른 사진이나 키 미입력·중복은 controlledPairs 분모에서 제외한다. iPhone 실측 파일이 오기 전 인식 정확도를 산출하지 않는다.

공식 참고: [Expo local modules](https://docs.expo.dev/modules/get-started/), [Expo AsyncFunction](https://docs.expo.dev/modules/module-api/), [Apple Vision](https://developer.apple.com/documentation/vision/vnrecognizetextrequest), [PHPicker](https://developer.apple.com/documentation/photosui/phpickerviewcontroller).

## 이 작업자의 검증 기록 · 2026-11-19

작업 기준: `feature/evidence-attachments`, 시작 HEAD `6a1eb5e`; 역할 지침은 `44308ed`와 차이 없음. 코드 커밋: 계약 `1f6d23f`, iOS 모듈 `aae2a7d`, 파서 `7bd1208`, 실측 화면/Android 입출력 `d9ffcbf`, 원본 출처 좌표 보존 `a037877`. 독립 검토 없이 직접 구현·자체 검토했다.

- 최종 `npm run typecheck`: 통과. 로그 `/tmp/rattle-ocr-final-typecheck.log`.
- 최종 OCR 대상 Jest: 4 suites / 25 tests 통과, 기본 제한, 5.901초. 로그 `/tmp/rattle-ocr-target-jest-final.log`. 중간 실행에서 부하 중 화면 1건이 5초 timeout으로 실패했고 30초 제한 재실행 25개 통과 후 기본 제한으로도 25개 통과했다.
- 전체 Jest 첫 실행: 192 suites 중 185 통과/7 실패, 1579 tests 중 1561 통과/18 실패, 897.219초. 실패는 기존 화면의 5초 timeout·후속 화면 조회 실패였고 해당 7 suites를 30초 제한으로 재실행해 95 tests 모두 통과(12.122초). 로그 `/tmp/rattle-ocr-full-jest.log`, `/tmp/rattle-ocr-failed-suites-retry.log`.
- Expo autolinking `search` 및 `resolve --platform apple`: RattleTextRecognition pod·Swift 클래스 발견, `debugOnly=false`. 실제 pod 설치/링크 검증은 미실행.
- Swift `-frontend -parse`, podspec `ruby -c`, `git diff --check`, 비교 스크립트 `node --check`: 통과. 합성 입력을 사용한 비교 스크립트 smoke에서 Mac 결과 읽기·TS 파서 실행·해시 불일치 분모 제외를 확인했다. iPhone 측정 결과를 생성하거나 정확도를 측정한 것은 아니다.
- `node scripts/validate-screen-coverage.mjs`: 실패. 새 `app/dev/ocr-lab.tsx`가 명세 색인에 없고 기존 색인에도 현재 라우트와 차이가 있다. 명세/manifest는 허용 파일 밖이므로 PL에게 갱신을 넘긴다. 로그 `/tmp/rattle-ocr-screen-coverage.log`.
- iOS/Android 네이티브 빌드·설치·기기 조작·실제 사진 OCR·AirDrop/Android Share·EAS·원격 작업: 미실행, PL/QA 담당. 실기기 인식률과 1.1.0 포함 여부는 빌드 후 확인할 항목이다.
- 전체 Jest 최종 재실행(요청된 기본 명령): **194 suites / 1587 tests 전부 통과**, 412.33초, 종료 0. 로그 `/tmp/rattle-ocr-full-jest-final.log`. 같은 작업 공간의 다른 증빙 작업자 변경이 동시에 존재하는 로컬 기준이며, 원격이나 네이티브 런타임 검증을 뜻하지 않는다.


## 독립 검토 1회차 반영 · OCR-R1~R6 (2026-11-19)

시작 HEAD `e37153c`; 검토 결과 Critical/High 0, Medium 5, Low 1 전부 수용. 파서 수정 `5450bf1`/`a3035c3`, iOS 파일 회수·화면 수정 `1f9c9f5`, 새 사본 나이 기준 `326db88`, S53 문서 `bc31000`. 다른 증빙/출퇴근 작업자의 변경은 보존했다.

| 지적 | 반영과 검증 |
| --- | --- |
| OCR-R1 | 단가·현금받음·라벨 없는 숫자를 파생 합계 근거에서 제외. 같은 금액의 결제/합계 라벨 후보가 있을 때만 파생 후보를 추가하고, 계산과 명시 금액 충돌은 selectedTotal=null+경고. 제시된 두 오인식 fixture 회귀 통과 |
| OCR-R2 | 떨어진 마이너스·Unicode 대시/마이너스·괄호의 음수 보존; 중복/모순/불완전 부호는 미확정. 별도 OCR 부호 셀·반품 합계·음수 할인·일반 합계 라벨 회귀 통과 |
| OCR-R3 | amountStatus에 absent/observed/unreadable 구분. 배송/할인 읽기 실패는 goodsAdjustments와 비교 결과 null+경고, 라벨 부재와 확인된 0원은 별도 유지. 합성 회귀 통과 |
| OCR-R4 | 삭제를 두 번 시도해도 실패하면 ERR_OCR_CLEANUP 반환·실패 URL을 module 인스턴스에 보관. 화면 다시 정리에서 실패 URI/JSON 재시도. 재진입 시 실패 파일 즉시 재시도 및 24시간 지난 자기 UUID 이미지/JSON/과거 형식 JSON만 회수. 새 파일·타 파일 보존. 화면 Jest와 실제 macOS Swift helper fault injection 통과 |
| OCR-R5 | 인식 serial queue autoreleaseFrequency=.workItem, 해시 InputStream 64KB chunk. 여러 chunk digest를 one-shot 정답과 대조하는 Swift helper 통과. iOS 20장 연속 처리 RSS는 미측정 |
| OCR-R6 | 금액 라벨 문맥에서 작은 금액도 분리 추출: 0/50/500/999원·작은 음수 inline 합계 회귀 통과 |

새 라우트는 S53/E-S53으로 manifest·전체 화면 명세·E2E에 등록했다. S53 단일 경로/고유 ID/필수 필드 검사는 통과하며 전체 screen-coverage는 기존 S45 `app/attendance/review.tsx`, S46 `app/settings/attendance-devices.tsx`가 실제로 없어 실패한다. 기존 두 항목의 정책/색인 보정은 PM 범위로 남겼다.

검증: 초기 회귀 테스트는 18실패/17통과로 원래 결함을 재현했고 수정 후 parser 40개를 포함한 OCR 54개가 기본 timeout으로 통과(7.481초), 첫 전체 재검사 195 suites/1620 tests 통과(75.475초). 일반 합계의 작은 음수 보완 후 최종 전체 재검사 결과는 아래에 기록한다. Swift helper는 `cat modules/rattle-text-recognition/ios/OCRTemporaryFiles.swift __tests__/ocr/temporaryFiles.swift > /tmp/rattle-ocr-temporary-tests.swift` 후 `swift /tmp/rattle-ocr-temporary-tests.swift`로 실제 실행해 지속 삭제 실패·재시도·오래된 파일 소유 경계·스트리밍 SHA를 확인했다. iOS 모듈 전체는 Swift 구문 parse만 통과했고 iOS 앱 컴파일·기기 파일 보호·실제 사진/메모리·공유·설치는 미실행이다.

로그: `/tmp/rattle-ocr-r1-red.log`, `/tmp/rattle-ocr-r1-target-final.log`, `/tmp/rattle-ocr-r1-swift-tests.log`, `/tmp/rattle-ocr-r1-typecheck-final.log`, `/tmp/rattle-ocr-r1-full-jest-final.log`, `/tmp/rattle-ocr-r1-coverage.log`. 같은 검토자의 2회차 대상은 위 수정 커밋과 S53 문서 커밋이다.

최종 코드의 추가 경계 검증: 파서의 라벨/값을 분리해 한 셀의 복수 금액·금액 뒤 떨어진 부호를 한 값으로 확정하지 않는다. 원본 사진이 오래됐어도 새 사본을 즉시 회수하지 않도록 import 시 modificationDate를 현재 시각으로 설정했다. OCR 최종 4 suites/58 tests 통과(23.243초), 일반 합계/뒤 부호까지 포함한 전체 Jest 195 suites/1629 tests 통과(480.645초, 기본 timeout)이며 이 로그는 `/tmp/rattle-ocr-r1-full-jest-final.log`다. 같은 코드의 커밋 후 반복 전체 검사는 `/tmp/rattle-ocr-r1-full-jest-committed.log`에 별도로 남긴다. 타입 검사 로그는 오류 없이 종료했고 Swift 구문 parse와 helper 실제 실행도 통과했다. 실제 iOS 앱 빌드·설치·20장 메모리·파일 보호·공유는 PL/QA 검증 대기다.
커밋 후 최종 전체 Jest도 **195 suites/1632 tests 전부 통과**, 114.217초, 종료 0이다(`/tmp/rattle-ocr-r1-full-jest-committed.log`). 같은 실행 직전 최종 typecheck도 오류 없이 끝났다. 기본 timeout을 유지했으며 이 작업에서 timeout 설정을 늘리지 않았다. 다른 증빙 작업의 추가 테스트를 포함한 현재 공유 작업 공간 결과이며, 미실행인 iOS 네이티브 확인을 완료로 바꾸지 않는다.

## Android·Vision 분할 차이 보완 · 2026-11-19

작업 기준 `c7bf0d5`, 구현 `6d55cdd`. Android 에뮬레이터 ML Kit와 Mac Vision의 기존 raw 10쌍을 다시 파싱했다. 이번 작업은 새 OCR·기기/앱 조작·빌드·설치·원격 실행 없이 TS 파서와 합성 회귀만 변경했다.

- 여러 표 머리글이 한 관측에 합쳐진 경우 사전에 아는 열 이름만 분리하고, 여러 머리글 기준 기울기의 중앙값으로 행을 정렬한다. 분리 열의 내부 위치는 추정이며 출처 상자로 사용하지 않는다.
- 같은 행의 조각난 금융 라벨을 제한된 어휘·거리 안에서 결합한다. 라벨·금액의 행 간격 허용치를 무작정 넓히거나 잔액 행을 건너뛰어 숫자를 연결하지 않는다.
- 명시 금액 옆 `총`, 카드/일시불, 인수 표시만 분리해 읽는다. 단가·현금받음·무라벨 숫자는 파생 합계 근거로 만들지 않는다. 공급가액/세액 값이 있는 요약 행을 머리글로 건너뛰지 않는다.
- 하나의 원문 금액 셀 안에만 있는 공백 천단위는 명시 라벨 문맥에서 해석하고 `source=derived`, 낮은 규칙 confidence, 공백 확인 경고를 남긴다. 서로 다른 숫자 셀·복수 금액 식·단가/수량은 붙이지 않는다.
- 회수액이 미확인인데 매출총계만 있는 경우 결제 합계는 null로 남긴다. 품목 표 뒤의 합계/안내 영역은 품목에 넣지 않는다.
- 필드 rawText·sourceBoxes는 정규화 문자열·분리 머리글 상자가 아닌 원본 관측 텍스트·상자를 보관한다. 원문 관측 배열을 변경하지 않는 것도 raw 20개로 검사했다.

| 같은 10장 재평가 | Android 전 → 후 | Mac 전 → 후 |
| --- | --- | --- |
| 기준 합계와 선택 합계 일치 | 2/10 → 6/10 | 5/10 → 7/10 |
| 잘못된 합계 선택 | 0 → 0 | 1 → 0 |
| 합계 미확정 | 8 → 4 | 4 → 3 |

규칙 작성에 사용한 10장 재평가이므로 독립 검증/운영 정확도가 아니다. Android 1/7/10/12, Mac 1/7/10은 라벨 오독·누락/부분 원본/금액 열 의미 문제로 미확정이다. Android 11의 공백 천단위는 숫자를 새로 만든 것이 아니라 원문 숫자의 구분자 추정이며 사용자가 확인해야 한다. 품목 수는 후보 감지 수로, 전체 품목 정확도를 측정한 것이 아니다.

비교 코드는 저장소 밖 `/private/tmp/rattle-ocr-bench/android/evaluate-hardening.mjs`, 결과는 같은 폴더의 `parser-hardening-comparison.json`·`parser-hardening-report.md`. Git 기준 코드와 현재 코드를 동일 raw에 각각 실행하고 raw/파서 SHA-256을 남겼으며 기준 금액은 평가에서만 읽었다. 실제 영수증 원문·사업자번호·이미지는 저장소에 추가하지 않았다. 합성 Vision/ML Kit 분할 모양과 과거 R1~R6을 포함한 OCR 5 suites/72 tests는 기본 timeout으로 통과했다(`/tmp/rattle-ocr-engine-target.log`, 1.722초). 실제 iPhone/Android 새 실행·JS bridge·독립 검토와 다른 표본 검증은 후속이다.
최종 typecheck 통과, 전체 Jest 기본 timeout **196 suites/1646 tests 전부 통과**(45.777초, 종료 0). 로그 `/tmp/rattle-ocr-engine-typecheck.log`, `/tmp/rattle-ocr-engine-full-jest.log`; `git diff --check`와 외부 비교 스크립트 `node --check`도 통과했다.

## 독립 검토 2회차 반영 · OCR-R7/R8 (2026-11-19)

기준 `12674dc`(Android/Vision 보완 포함). R1~R6 해소 확인 후 새 Medium 2건을 수용했다.

- **OCR-R7 · `9712625`**: 공급가+VAT는 상품 소계, 최종 결제는 읽힌 배송·할인을 반영한 값으로 비교한다. 명시 상품 소계와 최종 결제가 각 범위에서 맞으면 충돌로 처리하지 않는다. 배송/할인 읽기 실패는 계산/비교를 null로 두고 명시 결제액과 경고를 보존하며, 조정 후에도 설명되지 않는 결제액·상품액 충돌은 계속 미확정이다. 직접 공급가+VAT/결제 비교는 조정이 0일 때만 판정한다. 배송·할인·복합 조정·소계/최종 병기·미확인 배송·진짜 충돌 회귀를 추가했다.
- **OCR-R8 · `ad025ca`**: cleanupPending await 이후 current()를 다시 확인한 다음에만 사진 선택기를 호출한다. 정리 대기 중 unmount·관리 권한 상실·측정 중지 각각에서 선택기/OCR 호출이 없는 것을 deferred Promise로 검증했다. S53 manifest 소스 해시도 갱신했다.

초기 회귀 실행은 2 suites/61 tests 중 8 실패로 두 결함을 재현했고, 수정 후 OCR **5 suites/81 tests 통과**(1.931초), typecheck 통과, 전체 기본 Jest **196 suites/1655 tests 전부 통과**(44.784초, 종료 0), diff 검사 통과. 로그는 `/tmp/rattle-ocr-r78-red.log`, `/tmp/rattle-ocr-r78-target.log`, `/tmp/rattle-ocr-r78-typecheck.log`, `/tmp/rattle-ocr-r78-full-jest.log`. 기존 10쌍 raw 재평가는 Android 6/10·Mac 7/10, 오선택 양쪽 0으로 유지했다(`/tmp/rattle-ocr-r78-evaluation.log`). 원문·이미지는 저장소에 넣지 않았다.

다음: 같은 검토자의 3회차(6d55cdd 엔진 보완 및 9712625/ad025ca 포함), 실제 기기 선택기/권한 전환/정리 대기 E2E. 기기·빌드·EAS·원격 실행은 이번 작업에서 하지 않았다. 기존 S45/S46 색인 보정은 PM 범위로 유지한다.

## 독립 검토 3회차 반영 · OCR-R9/R10 (2026-11-19)

아래 구현·검증 수치는 3회차 시점 기록이다. 확정/제안 판정은 뒤의 4회차 PL 결정이 우선하며, R1~R10 회귀표의 기대값은 현재 계약으로 정렬했다.

작업 `task_8893aebc5c6e`, 기준 `feature/evidence-attachments@d24144c`, 역할 기준 `main@44308ed`. 허용 범위는 `lib/ocr/**`, `__tests__/ocr/**`, 이 README 기록이며 구현·자체 검토만 수행했다. R1 → R7 → R9의 반복 원인은 공급가+VAT의 범위를 한쪽으로 고정한 것이고, R10은 OCR 관측과 표의 금액 셀을 동일시한 것이다.

**판정 원칙:** 파생 합계는 명시 합계 라벨과 독립된 계산 관계가 함께 맞을 때만 만든다. 공급가+VAT를 S, 상품액을 G, 배송−할인을 A라 하면, S=G일 때는 결제 G+A, S=G+A일 때는 배송/할인이 이미 포함된 결제 S다. 상품액이 없어서 포함 범위를 모르면 명시 결제가 S 또는 S+A와 일치하는 경우 관측 후보를 보존하고 범위 경고를 남긴다. 이때 파생 합계와 세금 검산 결과는 확정하지 않는다. 어느 관계로도 설명되지 않는 값이나 복수 명시 결제 충돌은 null이다. 관측 후보 보존은 회계상 확정·매입 저장을 의미하지 않는다.

공백 숫자는 원문 관측 전체가 금액 열 경계 안에 있거나 독립 검산이 뒷받침해야 천단위로 해석한다. 관측 하나라는 이유만으로 `2 500`을 2,500원으로 선택하지 않는다. 열 근거 없는 공백 공급가·매출액은 검산에 재사용하지 않아 자기 검증을 막는다. 허용한 공백 해석도 derived·낮은 confidence·원문 경고를 유지한다. 품목 검산을 먼저 읽도록 순서만 옮겼으며 품목 감지 규칙은 유지했다.

### R1~R10 합성 재현 → 기대값 회귀표

금액은 모두 원 단위의 가상 자료다. 파서 항목은 `__tests__/ocr/totalEvidence.test.ts`의 표 기반 fixture와 기존 `receiptParser.test.ts`·`engineSegmentation.test.ts`로 실행한다. 파일·생명주기 지적 R4/R5/R8은 해당 실제 경계의 합성 테스트로 연결하며 파서 금액 테스트로 대체하지 않는다.

| 지적 | 재현 입력 | 기대값·실행 fixture |
| --- | --- | --- |
| R1 | 매출 30,000 / 회수 5,000 / 결제 30,000 / 단가 25,000; 공급가 20,000 / VAT 2,000 / 총합계 30,000 / 현금받음 22,000 | 선택 null, 임의 숫자에서 파생 후보 생성 안 함; `totalEvidence`·`receiptParser` |
| R2 | `− 500`, 괄호 반품, 떨어진 부호 / `--5,000`·미완성 괄호 | 유효 음수 후보 보존, 검산 없는 단일 라벨은 suggested, 모순 부호는 두 값 null; `totalEvidence`·`receiptParser` |
| R3 | 상품 10,000 / 배송 `?` / 결제 10,000; 배송 라벨 부재·읽힌 0 | 명시 후보 보존, 미확인 배송은 selected/suggested/검산 null·경고, 부재/0과 구분; `totalEvidence`·`receiptParser` |
| R4 | 합성 URI/JSON 삭제가 계속 실패 → 재시도; 오래된 자기 파일과 새 파일·타 파일 혼재 | 실패 표시·실패 URI 재시도, 자기 오래된 파일만 삭제; `OcrLabScreen.test.tsx`·`temporaryFiles.swift` |
| R5 | 합성 데이터 3×64KB+7바이트 SHA-256 | 스트리밍 digest가 one-shot과 같음; `temporaryFiles.swift`. iOS 20장 RSS는 미검증 |
| R6 | 한 셀 `금일합계 0/50/500/999`, 작은 음수 | 0과 작은 금액도 후보 보존, 검산 없는 단일 라벨은 suggested; `totalEvidence`·`receiptParser` |
| R7 | 공급가 20,000 / VAT 2,000 / 상품 22,000 / 배송 3,000 / 결제 25,000 | 25,000, 배송을 반영한 관계 검산 일치; `totalEvidence`·`receiptParser` |
| R8 | 합성 cleanup deferred Promise 대기 중 unmount·권한 전환·측정 중지 후 resolve | 선택기·OCR 미호출; `OcrLabScreen.test.tsx`의 3개 표 기반 케이스 |
| R9 | 공급가 20,000 / VAT 2,000 / 상품 19,000 / 배송 3,000 / 결제 22,000; 상품 라벨 생략 | 상품액으로 범위가 구분되면 selected 22,000, 상품 라벨 생략은 후보만 보존하고 selected/suggested null·포함 범위 경고; `totalEvidence` |
| R10 | 합계 `2 500` 관측이 두 열을 걸침·수량 머리글 누락 / 근거 없는 `38 760` / 금액 열 내부 `2 500` / 공급가+VAT가 검산하는 `22 000` | 앞 세 경우 후보만 보존·selected/suggested null, 마지막만 selected 22,000 + derived·공백 경고; `totalEvidence` |

기존 OCR 81개 케이스를 유지하고 새 표·경계 회귀 26개를 추가했다. 기존 공백 `38 760` 성공 fixture에는 새 원칙에 필요한 금액 열 머리글을 추가했고, 머리글/독립 검산이 없는 원래 모양은 새 null 회귀로 고정했다. 새 회귀 최초 실행은 19개 중 8개 실패로 기존 결함을 재현했다(`/tmp/rattle-ocr-r910-red.log`).

### 검증과 남은 범위

- OCR 대상: `npx jest __tests__/ocr --runInBand --no-coverage --testPathIgnorePatterns='/node_modules/'` — **6 suites/107 tests 통과**, 1.945초. 로그 `/tmp/rattle-ocr-r910-target.log`.
- R4/R5: `cat modules/rattle-text-recognition/ios/OCRTemporaryFiles.swift __tests__/ocr/temporaryFiles.swift > /tmp/rattle-ocr-r910-temporary-tests.swift` 후 `swift /tmp/rattle-ocr-r910-temporary-tests.swift` — 지속 삭제 실패·재시도·소유 경계·스트리밍 SHA 실제 macOS 실행 통과. 로그 `/tmp/rattle-ocr-r910-swift.log`.
- 외부 비교: `node /private/tmp/rattle-ocr-bench/android/compare-r910.mjs` — d24144c와 최종 파서를 같은 Android/Mac raw 10쌍에 실행했다. 비교 파일 `/private/tmp/rattle-ocr-bench/android/parser-r910-comparison.json`에 파서·원문 SHA와 원문 불변성 검사를 남겼다. 기준 금액은 평가기에만 제공한다.

| 동일 10쌍, d24144c → 수정본 | Android | Mac |
| --- | --- | --- |
| 기준 합계 일치 | 6/10 → 6/10 | 7/10 → 7/10 |
| 잘못 선택한 합계 | 0 → 0 | 0 → 0 |
| 미확정 합계 | 4 → 4 | 3 → 3 |

규칙 작성에 사용한 같은 10장 재평가이며 독립 정확도나 운영 정확도가 아니다. 실영수증 원문·이미지·사업자정보는 저장소에 추가하지 않았다. 새 OCR·기기 조작·빌드·설치·EAS·원격 작업은 이 과제 범위 밖이며 실행하지 않았다. 같은 독립 검토자의 재검토와 실제 기기 검증은 PL이 이어서 배정한다.

최종 동일 코드 검증(2026-11-19 21:47~21:48 KST, macOS 로컬 Node/Jest, 기준 d24144c 위 이 과제의 미커밋 diff): `npm run typecheck` **통과**(`/tmp/rattle-ocr-r910-typecheck.log`), 전체 Jest 기본 timeout **197 suites/1681 tests 통과**(45.211초, 종료 0, `/tmp/rattle-ocr-r910-full-jest-final.log`). 전체 명령은 위 「검증과 QA 인계」의 worktree용 ignore override와 같다. `git diff --check`, 외부 `compare-r910.mjs`의 `node --check`도 통과했다. 구현자 자체 검토이며 독립 검토 통과를 주장하지 않는다.

## 독립 검토 4회차 반영 · R10 후속·최종 판정 분리 (2026-11-19)

작업 `task_1ad7e390037a`, 기준 `feature/evidence-attachments@67ccffc`, PL 결정 `msg_a3a7f3ae93e5`. 3회차는 계산으로 만든 후보만 제한했고, 금액 열 위치나 라벨 점수로 시작한 선택값에는 공통 검산이 빠져 있었다. 조기 선택·열 위치 예외·미확정 후보 삭제를 없애고 **모든 선택을 하나의 최종 판정 단계**로 모았다.

| 반환 필드 | 현재 의미 |
| --- | --- |
| `totalCandidates` | 읽힌 명시 후보를 근거·점수·원문 좌표와 함께 보존한다. 공백 해석이나 충돌 때문에 확정하지 못한 후보도 삭제하지 않는다. 확인된 계산 후보는 명시 라벨과 연결할 수 있을 때 추가한다 |
| `selectedTotal` | 명시 결제/합계 라벨 + 독립 검산 일치 + 해석 유일을 모두 만족한 확정값. 상품·배송·할인, 공급가·VAT의 범위, 매출−회수, 범위가 확인된 품목 합계로 검산한다 |
| `suggestedTotal` | 검산 재료가 전혀 없고 명시 라벨이 하나이며 공백 등 숫자 해석이 없는 관측값만 제안한다. `parserConfidence≤0.4`, 필드와 전체 경고에 `영수증 합계를 확인해주세요`를 남긴다. 확정값과 동시에 반환하지 않는다 |
| 두 값 모두 null | 검산 불일치·불완전 자료·배송 포함 범위 불명·복수 해석·명시 라벨 없는 숫자·독립 검산 없는 공백 후보. 후보는 계속 확인할 수 있다 |

`ParsedReceipt.version=1`에 `suggestedTotal`을 추가했다. 후보 점수는 표시 순서와 검산을 통과한 같은 금액의 출처 선택에만 쓰며, 점수가 높거나 금액 열에 있다는 이유로 확정하지 않는다. 공백 숫자가 공급가/VAT/매출 검산에 재사용되어 스스로를 뒷받침하지 않도록 한다. 읽지 못한 추가 합계 라벨과 금액이 누락된 품목도 불완전 자료로 다룬다. 전일잔액만 있고 금일 검산이 없으면 단일 합계도 제안하지 않는다. 머리글 없는 품목 우측 숫자나 공급가액 열만으로 최종 결제액을 확정하지 않는다.

명시 주문금액은 상품·배송·할인 검산이 일치할 때 확정할 수 있지만 단독 제안으로 올리지 않는다. 일반 `합계`가 전일잔액+검산된 금일액과 정확히 맞으면 누적 범위를 구분할 수 있으며, 명시 `결제금액`의 불일치는 이 관계로 우회하지 않는다. 두 관계의 일치·불일치를 모두 합성 회귀로 검사했다.

이번 핵심 재현/기대값은 다음과 같다(원 단위, 가상 자료).

| 입력 | selected | suggested |
| --- | ---: | ---: |
| 한 줄 `결제금액 99,000`, 검산 재료 없음 | null | 99,000 + 확인 경고 |
| 수량 머리글 누락 또는 금액 열 안의 합계 `2 500`, 검산 없음 | null | null |
| 상품 10,000 + 배송 3,000 / 결제 20,000 | null | null |
| 상품 10,000 + 배송 3,000 / 결제 13,000 | 13,000 | null |
| 공급가 20,000 + VAT 2,000 + 배송 3,000 / 결제 22,000, 상품액 없음 | null | null |
| 공급가 20,000 + VAT 2,000 / 명시 결제 `22 000` | 22,000 + 원문 확인 경고 | null |
| 라벨 없이 금액 열·공백 숫자만 있음 | null | null |

위 R1~R10 표를 유지하면서 `totalEvidence.test.ts`에 최종 판정·후보 보존·머리글 누락·누적 범위·검산 불일치 등의 20개 회귀를 추가했다. 최초 새 계약 실행은 36개 중 16개 실패로 이전 동작을 재현했다(`/tmp/rattle-ocr-r4-red.log`). 기존 standalone 금액 테스트는 단순히 삭제하지 않고 후보 또는 suggested 기대값으로 정렬했다. 화면 테스트의 정상 합계 fixture에는 별도 상품액을 추가해 실제 확정 조건을 갖췄다. 화면 코드와 UI 상태는 변경하지 않았다.

화면 후속 계약: `selectedTotal`은 확인된 값으로, `suggestedTotal`은 미확인 표시와 함께 입력 초깃값으로 사용할 수 있다. 현재 `/dev/ocr-lab`은 selected만 표시하고 JSON 공유에는 새 필드가 포함된다. 제안값 미리 채움·미확인 표시·사용자 확인 후 확정은 **다음 앱 구현 범위이며 이번에 구현/검증하지 않았다**.

### 같은 raw 10쌍 재평가

외부 실행 `node /private/tmp/rattle-ocr-bench/android/compare-r4.mjs`, 결과 `/private/tmp/rattle-ocr-bench/android/parser-r4-comparison.json`, 로그 `/tmp/rattle-ocr-r4-comparison.log`. 67ccffc와 수정본을 같은 raw에 실행해 파서·raw SHA-256과 원문 불변성을 확인했다. 기준 금액은 평가기에만 제공했고 원문·사진·사업자정보는 저장소에 넣지 않았다.

| 상태 / 각 엔진 10장 | Android 이전 → 현재 | Mac 이전 → 현재 |
| --- | --- | --- |
| selected, 모두 기준 금액 일치 | 6 → 3 | 7 → 4 |
| suggested | 0 → 0 | 0 → 0 |
| 두 값 모두 null | 4 → 7 | 3 → 6 |
| 잘못된 selected / suggested | 0 / 0 → 0 / 0 | 0 / 0 → 0 / 0 |

이전 selected는 옛 계약의 선택값이며 현재 확정값과 같은 의미가 아니다. 새 원칙에서 독립 검산·완전성·유일성을 충족하지 못한 자료를 미확정으로 내렸다. 이 10쌍은 규칙 작성에 사용한 개발 표본이며 독립 검증이나 운영 정확도가 아니다. 검산 없는 단일 결제 화면 제안은 합성 회귀로 검증했고, 이번 raw에는 그 조건을 만족하는 자료가 없었다.

### 4회차 검증 기록

환경은 macOS 로컬 Node/Jest, 기준 67ccffc 위 이 과제의 코드·합성 fixture diff다. 실제 iPhone/Android 새 실행·네이티브 빌드·설치·EAS·DB/원격 변경은 하지 않았다. 구현자 자체 검토이며 독립 재검토는 PL이 같은 검토자에게 배정한다.

- OCR 대상 `npx jest __tests__/ocr --runInBand --no-coverage --testPathIgnorePatterns='/node_modules/'`: **6 suites/127 tests 통과**, 1.896초(`/tmp/rattle-ocr-r4-target.log`). 기존 107개를 현재 계약으로 정렬하고 20개를 추가했다.
- `npm run typecheck`: **통과**(`/tmp/rattle-ocr-r4-typecheck-final.log`).
- 기존 R4/R5 Swift helper를 합쳐 `swift /tmp/rattle-ocr-r4-temporary-tests.swift` 실행: **통과**, 지속 삭제 실패·재시도·소유 경계·스트리밍 SHA 확인(`/tmp/rattle-ocr-r4-swift.log`).
- `git diff --check`, 외부 비교 스크립트 `node --check`: **통과**. 비교 결과의 파서 SHA가 최종 소스와 같은지 재확인했다.
- 최종 전체 Jest: `npx jest --runInBand --no-coverage --testPathIgnorePatterns='/node_modules/' '/__tests__/setup\.ts' '<rootDir>/supabase/functions/' '<rootDir>/dev/'` — **197 suites/1701 tests 통과**, 기본 timeout, 46.287초, 종료 0(`/tmp/rattle-ocr-r4-full-jest-final.log`). 2026-11-19 22:06 KST 완료. 실행 전후 파서·핵심 회귀 소스의 SHA가 같음을 `/tmp/rattle-ocr-r4-final-source.sha256`으로 대조했다.

## 독립 검토 5회차 반영 · OCR-R11 금액 토큰 독립성 (2026-11-19)

작업 `task_0c2be31a3ecf`, 기준 `feature/evidence-attachments@51421c0`, 지적 `msg_7cd20e03274e`의 R11. 4회차 판정의 수치 일치만으로는 같은 숫자를 상품액과 결제액에 재사용한 자기 검산을 구분하지 못했다. 숫자의 값이나 관측 전체가 같은지를 비교하는 대신 **각 금액이 실제 소비한 원본 숫자 구간**을 추적한다.

금액 필드와 합계 후보의 `moneyTokens`에는 `{ observationId, start, end }`를 보관한다. `observationId`는 해당 `sourceImageId`의 원본 OCR `lines` 배열에서 0부터 시작하는 관측 인덱스다. `start`·`end`는 그 관측의 원문 `text`에서 숫자 부분을 가리키는 UTF-16 위치이며 end는 포함하지 않는다. 전각 숫자·쉼표를 정규화하거나 앞에 이모지가 있어도 `text.slice(start, end)`는 원문의 실제 숫자 구간을 반환한다. 원문 텍스트·관측 순서·좌표는 바꾸지 않는다.

- 각 검산식은 피연산자별 토큰 그룹을 갖는다. 피연산자끼리 또는 후보 합계와 토큰 구간이 겹치면 독립 검산으로 인정하지 않는다. 토큰 출처가 비어 있어도 인정하지 않는다. 공유 입력의 후보는 보존하고 selected/suggested 및 검산 일치 판정은 null로 둔다.
- 관측 ID가 같아도 숫자 위치가 다르면 독립 근거가 될 수 있다. 같은 행의 별도 금액 관측, 같은 관측 안의 두 숫자를 모두 지원한다. 합계 후보마다 유효한 독립 검산을 찾아 높은 점수의 공유 후보가 별도 정상 후보를 막지 않게 한다.
- 합쳐진 관측에서는 라벨별로 실제 소비한 숫자 구간을 연결한다. 반복·충돌하는 합계 라벨을 모두 후보에 남기며, 반복 상품액의 불일치도 숨기지 않는다. 구분자 처리가 단독 금액 뒤의 미완성 식을 유효한 제안값으로 만들지 않도록 검사했다.
- 전일잔액과 금일액으로 일반 누적 합계의 범위를 설명하는 관계도 토큰 독립성을 확인한다. 파생 합계의 토큰은 검산 피연산자와 대응하는 명시 합계의 실제 구간을 함께 보관한다.

### R11 합성 재현·대조군

새 `__tests__/ocr/moneyEvidence.test.ts`의 20개 회귀로 아래 입력과 토큰 ID·위치, 원문 불변성까지 확인했다. 기존 R1~R10 회귀·표는 유지했다.

| 가상 입력 / 원 단위 | 기대값 |
| --- | --- |
| 한 관측 `상품금액/결제금액 10,000` | 동일 토큰 재사용, 후보만 보존, selected/suggested null |
| 라벨 관측 `상품금액 / 결제금액` + 숫자 관측 `10,000` 하나 | 동일 토큰 재사용, 후보만 보존, selected/suggested null |
| 별도 행의 `상품금액 10,000`과 `결제금액 10,000` | 서로 다른 관측 ID, selected 10,000 |
| 같은 행의 상품·숫자·결제·숫자 네 관측 | 서로 다른 숫자 ID, selected 10,000 |
| 한 관측 `상품금액 10,000 / 결제금액 10,000` | 같은 ID의 다른 숫자 위치, selected 10,000 |
| 한 관측의 공급가 20,000 / VAT 2,000 / 결제 22,000 | 서로 다른 숫자 위치, selected 22,000 |
| 공급가/VAT가 숫자 5,000 하나를 공유, 결제 10,000 | 피연산자 공유 차단, 두 값 null |
| 배송/할인이 숫자 5,000 하나를 공유 | 피연산자 공유 차단, 두 값 null |
| 0원 상품과 배송/결제가 숫자 3,000 하나를 공유 | 0원도 누락으로 처리하지 않고 공유 토큰 차단, 두 값 null |
| 한 관측의 다른 결제액·반복 상품액 또는 검산 없는 반복 합계 | 충돌·복수 라벨을 보존, 두 값 null |

최초 8개 핵심 재현 실행에서 6개 실패로 공유 토큰 오확정과 한 관측의 독립 숫자 미지원을 확인했다(`/tmp/rattle-ocr-r11-red.log`). 수정 후 OCR 대상은 **7 suites/147 tests 통과**, 기본 timeout, 1.982초(`/tmp/rattle-ocr-r11-target.log`). 기존 127개에 R11 20개를 추가했다.

외부 `node /private/tmp/rattle-ocr-bench/android/compare-r11.mjs`로 같은 Android/Mac raw 10쌍을 51421c0와 수정본에 각각 실행했다. 결과 `/private/tmp/rattle-ocr-bench/android/parser-r11-comparison.json`, 로그 `/tmp/rattle-ocr-r11-comparison.log`에 파서·원문 SHA와 원문 불변성을 남겼다. selected/suggested/null은 **Android 3/0/7, Mac 4/0/6으로 유지**, 오선택 양쪽 0이다. 같은 개발 표본 재평가이며 독립·운영 정확도가 아니다. 영수증 원문·사진·사업자정보는 저장소에 넣지 않았다.

구현자 자체 검토다. 같은 검토자의 독립 재검토와 제안값의 화면 연결은 PL 후속이며, 이번에 화면·네이티브·기기 조작·빌드·설치·EAS·원격 변경은 하지 않았다.

최종 검증(2026-11-19 22:24 KST 확인, macOS 로컬, 기준 51421c0 위 이 과제의 미커밋 코드·합성 테스트): `npm run typecheck` **통과**(`/tmp/rattle-ocr-r11-typecheck-final.log`), 전체 `npx jest --runInBand --no-coverage --testPathIgnorePatterns='/node_modules/' '/__tests__/setup\.ts' '<rootDir>/supabase/functions/' '<rootDir>/dev/'` **198 suites/1721 tests 통과**, 기본 timeout, 45.944초, 종료 0(`/tmp/rattle-ocr-r11-full-jest-final.log`). 실행 전후 파서·R11 회귀 소스의 SHA가 같음을 `/tmp/rattle-ocr-r11-final-source.sha256`으로 대조했고, 외부 비교 결과의 파서 SHA도 최종 소스와 일치했다. `git diff --check`와 외부 스크립트 `node --check`도 통과했다.

## 독립 검토 6회차 반영 · OCR-R12 계산·보조 제약 분리 (2026-11-19)

작업 `task_09c7c469c8ee`, 기준 `feature/evidence-attachments@f1272f7`, PL 결정 `msg_1f16de53e2e0`. R11은 해소됐으나 공급가·VAT 식에 보조 상품액까지 계산 피연산자로 넣어, 정상적인 독립 식도 차단했다. 원본 관측 0의 공급가 20,000 + 관측 1의 VAT 2,000 = 관측 2의 결제 22,000이면 독립 검산이다. 관측 2가 상품액 라벨도 공유한다는 이유로 이 식을 무효화하지 않는다.

`Equation`의 실제 `operands`와 보조 일치 `constraints`를 분리했다. 상품액이 공급가+VAT와 같은 경우 계산은 공급가+VAT+배송−할인이고, 상품액은 세금 소계와의 일치 제약이다. 공급가+VAT가 상품+배송−할인과 같은 경우 계산은 공급가+VAT이며, 상품·배송·할인은 이미 반영됐다는 별도 일치 제약이다. 보조 제약이 불일치하면 계속 차단하고, 실제 피연산자끼리 또는 합계와 토큰이 겹치는 R11 차단도 유지했다. 보조 상품액이 공유돼도 독립 공급가·VAT 식이 있으면 selected를 확정할 수 있다. 이때 상품 검산 표시는 숫자의 일치 제약이며 독립 근거는 공급가·VAT다.

`moneyEvidence.test.ts`에 R12 7개 회귀를 추가했다. 기존 R1~R11과 정상·오확정 차단 기대값은 변경하지 않았다.

| 가상 입력 / 원 단위 | 기대값 |
| --- | --- |
| 공급가 20,000 / VAT 2,000 / 상품액·결제액 공유 22,000 | selected 22,000, suggested null, 실제 피연산자+합계의 토큰 3개만 보존 |
| 한 관측에 공급가·VAT의 별도 숫자, 다른 관측에 공유 상품·결제 | selected 22,000, 서로 다른 토큰 위치 유지 |
| 상품·결제 라벨 관측과 숫자 관측이 분리 | selected 22,000, 공유 상품액은 보조 제약으로만 사용 |
| 상품액·결제액 공유 23,000, 독립 공급가+VAT는 22,000 | 보조 제약 불일치, selected/suggested null |
| 공급가·VAT가 숫자 11,000 하나를 공유, 상품·결제 22,000 | 실제 피연산자 재사용, R11 차단 유지·두 값 null |
| 독립 세금 식 없이 상품·결제만 공유 22,000 | R11 차단 유지·두 값 null |
| 공급가·VAT·공유 상품/결제 라벨이 모두 한 관측에 합쳐진 형태 | 현재 별칭 연결이 불완전하므로 두 값 null, 아래 backlog로 이관 |

처음 5개 실행에서 2개가 실패했다(`/tmp/rattle-ocr-r12-red.log`). 요청된 R12의 독립 식은 복구했고, 한 관측의 복합 별칭 연결 실패는 안전한 null임을 확인해 종료 기준에 따라 확장 수정하지 않았다. 최종 OCR 대상 **7 suites/154 tests 통과**, 기본 timeout, 2.043초(`/tmp/rattle-ocr-r12-target.log`).

외부 `compare-r12.mjs`로 f1272f7과 최종 소스를 같은 raw 10쌍에 재평가했다. 결과 `/private/tmp/rattle-ocr-bench/android/parser-r12-comparison.json`, 로그 `/tmp/rattle-ocr-r12-comparison.log`에 파서·raw SHA와 불변성 검사를 남겼다. selected/suggested/null **Android 3/0/7·Mac 4/0/6, 오선택 양쪽 0 유지**다. 원문은 저장소 밖에 유지했고 이 개발 표본 재평가를 독립 holdout 정확도로 보지 않는다.

### PL 종료 기준과 보류 backlog

**이번 R12 이후 파서 검토의 차단 대상은 잘못된 금액을 selected 또는 suggested로 확정하는 경로다.** 확정하지 못하고 null로 남기는 안전한 누락은 차단 지적을 추가하거나 이번 범위를 확장해 고치지 않는다. 아래 항목은 새로운 holdout·실기기 자료를 모은 후 별도 과제에서 조정한다.

| backlog | 현재 근거·상태 | 다음 판단 조건 |
| --- | --- | --- |
| 한 관측 `공급가액 20,000 / VAT 2,000 / 상품금액/결제금액 22,000`의 공유 별칭 연결 | 상품액 구간을 읽지 못해 null, R12 합성 회귀에 안전한 미확정으로 고정 | 같은 형태의 실제 holdout·기기 OCR 원문에서 연결 유일성과 오확정 위험 확인 |
| 공통 불완전 자료·공유 근거 차단으로 남는 미확정 | 기존 raw의 Android 7장·Mac 6장은 두 값 null로 유지. 현재 규칙의 재조정을 이 개발 표본에 맞추지 않음 | 별도 수집한 holdout 및 실기기 결과를 기준으로 원인별 재현·오확정/누락 분리 평가 |

구현자 자체 검토이며, 이후 검토에서도 안전한 누락을 완료 차단으로 취급하지 않는다. 화면·제안값 입력 연결·실기기 수집·빌드·설치·EAS·원격 변경은 이번 범위에서 실행하지 않았다.

최종 검증(2026-11-19, macOS 로컬, 기준 f1272f7 위 이 과제의 미커밋 코드·합성 회귀): `npm run typecheck` **통과**(`/tmp/rattle-ocr-r12-typecheck.log`), 전체 `npx jest --runInBand --no-coverage --testPathIgnorePatterns='/node_modules/' '/__tests__/setup\.ts' '<rootDir>/supabase/functions/' '<rootDir>/dev/'` **198 suites/1728 tests 통과**, 기본 timeout, 45.990초, 종료 0(`/tmp/rattle-ocr-r12-full-jest.log`). 실행 전후 파서·회귀 소스 SHA가 같음을 `/tmp/rattle-ocr-r12-final-source.sha256`으로 확인했고 외부 비교의 파서 SHA도 최종 코드와 일치했다. `git diff --check`와 외부 비교 스크립트 `node --check` 통과.

## iPhone 신규 10장 후속 · 2026-11-20

작업 `task_db93d61f7d57`, 기준 `feature/evidence-attachments@ae73f68`. 사용자가 처음 제시한 iPhone 실기기 OCR 10장의 정답·범위를 확인한 뒤, 일반화 가능한 문서 구조만 보완했다. 원본은 `/private/tmp/rattle-ocr-bench/iphone/iphone-new-20261120.json`에 유지하고 저장소에는 가상 금액·문구·좌표의 합성 fixture만 추가했다. 이 10장은 이제 규칙 작성에 사용한 개발 표본이며 독립 holdout으로 재사용하지 않는다.

### 판정 보완

- **세금과 매출합계:** 독립된 공급가+VAT가 명시 매출합계와 맞으면, 빈 보증금·회수 부가란과 여러 금액 열을 가진 일반 합계 행 때문에 판매액 검산을 차단하지 않는다. 표 머리글은 미확인 금액란과 구분한다. 확인된 비영(非零) 회수액, 다른 명시 결제의 불일치·읽기 실패, 공급가/VAT의 토큰 공유·불완전 값은 계속 차단한다. 이 판정은 명시 판매액이며 보증금·회수의 회계 반영 기준은 별도 경고로 남긴다.
- **금일합계와 누적:** 전일잔액+금일합계가 일반 합계와 일치하고 세 숫자가 독립된 토큰이면 일반 합계는 누적 범위로 분류해 경쟁에서 제외한다. 모든 후보는 보존한다. 품목 합이 맞으면 selected, 전체 품목 검산이 완성되지 않았으면 단일 명시 금일합계를 낮은 신뢰도의 suggested로 제공한다. 확인된 계산 불일치는 제안으로 우회하지 않는다. 이 금일합계 제안 규칙이 이전의 ‘검산 재료가 전혀 없을 때만 제안’보다 최신이다.
- **분리된 결제 셀:** 같은 행의 결제 라벨과 다른 x 위치의 금액을 연결하고, 사이의 고정 결제수단 문구 `쿠페이 머니`를 분리한다. 배송 묶음 신호 `배송 N건 중`이 있으면 `주문 전체 결제금액이에요`를 필드·전체 경고에 남긴다.
- **비정상 천단위:** 잘못된 쉼표 그룹은 숫자 순서를 보존한 낮은 신뢰도 후보(`source=derived`, `parserConfidence≤0.2`)로만 남긴다. 독립 계산값과 우연히 같아도 selected/suggested로 승격하지 않는다. 숫자 순서 오독을 자동 교정하지 않으며 상품가·수량을 합계로 사용하지 않는다.

기존 R1~R12 오확정 차단은 유지했다. 기존 엔진 분할 테스트 2개는 검산 없는 단일 금일합계의 새 제안 규칙에 맞춰 selected=null·suggested=인쇄 금액으로 정렬했다. 새 `deviceReceiptPatterns.test.ts`의 **13개 합성 회귀**는 머리글·다중 금액 합계 행·빈 부가란·독립 세금 검산·회수 비영값·읽기 실패한 다른 결제·금일/누적·불완전 품목·결제수단 셀·주문 범위·비정상 그룹·상품가 오연결 차단을 검사한다. 최초 10개 실행에서 6개 실패로 기존 동작을 재현했다(`/tmp/rattle-ocr-device-red.log`).

### 안내 코드 계약

`ParsedReceipt.guidanceCodes`를 추가했으며 사람이 읽을 메시지는 기존 `warnings`에도 함께 반환한다. 화면 코드는 수정하지 않았고 새 코드의 네이티브 표시 검증은 하지 않았다.

| 코드 | 반환 조건·메시지 |
| --- | --- |
| `PAYMENT_SCREEN_REQUIRED` | 비어 있지 않은 원문에서 명시 합계 라벨이 없음: `결제 화면을 함께 올려주세요` |
| `WHOLE_ORDER_TOTAL` | 배송 묶음 신호가 있는 화면에서 결제액을 제안/확정: `주문 전체 결제금액이에요` |
| `INVALID_THOUSANDS_GROUPING` | 잘못된 천단위 그룹: `금액의 천단위 구분이 이상해요. 원문을 확인해 주세요`, 낮은 신뢰도 후보만 보존 |

### 원문 재평가

사용자가 제공한 새 iPhone raw는 기존 `run-current.mjs`로 변경 전후 재파싱했고, 외부 평가기 `iphone/compare-device20261120.mjs`에서 사용자 정답과 selected/suggested/null·안내 코드를 대조했다. 결과 `/private/tmp/rattle-ocr-bench/iphone/device20261120-comparison.json`, 로그 `/tmp/rattle-ocr-device-new-evaluation.log`. 사용자 정답은 평가기에만 들어가며 파서에는 전달하지 않는다. 파서·입력 SHA-256과 원문 불변성을 기록했다.

| 표본 / 장수 | ae73f68 selected/suggested/null | 수정본 selected/suggested/null | 잘못된 금액 승격 |
| --- | --- | --- | --- |
| 새 iPhone 10장 | 0 / 0 / 10 | **1 / 2 / 7** | **0 → 0** |
| 기존 Android 10장 | 3 / 0 / 7 | **3 / 0 / 7** | **0 → 0** |
| 기존 Mac 10장 | 4 / 0 / 6 | **4 / 0 / 6** | **0 → 0** |

새 표본에서 독립 세금 검산이 되는 판매액 1장은 확정했고, 금일액과 주문 전체 결제액 2장은 미확인 제안으로 복구했다. 잘못 읽힌 쉼표 그룹 1장과 합계 라벨 없는 주문 목록 6장은 두 값 모두 null을 유지했다. 6장 모두 `PAYMENT_SCREEN_REQUIRED`, 정상 주문 결제 화면은 `WHOLE_ORDER_TOTAL`, 잘못된 그룹 화면은 `INVALID_THOUSANDS_GROUPING`을 반환했다. 이는 사용자 확인 정답에 대한 같은 개발 표본의 재평가이며 운영 정확도나 새로운 holdout 성능이 아니다.

기존 10쌍 평가기는 저장소 밖 `android/compare-device20261120.mjs`, 결과 `android/parser-device20261120-comparison.json`, 로그 `/tmp/rattle-ocr-device-old-pairs.log`다. 원문·이미지·상품별 거래내역·사업자정보는 저장소에 넣지 않았다.

### 검증 범위

OCR 대상 **8 suites/167 tests 통과**, 기본 timeout, 2.507초(`/tmp/rattle-ocr-device-target.log`). 기존 154개와 새 13개를 포함한다. 수정본에서 새 OCR·기기 조작·네이티브 빌드·설치·EAS·DB/원격 변경은 하지 않았다. 기존 실제 기기의 raw를 현재 TS 파서에 재실행한 결과와 수정본 앱의 새 기기 실행을 구분한다.

구현자 자체 검토이며 같은 검토자의 후속 검토는 PL이 이어서 배정한다. 차단 대상은 selected/suggested의 잘못된 금액 승격 경로이며, 이번 범위 밖의 안전한 미확정은 기존 backlog에 유지한다.

최종 검증(2026-11-20, macOS 로컬, 기준 ae73f68 위 이 과제의 미커밋 코드·합성 fixture): `npm run typecheck` **통과**(`/tmp/rattle-ocr-device-typecheck-final.log`), 전체 `npx jest --runInBand --no-coverage --testPathIgnorePatterns='/node_modules/' '/__tests__/setup\.ts' '<rootDir>/supabase/functions/' '<rootDir>/dev/'` **199 suites/1741 tests 통과**, 기본 timeout, 50.675초, 종료 0(`/tmp/rattle-ocr-device-full-jest.log`). 실행 전후 소스 SHA는 `/tmp/rattle-ocr-device-final-source.sha256`과 대조해 일치했다. 새 iPhone 평가·기존 10쌍 평가의 파서 SHA도 최종 소스와 일치했고 `git diff --check`·두 외부 평가기 `node --check` 통과.

## 독립 검토 8회차 반영 · OCR-R13 회수 관측과 저신뢰 검산 (2026-11-20)

작업 `task_f6b5d085cbcb`, 기준 `feature/evidence-attachments@265f472`. `amountStatus=unreadable`은 빈 라벨뿐 아니라 금액 충돌·숫자 오독도 포함한다. 이 상태만 보고 회수 부가란을 면제하던 경로를 수정했다. 기존 세금·매출합계 규칙에서 ‘빈 회수란’은 **실제 값 영역에 내용이 한 번도 없었던 경우**를 뜻하며, 숫자가 있었던 미확인 회수란까지 포함하지 않는다.

금액을 해석하는 시점에 값 영역의 내용 존재를 별도로 누적한다. 비영 회수 뒤 빈 중복 라벨, 서로 다른 회수 금액, `3,O00` 같은 오독은 이후 상태가 unreadable로 합쳐져도 빈 부가란이 되지 않는다. 정상 0원 관측과 실제 빈 라벨만 있는 경우를 구분하고, 빈 라벨을 앞뒤에 추가해 비영 관측을 면제할 수 없게 했다. 공개 amountStatus 계약과 후보 보존은 유지했다. 보수적으로 null이 되는 추가 형태는 기존 backlog 기준을 따른다.

또한 비정상 쉼표 그룹의 매출합계·매출총계는 회수 차감 식의 피연산자와 소계 비교 근거에서 제외했다. 원래 숫자 순서를 유지한 낮은 신뢰도 후보와 안내 코드는 남긴다. 정상 결제금액이 이 저신뢰 숫자에만 의존해 selected로 승격되던 경로를 차단했다.

`deviceReceiptPatterns.test.ts`에 가상 값·좌표로 12개 회귀를 추가했다. 기존 R1~R12 표와 기대값은 유지했다.

| 합성 입력 / 원 단위 | 기대값 |
| --- | --- |
| 공급가 21,818 + VAT 2,182 = 매출합계 24,000, 회수 3,000 뒤 빈 회수란 / 반대 순서 | 후보 보존, selected/suggested null |
| 같은 세금·매출합계, 회수 3,000과 4,000 / 뒤에 빈 라벨 추가 | 충돌 보존, 두 값 null |
| 회수 0 → 3,000 → 빈 라벨 | 첫 0원으로 충돌을 면제하지 않음, 두 값 null |
| 회수 `3,O00` 단독 / 빈 라벨 추가 / 정상 비영 회수와 병존 | 숫자 오독을 빈 값으로 면제하지 않음, 두 값 null |
| 한 관측의 `회수 3,O00` | 두 값 null |
| 독립 세금·매출합계와 내용 없는 중복 회수·보증금 부가란 | selected 24,000, suggested null 유지 |
| 매출합계 또는 매출총계 `3,40,120` − 회수 120, 정상 결제 340,000 | 저신뢰 매출액은 검산 불가, 후보만 보존·두 값 null |

수정 전 새 회귀 12개 중 11개 실패로 두 오확정 경로를 재현했다(`/tmp/rattle-ocr-r13-red.log`). 수정 후 OCR **8 suites/179 tests 통과**, 기본 timeout, 2.493초(`/tmp/rattle-ocr-r13-target.log`), `npm run typecheck` 통과(`/tmp/rattle-ocr-r13-typecheck.log`).

외부 `iphone/compare-r13.mjs`, `android/compare-r13.mjs`로 기준 265f472와 최종 소스를 같은 raw에 재실행했다. 결과는 각각 `/private/tmp/rattle-ocr-bench/iphone/r13-comparison.json`, `/private/tmp/rattle-ocr-bench/android/parser-r13-comparison.json`이며 로그와 실제 파싱 결과도 모두 이 외부 디렉터리에 유지했다. 입력 불변성과 파서 SHA-256 일치를 확인했다.

| 개발 표본 / 장수 | 265f472 selected/suggested/null | 수정본 selected/suggested/null | 잘못된 selected/suggested |
| --- | --- | --- | --- |
| 신규 iPhone 10장 | 1 / 2 / 7 | **1 / 2 / 7** | **0 / 0** |
| 기존 Android 10장 | 3 / 0 / 7 | **3 / 0 / 7** | **0 / 0** |
| 기존 Mac 10장 | 4 / 0 / 6 | **4 / 0 / 6** | **0 / 0** |

이 표본들은 이미 규칙 작성에 사용한 개발 자료이며 독립 holdout 정확도가 아니다. 저장소에는 합성 회귀와 집계만 기록했고 실영수증·원문·이미지·거래내역을 추가하지 않았다. 구현자 자체 검토이며 같은 검토자의 후속 재검토는 PL이 배정한다. 오확정 경로만 차단한다는 종료 기준과 안전한 null의 backlog는 유지한다. 새 기기 OCR·화면·빌드·설치·EAS·원격 변경은 실행하지 않았다.

최종 검증(2026-11-20, macOS 로컬, 기준 265f472 위 이 과제의 미커밋 파서·합성 회귀): 전체 `npx jest --runInBand --no-coverage --testPathIgnorePatterns='/node_modules/' '/__tests__/setup\.ts' '<rootDir>/supabase/functions/' '<rootDir>/dev/'` **199 suites/1753 tests 통과**, 기본 timeout, 49.148초, 종료 0(`/tmp/rattle-ocr-r13-full-jest.log`). 실행 전후 파서·회귀 소스 SHA는 `/tmp/rattle-ocr-r13-final-source.sha256`과 일치했고 두 raw 평가기의 파서 SHA도 최종 소스와 일치했다. `git diff --check`와 두 외부 평가기 `node --check` 통과.

## 독립 검토 9회차 반영 · R13 숫자 없는 인라인 값 (2026-11-20)

작업 `task_70f0c6ea4da3`, 기준 `feature/evidence-attachments@88f9402`. 앞선 R13 수정은 별도 셀과 숫자가 포함된 값의 내용을 보존했으나, 숫자가 전혀 없는 인라인 값은 `summaryValue`를 호출하지 않아 빈 부가란으로 면제하는 경로가 남아 있었다. 라벨 끝부터 다음 라벨 앞까지의 실제 값 영역을 확인해, 내용이 있으면 숫자 유무와 관계없이 기존 금액 해석 경로를 거치게 했다. `l,OOO` 같은 전부 문자 오독과 `삼천원`은 새 숫자 지원 없이 unreadable로 남고 selected/suggested 모두 null이 된다.

빈 `회수액` 라벨의 ‘액’을 값으로 오인하지 않도록 라벨 경계에 포함했다. 원래의 빈 회수·용기 회수액 부가란은 독립 공급가+VAT와 매출합계가 맞으면 selected를 유지한다. 기존 R1~R13의 숫자 충돌·비영 회수·저신뢰 매출액 차단과 토큰 독립성은 유지했다.

`deviceReceiptPatterns.test.ts`에 합성 회귀 7개를 추가했다. 모두 가상 공급가 21,818 + VAT 2,182 = 매출합계 24,000을 대조한다.

| 값 영역 / 배치 | 기대값 |
| --- | --- |
| 한 관측 `회수 l,OOO` / `회수 삼천원` | 회수 unreadable, 후보 보존, selected/suggested null |
| 라벨과 값이 별도 셀인 `l,OOO` / `삼천원` | 같은 unreadable·null 판정 유지 |
| 값 없는 `회수` / `회수액` / `용기 회수액` | 정상 빈 부가란, selected 24,000·suggested null 유지 |

수정 전 신규 7개 중 인라인 2개가 실패했다(`/tmp/rattle-ocr-r13-inline-red.log`). 수정 후 OCR **8 suites/186 tests 통과**, 기본 timeout, 3.434초(`/tmp/rattle-ocr-r13-inline-target.log`), `npm run typecheck` 통과(`/tmp/rattle-ocr-r13-inline-typecheck.log`).

외부 `iphone/compare-r13-inline.mjs`, `android/compare-r13-inline.mjs`로 88f9402와 최종 파서를 같은 raw에 재실행했다. 결과는 `/private/tmp/rattle-ocr-bench/iphone/r13-inline-comparison.json`, `/private/tmp/rattle-ocr-bench/android/parser-r13-inline-comparison.json`이고, 파싱 출력·로그·원문은 모두 외부 벤치 안에 유지했다. 입력 불변성과 최종 파서 SHA-256 일치를 확인했다.

| 개발 표본 / 장수 | 88f9402 selected/suggested/null | 수정본 selected/suggested/null | 잘못된 selected/suggested |
| --- | --- | --- | --- |
| iPhone 신규 표본 10장 | 1 / 2 / 7 | **1 / 2 / 7** | **0 / 0** |
| 기존 Android 10장 | 3 / 0 / 7 | **3 / 0 / 7** | **0 / 0** |
| 기존 Mac 10장 | 4 / 0 / 6 | **4 / 0 / 6** | **0 / 0** |

같은 개발 표본의 재평가이며 독립 holdout 성능이 아니다. 구현자 자체 검토이며 같은 검토자의 후속 검토는 PL이 배정한다. 안전한 null은 기존 backlog에 유지하고 원문은 저장소에 추가하지 않았다. 새 기기 OCR·화면·네이티브 빌드·설치·EAS·원격 변경은 실행하지 않았다.

최종 검증(2026-11-20, macOS 로컬, 기준 88f9402 위 이 과제의 미커밋 파서·합성 회귀): 전체 `npx jest --runInBand --no-coverage --testPathIgnorePatterns='/node_modules/' '/__tests__/setup\.ts' '<rootDir>/supabase/functions/' '<rootDir>/dev/'` **199 suites/1760 tests 통과**, 기본 timeout, 52.046초, 종료 0(`/tmp/rattle-ocr-r13-inline-full-jest.log`). 실행 전후 파서·회귀 SHA는 `/tmp/rattle-ocr-r13-inline-final-source.sha256`과 일치했다. `git diff --check`와 두 외부 평가기 `node --check` 통과.

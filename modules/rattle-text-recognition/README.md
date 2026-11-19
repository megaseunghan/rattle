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

금일합계를 우선하고 전일/이월/미수잔액을 합계 후보에서 제외한다. 다른 행의 숫자를 합계 라벨에 연결하지 않는다. 공급가·세액·상품·배송·할인·보증금·회수·잔액을 나눠 보관한다. 수량·단가·금액 누락은 null이며 산술 불일치를 자동 수정하지 않는다. 날짜는 후보만 보관하고 미노출 거래일을 현재 날짜로 채우지 않는다. 출처 이미지·좌표·원문·OCR confidence·규칙 confidence·observed/derived를 필드에 남긴다. parserConfidence는 규칙 우선순위이며 정확도 확률이 아니다.

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

작업 `task_8893aebc5c6e`, 기준 `feature/evidence-attachments@d24144c`, 역할 기준 `main@44308ed`. 허용 범위는 `lib/ocr/**`, `__tests__/ocr/**`, 이 README 기록이며 구현·자체 검토만 수행했다. R1 → R7 → R9의 반복 원인은 공급가+VAT의 범위를 한쪽으로 고정한 것이고, R10은 OCR 관측과 표의 금액 셀을 동일시한 것이다.

**판정 원칙:** 파생 합계는 명시 합계 라벨과 독립된 계산 관계가 함께 맞을 때만 만든다. 공급가+VAT를 S, 상품액을 G, 배송−할인을 A라 하면, S=G일 때는 결제 G+A, S=G+A일 때는 배송/할인이 이미 포함된 결제 S다. 상품액이 없어서 포함 범위를 모르면 명시 결제가 S 또는 S+A와 일치하는 경우 관측 후보를 보존하고 범위 경고를 남긴다. 이때 파생 합계와 세금 검산 결과는 확정하지 않는다. 어느 관계로도 설명되지 않는 값이나 복수 명시 결제 충돌은 null이다. 관측 후보 보존은 회계상 확정·매입 저장을 의미하지 않는다.

공백 숫자는 원문 관측 전체가 금액 열 경계 안에 있거나 독립 검산이 뒷받침해야 천단위로 해석한다. 관측 하나라는 이유만으로 `2 500`을 2,500원으로 선택하지 않는다. 열 근거 없는 공백 공급가·매출액은 검산에 재사용하지 않아 자기 검증을 막는다. 허용한 공백 해석도 derived·낮은 confidence·원문 경고를 유지한다. 품목 검산을 먼저 읽도록 순서만 옮겼으며 품목 감지 규칙은 유지했다.

### R1~R10 합성 재현 → 기대값 회귀표

금액은 모두 원 단위의 가상 자료다. 파서 항목은 `__tests__/ocr/totalEvidence.test.ts`의 표 기반 fixture와 기존 `receiptParser.test.ts`·`engineSegmentation.test.ts`로 실행한다. 파일·생명주기 지적 R4/R5/R8은 해당 실제 경계의 합성 테스트로 연결하며 파서 금액 테스트로 대체하지 않는다.

| 지적 | 재현 입력 | 기대값·실행 fixture |
| --- | --- | --- |
| R1 | 매출 30,000 / 회수 5,000 / 결제 30,000 / 단가 25,000; 공급가 20,000 / VAT 2,000 / 총합계 30,000 / 현금받음 22,000 | 선택 null, 임의 숫자에서 파생 후보 생성 안 함; `totalEvidence`·`receiptParser` |
| R2 | `− 500`, 괄호 반품, 떨어진 부호 / `--5,000`·미완성 괄호 | 유효 음수 보존, 모순 부호 null; `totalEvidence`·`receiptParser` |
| R3 | 상품 10,000 / 배송 `?` / 결제 10,000; 배송 라벨 부재·읽힌 0 | 명시 결제 보존, 미확인 배송 검산 null·경고, 부재/0과 구분; `totalEvidence`·`receiptParser` |
| R4 | 합성 URI/JSON 삭제가 계속 실패 → 재시도; 오래된 자기 파일과 새 파일·타 파일 혼재 | 실패 표시·실패 URI 재시도, 자기 오래된 파일만 삭제; `OcrLabScreen.test.tsx`·`temporaryFiles.swift` |
| R5 | 합성 데이터 3×64KB+7바이트 SHA-256 | 스트리밍 digest가 one-shot과 같음; `temporaryFiles.swift`. iOS 20장 RSS는 미검증 |
| R6 | 한 셀 `금일합계 0/50/500/999`, 작은 음수 | 0과 작은 금액도 보존; `totalEvidence`·`receiptParser` |
| R7 | 공급가 20,000 / VAT 2,000 / 상품 22,000 / 배송 3,000 / 결제 25,000 | 25,000, 배송을 반영한 관계 검산 일치; `totalEvidence`·`receiptParser` |
| R8 | 합성 cleanup deferred Promise 대기 중 unmount·권한 전환·측정 중지 후 resolve | 선택기·OCR 미호출; `OcrLabScreen.test.tsx`의 3개 표 기반 케이스 |
| R9 | 공급가 20,000 / VAT 2,000 / 상품 19,000 / 배송 3,000 / 결제 22,000; 상품 라벨 생략 | 둘 다 22,000 보존, 라벨 생략 때 포함 범위 경고·검산 null; `totalEvidence` |
| R10 | 합계 `2 500` 관측이 수량·금액 열을 걸침 / 근거 없는 `38 760` / 금액 열 내부 `2 500` / 공급가+VAT가 검산하는 `22 000` | 앞 두 경우 null, 뒤 두 경우 2,500·22,000 + derived·공백 경고; `totalEvidence` |

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

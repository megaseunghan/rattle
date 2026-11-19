# Rattle 기기 OCR · iPhone 측정 1단계

2026-11-19 요청: 사진별 기기 OCR와 규칙 파서 측정만 수행한다. 매입 등록, 서버 호출·저장, 사진 합치기는 없다. 원문 결과는 화면 메모리에 보관하며 명시적인 공유에서만 임시 JSON 파일을 만든다. 사진은 PHPicker가 제공한 원본을 임시 복사하고 측정·취소 후 삭제한다. 앱 강제 종료 시 임시 파일은 OS 임시 저장소에 남을 수 있다.

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
- 자체 검토만 수행했다. 독립 검토와 실제 빌드 확인은 PL이 배정한다.

Mac 비교 스크립트는 저장소 밖 `/private/tmp/rattle-ocr-bench/compare-iphone.mjs`. 실행: `node /private/tmp/rattle-ocr-bench/compare-iphone.mjs <공유 JSON 경로> <Rattle 저장소 경로>`. Mac과 iPhone 원문을 동일한 현재 TS 파서에 넣고 truth/금액/품목/날짜/시간/원문 관측 일치를 비교한다. SHA-256이 다른 사진이나 키 미입력·중복은 controlledPairs 분모에서 제외한다. iPhone 실측 파일이 오기 전 인식 정확도를 산출하지 않는다.

공식 참고: [Expo local modules](https://docs.expo.dev/modules/get-started/), [Expo AsyncFunction](https://docs.expo.dev/modules/module-api/), [Apple Vision](https://developer.apple.com/documentation/vision/vnrecognizetextrequest), [PHPicker](https://developer.apple.com/documentation/photosui/phpickerviewcontroller).

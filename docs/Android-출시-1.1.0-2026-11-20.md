# Android 1.1.0 Google Play 출시 준비 · 2026-11-20

## 빌드 및 제출 설정

패키지는 `com.seunghan.rattle`, 표시 버전은 1.1.0이다. 조정자가 확인한 Play 최고 versionCode는 Alpha의 3이다. 로컬 기준값을 4로 올렸다. production 프로필은 AAB, production 환경·채널, QA 로그인 0을 사용하며 EAS 빌드 시 versionCode를 자동 증가시킨다. 제출 직전에 최종 AAB의 실제 번호가 Play 전체 트랙 최고값보다 큰지 확인한다. Expo의 기본 로컬 버전 소스를 사용할 때는 증가한 번호도 다음 빌드에 보존한다. [Expo 설정](https://docs.expo.dev/eas/json/)

제출 기본 트랙은 internal이다. 내부 배포본을 기기에서 검증한 뒤 사용자가 프로덕션 승격을 결정한다. 조정자의 콘솔 조회 기준으로 프로덕션 액세스는 부여됐고 ‘앱 수준 판매자 상태 및 서비스 약관’ 선언은 계정 소유자의 확인이 필요하다. 기존 데이터 보안 응답의 개별 체크값은 확보되지 않았다.

## 서명과 제출 자격증명

- EAS credentials에서 production 프로필과 패키지를 선택해 원격 서명 자격증명 미등록을 확인했다. 기존 업로드 키를 쓰도록 Android production은 local로 지정했다. 빌드 담당자는 승인 후 제외된 로컬 `credentials.json`의 Android keystore를 기존 키에 연결해야 한다.
- 메인 체크아웃의 `.local-signing/rattle-upload.jks`가 존재하며 키스토어의 rattle-upload 별칭과 함께 보관된 공개 인증서의 SHA-256은 `F3AF0B8D215F0BBC73CEBC5C1C21C1DFAF2F876DC2D03555FCF916D298D349A9`로 1.0.0(3) AAB 서명 기록과 같다. Play 콘솔 ‘앱 무결성’에서 **업로드 키 인증서**와 최종 AAB 서명 지문을 대조해야 한다. Play가 사용자에게 배포할 때 쓰는 **앱 서명 키 인증서**는 별도이며 이번 작업의 콘솔 지문 대조는 미실행이다. [이전 배포 기록](archive/2026-10/EAS-첫배포-2026-10-30.md)
- EAS Submit이 참조할 경로는 `.local-signing/google-play-service-account.json`이다. 이 작업 트리에 파일이 없으며 해당 디렉터리는 Git·EAS 아카이브 제외 대상이다. 사용자는 기존 Play 제출 권한이 있는 서비스 계정을 제공할지 또는 Play Console에서 직접 제출할지 결정한다.

## 1.0 대비 권한 및 데이터 보안 대조

| 1.1.0에서 추가·변경한 흐름 | Android 권한 및 기기 처리 | Play Console에서 확인할 응답 |
|---|---|---|
| QR 출퇴근·매장폰 | 스캔할 때 카메라 사용. QR 원본 프레임 저장 없이 직원·매장·출퇴근 구분·시각·등록 기기를 연결한다. 위치·연락처·마이크는 차단한다. | 앱 기능 목적으로 전송되는 사용자 ID, 근태 활동 기록, 등록 기기 식별자와 기존 응답을 대조한다. GPS 위치와 구분하고 역할별 필수 여부·보관·삭제를 확인한다. |
| 증빙 촬영·사진 첨부 | 카메라 또는 시스템 사진 선택기에서 사용자가 선택한 사진만 처리한다. 전체 미디어 읽기 권한을 차단한다. Android 9 이하의 촬영은 설치된 Expo ImagePicker가 레거시 쓰기 권한도 요청한다. | ‘사진 및 동영상 → 사진’, 수집, 앱 기능, 선택 제공. 서버에 보관되는 사진의 삭제 절차를 공개 방침과 대조한다. |
| 증빙 PDF | 시스템 문서 선택기로 지정한 파일을 비공개 저장소에 올린다. | ‘파일 및 문서’, 수집, 앱 기능, 선택 제공. 파일명·첨부 대상 거래·계정 연결도 고지한다. |
| OCR 플래그 꺼짐·QR 바코드 인식 | 한글 텍스트 인식 네이티브 의존성과 QR 인식 라이브러리가 빌드 대상에 남는다. | SDK가 사용하는 설치 식별자·기기 및 앱 정보·진단·성능 정보를 SDK 버전과 실제 호출별로 확인한다. OCR 비활성만으로 SDK 전체 미수집을 확정할 수 없다. |

사진·문서·근태의 사용자별 선택 가능 여부, 전송 암호화, 위탁사와 공유 예외, 계정·첨부 삭제 및 법정 보관 예외는 출시 담당자가 실제 운영 설정과 대조해 확정한다. 기존 선언이 완료 상태여도 새 처리 내용을 반영해야 한다. [Google Play 데이터 보안](https://support.google.com/googleplay/android-developer/answer/10787469) · [ML Kit 데이터 공개 지침](https://developers.google.com/ml-kit/android-data-disclosure)

## 로컬 검증 근거

- 11월 20일 macOS에서 소스 `5f39af9`와 Android 설정 변경분을 별도 디렉터리에 복사해 `npx expo prebuild --platform android --clean --no-install`을 실행했다. 기존 공유 작업 트리의 android 폴더를 보존했다. 생성된 Gradle은 패키지·버전 1.1.0(4), minSdk 24, targetSdk 36이며 적응형 일반·원형 아이콘 리소스와 `edgeToEdgeEnabled=true`를 확인했다. QR 스캔 화면은 시스템 인셋을 사용한다.
- 이전 APK의 SHA-256이 10월 30일 배포 기록과 일치했다. `aapt dump permissions` 기준 1.0.0(3)에는 CAMERA가 없고 READ/WRITE_EXTERNAL_STORAGE(최대 API 32), SYSTEM_ALERT_WINDOW가 있었다. 새 prebuild manifest에는 CAMERA가 추가됐고 전체 사진·영상·저장소 읽기, 오버레이, 녹음, 위치, 연락처 권한에는 제거 규칙이 있다. WRITE_EXTERNAL_STORAGE는 Expo 기본 최대 API 32이며 앱의 촬영 경로는 API 28 이하에서 요청한다.
- 한글 OCR 의존성은 `text-recognition-korean:16.0.1`이다. 로컬 Gradle 캐시에서 한국어 AAR 약 1.8 MiB와 공통 인식 AAR 약 17 MiB를 확인했다. 이 크기는 모델·코드가 든 의존성 파일의 크기다. ABI 분할과 공통 라이브러리 중복 제거를 거친 기기 다운로드 증가분은 Play의 App bundle explorer에서 동일 기기 기준으로 확인해야 한다. 이전 AAB는 78,624,013바이트였다.
- production 설정과 일반 Gradle 실행에는 채널 차이가 있다. 이번 로컬 prebuild의 기본 헤더는 `preview`다. 승인 후 EAS가 생성한 최종 AAB에서 production 헤더·runtime 1.1.0·QA 비활성·업로드 키 지문을 확인한 뒤 internal 제출 여부를 결정한다. [Expo의 채널 헤더 적용 기준](https://docs.expo.dev/eas-update/override/)
- 첫 Release 빌드는 누락된 시작 화면 이미지 때문에 Android 리소스 연결에서 실패했다. Android 전용 스플래시 이미지로 기존 적응형 아이콘 전경을 지정하고 clean prebuild 후 화면 밀도별 로고 생성을 확인했다. Release 병합 manifest에서 CAMERA와 최대 API 32의 저장소 쓰기 권한을 확인했고 차단 목록 11개가 모두 제외됐다.
- 21시경 PL 요청으로 재빌드를 중단했다. AAB·APK 생성과 최종 파일 크기·서명·채널 확인은 보류다. API 37 격리 AVD는 기동했으나 ADB가 offline인 상태에서 종료했다. 설치·앱 시작·로그인·안전영역·매장폰 카메라 권한·증빙 사진 선택은 미검증이다. 재개 승인 후 최신 소스로 로컬 release 빌드와 기기 확인을 다시 수행한다. Play 출시본은 별도의 운영 환경·서명 검증을 거친다.

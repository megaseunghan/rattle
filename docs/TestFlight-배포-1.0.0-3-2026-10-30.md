# TestFlight 1.0.0(3) 배포

## 대상과 사용자 승인

- bundle ID: com.seunghan.rattle, App Store Connect 앱 ID: 6825832614.
- 사용자 최초 요청은 기존 1.0.0(2) 교체. 서버에서 이미 등록된 빌드 2가 만료 상태임을 확인했다.
- 같은 TestFlight 빌드 번호의 파일 교체가 불가능함을 안내했고, 사용자가 명시적으로 1.0.0(3) TestFlight 배포를 선택했다.
- Expo buildNumber, native Info.plist CFBundleVersion, Xcode Debug/Release CURRENT_PROJECT_VERSION을 3으로 맞췄다. 표시 버전은 1.0.0, Android versionCode는 2 유지.
- 기준: feature/operations-workflows / HEAD 1c2281cd01c506c4c5b1c2cd7287e50034c11744 + 기존 dirty/untracked 앱 코드 포함. 원격 소스 push/merge는 실행하지 않음.

## 완료 증거

- 아카이브: /private/tmp/rattle-navigation-v3-20261030.xcarchive
- xcodebuild archive: ARCHIVE SUCCEEDED. 생성된 앱 Info.plist에서 1.0.0, 빌드 3 직접 확인.
- Xcode Organizer: Uploaded to Apple, Build Number 3. 업로드 시각 2026-10-30 14:46 KST.
- App Store Connect: 빌드 3 내부 / 테스트 중 / 90일 후 만료.
- 기존 내부 그룹 Rattle 실기기 검증에 빌드 3 추가 완료. 새 테스터 초대나 계정 권한 확대 없음.
- TestFlight 빌드 ID: 2bb2f64b-1bcc-4081-b9d1-852a1a54b269.
- TestFlight Internal Only로 업로드. App Store 공개 심사/출시/외부 테스트 배포는 하지 않았다.

## 포함된 변경과 검증 범위

전체 화면 선별 메모이제이션, 목록 key/extraData/renderItem 및 5/10/5 가상화, Native Stack freezeOnBlur, 서랍 Reanimated, 타이머/rAF 정리와 idle 예약을 포함한다. 직전 로컬 검증은 타입 검사 및 89 suites / 531 tests 통과.

TestFlight에서 설치 가능한 그룹 배포 상태까지 확인했다. 사용자의 iPhone에서 TestFlight 설치 버튼을 누른 결과나 새 설치본의 로그인·스크롤·전체 화면 동작을 확인한 것은 아니다. iPhone은 TestFlight → Rattle → 1.0.0(3) 업데이트로 설치한다. 앱을 삭제한 뒤 다시 설치하는 절차를 수행하지 않았다.

## 빌드 기록과 서명 문제 해결

- 빌드 환경 EXPO_PUBLIC_QA_LOGIN=0, QA broker token 빈 값. 일반 앱으로 빌드.
- archive 로그: /private/tmp/rattle-navigation-v3-archive.log.
- archive JS bundle SHA-256: af949db33bad48da4c6d78721ce2eb509846d5ef945a558b474d0bc6f1e62375.
- 최초 Xcode 배포는 팀을 Personal Team으로 잘못 인식하여 거절됐다. 웹 멤버십과 아카이브 팀 ID 일치를 확인하고, 기존 Apple Distribution 인증서/프로파일을 확인·갱신한 뒤 Xcode를 재시작했다. 이후 유료 팀으로 인식하고 업로드 성공. 신규 인증서·키 생성은 하지 않음.
- Apple 계정 로그인·계약 확인은 사용자가 직접 진행했다. 비밀번호·개인키를 산출물에 포함하지 않았다.
- SQL/원격 DB 변경은 실행하지 않음.

## 시뮬레이터 최종 상태

- iPhone 16 Pro / iOS 26.3 / 8459CAD8-470F-4279-9821-6E6FCFC92D91.
- 최종 1.0.0(3) Release BUILD SUCCEEDED, 기존 앱 위 업데이트 설치 성공.
- simctl launch --terminate-running-process 재실행 성공, PID 98510.
- simulator JS SHA-256: d8e2ce8d1df2402597c6ab2d92cfeb9e7ff8a59f4c84c3c705630ae3b367392e.
- 로그: /private/tmp/rattle-nav-v3-simulator-build.log.
- 시뮬레이터 (2) 중간 설치 후 최종 (3)으로 교체 완료. 설치·프로세스 시작 확인이며 전체 화면 UI/스크롤 성능 검증은 미실행.

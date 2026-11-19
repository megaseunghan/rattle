# QR 출퇴근 네이티브 디자인 미리보기

S43의 기록 우선 화면과 연결된 정정 요청 폼을 검토하는 독립 진입점이다.
실제 앱 라우트·인증·Supabase·QR 발급·기록 저장과 연결하지 않는다.
QR은 스캔되지 않는 도형, 기록은 2026-11-17 오전 9:02 가상 자료다.
입력값은 실행 중에만 보존하며 앱을 종료하면 초기화한다.

확정 디자인과 미정 사항은 기존 [design-state.md](../../docs/design/qr-attendance-preview-2026-11-16/design-state.md)에 모아 기록한다. 해당 문서는 저장소의 기존 Git 제외 대상이다.

## 실행 기준

- 진입점: `dev/attendance-design/index.tsx` (`main` 등록)
- 별도 시뮬레이터 앱 ID: `com.seunghan.rattle.design`, 표시명 `Rattle 디자인`
- 기존 네이티브 Release 앱 사본에 이 진입점의 번들·자산을 넣어 로컬 서명/설치했다. 전체 네이티브 재컴파일이 아니다.
- 원본 앱과 데이터는 보존하며 사본의 Expo Updates를 비활성화했다. EAS 배포 대상으로 사용하지 않는다.
- 임시 설치 산출물·캡처·receipt: `/private/tmp/rattle-attendance-native-20261117/`

번들 재생성은 기존 네이티브 바이너리와 설치된 패키지의 호환성을 확인한 뒤 수행한다.
다른 기기에서는 원본 앱 경로와 시뮬레이터 UDID를 다시 확인해야 한다.

```sh
EXPO_NO_DOTENV=1 NODE_ENV=production npx expo export:embed \
  --entry-file dev/attendance-design/index.tsx --platform ios --dev false --bytecode \
  --bundle-output /private/tmp/rattle-attendance-native-20261117/NativePreview.app/main.jsbundle \
  --assets-dest /private/tmp/rattle-attendance-native-20261117/NativePreview.app --max-workers 2
```

기능 개발 시 이 진입점을 실제 앱 전체 진입점으로 교체하지 않는다. 화면을 기존 라우트·서비스 계약에 맞춰 별도 통합하고 인증·권한·서버 시간·오류·중복 처리를 검증해야 한다.

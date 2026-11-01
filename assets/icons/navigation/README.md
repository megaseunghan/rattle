# Rattle 선 아이콘 원본

원본 기하학으로 작성한 **56개 의미 + 선택 상태 2개 = 58개 SVG**다. 앱 코드의 기존 아이콘을 아직 교체하지 않았다.

- 공통 규격: `viewBox="0 0 24 24"`, 24×24, `fill="none"`, `stroke="currentColor"`, 선 1.8, 둥근 선 끝·모서리.
- 핵심 조작·탐색 32종, 업무·보조 24종은 [제작 목록](../../../docs/공통-아이콘-Assets-제작목록-2026-10-30.md)의 파일명과 일치한다.
- `checkbox.svg` / `radio.svg`는 미선택, `checkbox-checked.svg` / `radio-checked.svg`는 선택 상태다.
- 활성·비활성·위험 상태 색은 UI에서 제어한다. 선택 의미는 색만으로 전달하지 않는다.
- 공식 Provider 로고·폰트·스크립트·외부 이미지·필터·라이브러리 경로를 포함하지 않는다.

## 재생성·검사

저장소 루트에서 실행한다.

```bash
node scripts/create-rattle-icons.mjs
node scripts/create-rattle-icons.mjs --check
```

기존 내용과 동일하면 다시 쓰지 않는다. 파일이 수정된 경우 덮어쓰지 않고 중단한다. 전체 대상을 먼저 확인하므로 변경 충돌 때문에 일부만 재생성하는 상황을 피한다.

## 앱에 적용할 때

이 폴더는 SVG 원본이다. 현재 Expo 설정에 임의의 SVG import transformer가 있다고 가정하지 않는다. React Native에서는 `react-native-svg`의 `Svg`·`Path`·`Rect`·`Circle` 등으로 변환한 공통 아이콘 컴포넌트를 사용한다. 필요 크기와 색을 prop으로 전달하고 터치 영역은 별도 버튼에서 최소 44pt를 확보한다.

웹에서는 인라인 SVG의 `color`로 선 색을 바꿀 수 있다. `<img src="...svg">`는 바깥 문서의 `currentColor`를 상속하지 않으므로 갤러리에서 검정으로 보일 수 있다. 실제 UI에는 해당 행동과 대상을 식별하는 접근성 이름을 제공한다.

XML·목록·공통 속성 검사는 완료했다. 실제 16/20/24pt 렌더링과 터치·VoiceOver·Android 적용 검증은 앱 교체 단계에서 수행한다.

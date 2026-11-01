# Rattle 공통 아이콘 Assets

2026-10-30 제작. 사용자가 제공한 참조 보드의 **하단 ‘안 3’** 기준이다. 후속 요청으로 앱 코드 연결까지 적용했다. 실제 설치본 확인·배포는 별도다.

- [미리보기 갤러리](preview.html): 더블클릭 후 브라우저에서 확인. 체커보드·흰색·블루 배경 전환, SVG 16/24/32px 비교.
- [입체 아이콘 전체 보드](preview-board.png): 실제 알파 합성 결과. 각 칸 왼쪽은 연한 블루, 오른쪽은 흰색이다. 순서는 `raster-plan.json`과 같다.
- [전체 파일 목록](catalog.json): 82개 신규 자산의 경로·라벨·용량·SHA-256.

| 폴더 | 납품 내용 |
|---|---|
| business/ | 업무용 투명 PNG 16종 |
| status/ | 상태·빈 화면 투명 PNG 8종 |
| navigation/ | 공통 32 + 보조 24 의미의 SVG 56종, checkbox/radio 선택 변형 2종 |
| originals/ | 이미지 생성기의 PNG 원본 24개. 가공 전 파일 보존 |
| reference/ | 사용자가 제공한 안 2·안 3 참조 보드. 하단 안 3만 스타일 근거로 사용 |
| brand/ | 기존 Rattle iOS·Android 앱 아이콘 복사본 2개 |
| providers/ | 기존 Google G 공식 자산 복사본 1개 |

## 적용 규격

PNG는 원래 해상도와 정사각형 캔버스를 유지했다. `validation.json`에 각 파일의 실제 치수와 투명도·바운딩 박스를 기록한다. 업무 일러스트는 48~80pt 이상을 권장하며 작은 버튼·목록 아이콘은 SVG를 사용한다. 모든 PNG를 동일한 슬롯에 `contain`으로 표시하고 필요하면 UI에서 개별 크기를 조정한다.

SVG는 `viewBox="0 0 24 24"`, `stroke-width="1.8"`, 둥근 선 끝·모서리, `currentColor` 기준이다. RN에서 사용하려면 react-native-svg 컴포넌트로 변환한다. 파일 존재만으로 RN import가 지원되는 것은 아니다. 활성 탭·위험 상태 색과 접근성 이름·터치 영역은 UI에서 관리한다. checkbox/radio의 기본 파일은 미선택, `-checked`는 선택이다.

상단 프로필 복원이나 매장 전환 추가는 하지 않았다. 로그인 및 Toss 로고를 새 스타일로 그리지 않았다. Rattle 워드마크·심볼의 새 원본도 제작하지 않았으며, `brand/`는 기존 앱 아이콘의 보관용 사본이다. Apple·Kakao·Toss의 공식 원본은 이 패키지에 새로 수집하지 않았다.

## 제작·가공·검증 기록

입체 PNG 24개는 built-in image_gen으로 각각 생성했다. 공통 스타일 프롬프트·개별 주제·생성 파일명은 `generation.json`에 기록했다. SVG는 직접 작성한 벡터이며 기존 라이브러리 도형을 복제하지 않았다.

사용자 승인 후 로컬 처리는 **알파 0~2/255인 픽셀만 투명 검정으로 정리**했다. 알파 3~255인 본체·경계 픽셀은 그대로 보존했다. 크기 변경·크롭·형태 침식·색 보정은 하지 않았다. 흰 조각처럼 보인 샘플은 실제로 거의 투명한 픽셀이었으며, 흰색·블루 배경 합성에서 두드러지는 잔여 조각은 발견하지 못했다. 원본/결과 해시와 픽셀 수는 `processing.json` 참조.

24개 모두 실제 알파 합성 보드와 개별 이미지로 의미·문자 혼입·클리핑을 검토했다. 자동 검사는 PNG 24/SVG 58/누락 0 통과. 11개 PNG의 최소 여백 10% 미만은 검토 경고이며 본체 클리핑은 없었다. 실제 앱에서의 48~80pt 표시, 하단 탭 활성 상태·접근성·RN 렌더링은 미실행이다. 브라우저의 전체 SVG 시각 검증도 자동 형식 검사와 구분한다.

```sh
node scripts/create-rattle-icons.mjs --check
node scripts/validate-rattle-icon-assets.mjs --report
node scripts/build-rattle-icon-gallery.mjs
```

`prepare-rattle-icon-pngs.mjs`는 보존된 원본을 기준으로 같은 처리를 재현한다. 현재 node_modules에 설치된 pngjs 간접 의존성을 사용하며 별도 패키지를 추가하지 않았다. 재현 환경에 pngjs가 없으면 이 가공 스크립트는 실행되지 않는다. 최초 자산 납품 시점에는 앱 실행 코드를 변경하지 않았고, 후속 앱 적용과 검증 결과는 아래 절 및 제작 목록 8절에 기록했다.

## 앱 연결 후속 작업

`lib/icons/AppIcon.tsx`가 공통 SVG를 RN에서 렌더링하며, 제작하지 않은 심볼만 기존 라이브러리로 표시한다. `Illustration.tsx`는 24개 PNG를 명시적 이름으로 참조한다. 홈 업무/개인 급여 카드와 공통 빈 화면, 재고·레시피·직원·매출 빈 화면에 연결했다. 오류와 추가 조회 상태는 명시적으로 구분한다.

앱은 고해상도 PNG 대신 `runtime/`의 256px 파생본을 사용한다. 24개 합계 975,743바이트다. 고해상도 원본과 originals는 보존한다. 재생성은 `node scripts/build-rattle-runtime-images.mjs`, SVG TS 모듈 재생성은 `node scripts/build-rattle-native-icons.mjs`다. 전자는 현재 설치된 pngjs 간접 의존성이 필요하다.

위 ‘실제 앱 교체 미실행’ 설명은 최초 납품 시점의 기록이며, 후속 앱 코드 연결 상태는 이 절과 제작 목록 8절을 따른다. 네이티브 화면 조작·실기기 설치·배포는 이번에도 미실행이다. ZIP은 최초 고해상도 자산 납품본이다.

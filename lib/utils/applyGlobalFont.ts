import { StyleSheet, Text, TextInput } from 'react-native';
import { pretendard } from '../../constants/fonts';

/**
 * 앱 전역 기본 서체를 Wanted Sans로 설정한다. Text/TextInput은 대부분 화면에서 style prop을
 * 명시적으로 넘기기 때문에 defaultProps만으로는 적용되지 않는다(defaultProps는 prop이 아예 없을
 * 때만 채워짐). 그래서 컴포넌트의 render를 가로채 실제 렌더링 직전에 style에서 fontWeight를 읽어
 * 굵기에 맞는 정적 파일(Regular/Medium/SemiBold/Bold)로 fontFamily를 주입한다.
 * 이미 fontFamily가 지정된 스타일(예: Geist 숫자, 아이콘)은 건드리지 않는다.
 */
export function applyGlobalFont() {
  patchRender(Text as any);
  patchRender(TextInput as any);
}

function patchRender(Component: any) {
  if (!Component) return;
  if (typeof Component.render !== 'function') {
    // render를 가로챌 수 없는 RN 버전이면 최소한 style을 안 주는 Text에라도 기본 폰트가 적용되도록 폴백
    Component.defaultProps = Component.defaultProps || {};
    Component.defaultProps.style = [Component.defaultProps.style, { fontFamily: pretendard() }];
    return;
  }
  if (Component.__fontPatched) return;
  const originalRender = Component.render;

  Component.render = function patchedRender(props: any, ref: any) {
    const flatStyle = StyleSheet.flatten(props.style) ?? {};
    if (!flatStyle.fontFamily) {
      const fontFamily = pretendard(flatStyle.fontWeight as string | number | undefined);
      props = { ...props, style: [props.style, { fontFamily }] };
    }
    return originalRender.call(this, props, ref);
  };
  Component.__fontPatched = true;
}

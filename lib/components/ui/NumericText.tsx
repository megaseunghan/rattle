import { StyleSheet, Text, TextProps } from 'react-native';
import { Children } from 'react';
import { Fonts, pretendard } from '../../../constants/fonts';

/** 금액·수치의 굵기별 Geist와 고정폭 숫자. 조회 상태 문구는 본문 서체를 유지한다. */
export function NumericText({ children, style, ...props }: TextProps) {
  const weight = Number(StyleSheet.flatten(style)?.fontWeight ?? 400);
  const family = weight >= 700 ? Fonts.geistBold : weight >= 600 ? Fonts.geistSemiBold : weight >= 500 ? Fonts.geistMedium : Fonts.geistRegular;
  const hasNumber = Children.toArray(children).some(child => typeof child === 'number' || (typeof child === 'string' && /\d/.test(child)));
  return <Text {...props} style={[style, { fontFamily: hasNumber ? family : pretendard(weight), fontVariant: ['tabular-nums'] }]}>{children}</Text>;
}

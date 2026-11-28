/* design-system: DESIGN.md — 흰 바탕 밑줄 입력(직원 합류·합류 승인·직원 정보 공용). */
import { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { Type } from '../../../constants/designTokens';

export interface UnderlineInputProps extends Omit<TextInputProps, 'style'> {
  /** 접근성 이름(화면에는 질문 제목이 대신 보인다) */
  label: string;
  unit?: string;
  numeric?: boolean;
  /** 입력칸 오른쪽 작은 안내(예: '매장 기본값') */
  trailing?: string;
}

export function UnderlineInput({ label, unit, numeric, trailing, onFocus, onBlur, ...props }: UnderlineInputProps) {
  const [focused, setFocused] = useState(false);
  return <View style={[styles.box, focused && styles.focused]}>
    <TextInput accessibilityLabel={label} placeholderTextColor={Colors.gray400} autoCorrect={false}
      {...props}
      onFocus={event => { setFocused(true); onFocus?.(event); }}
      onBlur={event => { setFocused(false); onBlur?.(event); }}
      style={[styles.input, numeric && styles.numeric]} />
    {!!unit && <Text style={styles.unit}>{unit}</Text>}
    {!!trailing && <Text style={styles.trailing}>{trailing}</Text>}
  </View>;
}

/** 금액 입력을 천 단위 쉼표로(숫자만 남긴다). */
export function formatMoneyInput(text: string): string {
  const digits = text.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return digits ? Number(digits).toLocaleString('ko-KR') : '';
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1.5, borderBottomColor: Colors.gray300, minHeight: 52 },
  focused: { borderBottomColor: Colors.action },
  input: { flex: 1, minHeight: 48, paddingVertical: 8, fontFamily: Fonts.wantedMedium, fontSize: Type.xl, color: Colors.black },
  numeric: { fontFamily: Fonts.geistMedium, fontVariant: ['tabular-nums'] },
  unit: { fontFamily: Fonts.wantedMedium, fontSize: Type.lg, color: Colors.gray600 },
  trailing: { fontFamily: Fonts.wantedRegular, fontSize: Type.sm, color: Colors.gray500 },
});

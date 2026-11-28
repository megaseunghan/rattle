/* design-system: DESIGN.md — 밑줄 입력. 보이는 이름표 없이 흐린 예시만 두고, 화면 읽기 이름은 label로 준다. */
import { forwardRef, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type TextStyle } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';

export interface UnderlineInputProps extends Omit<TextInputProps, 'style'> {
  /** 화면 읽기용 이름(화면에는 안 보임). */
  label: string;
  /** 숫자 입력이면 Geist 서체. */
  numeric?: boolean;
  /** 입력 바로 뒤에 붙는 글자(예: '%'). */
  suffix?: ReactNode;
  /** 오른쪽 끝에 붙는 내용(예: '기본값'). */
  trailing?: ReactNode;
  inputStyle?: StyleProp<TextStyle>;
}

export const UnderlineInput = forwardRef<TextInput, UnderlineInputProps>(function UnderlineInput(
  { label, numeric, suffix, trailing, inputStyle, onFocus, onBlur, editable = true, ...props }, ref,
) {
  const [focused, setFocused] = useState(false);
  return <View style={[styles.row, focused && styles.focused]}>
    <TextInput ref={ref} accessibilityLabel={label} editable={editable} placeholderTextColor={Colors.gray400}
      onFocus={event => { setFocused(true); onFocus?.(event); }}
      onBlur={event => { setFocused(false); onBlur?.(event); }}
      style={[styles.input, numeric && styles.numeric, !editable && styles.readOnly, inputStyle]} {...props} />
    {suffix}
    {trailing != null && <View style={styles.trailing}>{trailing}</View>}
  </View>;
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, marginTop: 20, borderBottomWidth: 2, borderBottomColor: Colors.gray200, paddingHorizontal: 2 },
  focused: { borderBottomColor: Colors.action },
  input: { flex: 1, minHeight: 50, paddingVertical: 0, fontSize: 20, fontWeight: '600', color: Colors.black },
  numeric: { fontFamily: Fonts.geistSemiBold },
  readOnly: { color: Colors.gray500 },
  trailing: { marginLeft: 'auto', paddingLeft: 8 },
});

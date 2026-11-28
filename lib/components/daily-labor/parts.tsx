/* design-system: DESIGN.md — S54 일용근로자 급여대장 공용 조각(선택 버튼, 확인칸, 금액 입력, 안내 한 줄) */
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Radius, Type } from '../../../constants/designTokens';
import { AppIcon } from '../../icons/AppIcon';
import { NumericText } from '../ui/NumericText';
import { amountText, parseAmount } from './format';

export function SectionLabel({ text, hint }: { text: string; hint?: string }) {
  return <Text style={styles.label}>{text}{hint ? <Text style={styles.labelHint}>  {hint}</Text> : null}</Text>;
}

/** 회색 안내 한 줄(노란 경고 대신). */
export function GrayNote({ text }: { text: string }) {
  return (
    <View style={styles.note}>
      <AppIcon name="information-circle-outline" size={16} color={Colors.gray500} />
      <Text style={styles.noteText}>{text}</Text>
    </View>
  );
}

interface SegmentOption<T extends string> { value: T; label: string }

/** 둘~셋 중 하나 고르기. value가 null이면 아무것도 고르지 않은 상태. */
export function Segment<T extends string>({ options, value, onChange, label }: {
  options: SegmentOption<T>[]; value: T | null; onChange: (value: T) => void; label: string;
}) {
  return (
    <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.segmentItem, selected && styles.segmentOn, pressed && styles.pressed]}>
            <Text style={[styles.segmentText, selected && styles.segmentTextOn]} numberOfLines={1}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 체크 표시만 그린다(누르는 영역은 감싼 버튼이 맡는다). */
export function CheckMark({ checked, small }: { checked: boolean; small?: boolean }) {
  const size = small ? 20 : 22;
  return (
    <View style={[styles.check, { width: size, height: size }, checked && styles.checkOn]}>
      {checked && <AppIcon name="check" size={small ? 13 : 14} color={Colors.white} />}
    </View>
  );
}

/** 쉼표 금액 입력칸 + '원'. */
export function AmountInput({ value, onChange, label, placeholder, editable = true, ...rest }: {
  value: number | null; onChange: (value: number | null) => void; label: string; placeholder?: string; editable?: boolean;
} & Pick<TextInputProps, 'onFocus' | 'onBlur' | 'selectTextOnFocus'>) {
  return (
    <View style={[styles.inputBox, !editable && styles.inputLocked]}>
      <TextInput style={styles.amountInput} value={amountText(value)} onChangeText={text => onChange(parseAmount(text))} keyboardType="number-pad"
        accessibilityLabel={label} placeholder={placeholder} placeholderTextColor={Colors.gray400} editable={editable} {...rest} />
      <Text style={styles.unit}>원</Text>
    </View>
  );
}

export function TextBox({ value, onChange, label, placeholder, keyboardType, maxLength }: {
  value: string; onChange: (value: string) => void; label: string; placeholder?: string; keyboardType?: TextInputProps['keyboardType']; maxLength?: number;
}) {
  return (
    <View style={styles.inputBox}>
      <TextInput style={styles.textInput} value={value} onChangeText={onChange} accessibilityLabel={label} placeholder={placeholder}
        placeholderTextColor={Colors.gray400} keyboardType={keyboardType} maxLength={maxLength} />
    </View>
  );
}

/** 왼쪽 이름, 오른쪽 금액인 한 줄. */
export function AmountLine({ label, amount, strong }: { label: string; amount: string; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, strong && styles.lineStrong]}>{label}</Text>
      <NumericText style={[styles.lineValue, strong && styles.lineValueStrong]}>{amount}</NumericText>
    </View>
  );
}

export function StatusPill({ paid }: { paid: boolean }) {
  return (
    <View style={[styles.pill, paid ? styles.pillPaid : styles.pillWait]}>
      <Text style={[styles.pillText, paid ? styles.pillTextPaid : styles.pillTextWait]}>{paid ? '지급 완료' : '지급 대기'}</Text>
    </View>
  );
}


const styles = StyleSheet.create({
  label: { fontSize: Type.sm, fontWeight: '700', color: Colors.gray700, marginTop: 6 },
  labelHint: { fontWeight: '500', color: Colors.gray400 },
  note: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', backgroundColor: Colors.chipBg, borderRadius: Radius.md, padding: 12 },
  noteText: { flex: 1, fontSize: Type.sm, lineHeight: 19, color: Colors.gray600 },
  segment: { flexDirection: 'row', gap: 8 },
  segmentItem: { flex: 1, minHeight: 48, borderRadius: Radius.field, backgroundColor: Colors.chipBg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segmentOn: { backgroundColor: Colors.bg },
  segmentText: { fontSize: Type.base, fontWeight: '600', color: Colors.gray600 },
  segmentTextOn: { color: Colors.action, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  check: { borderRadius: 6, borderWidth: 1.5, borderColor: Colors.gray300, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: Colors.action, borderColor: Colors.action },
  inputBox: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderBottomWidth: 1.5, borderBottomColor: Colors.gray200 },
  inputLocked: { opacity: 0.5 },
  amountInput: { flex: 1, minWidth: 0, fontSize: Type.xl, fontWeight: '600', color: Colors.black, paddingVertical: 10 },
  textInput: { flex: 1, minWidth: 0, fontSize: Type.md + 1, fontWeight: '500', color: Colors.black, paddingVertical: 12 },
  unit: { fontSize: Type.lg, fontWeight: '600', color: Colors.gray700, marginLeft: 6 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36, gap: 12 },
  lineLabel: { fontSize: Type.sm, color: Colors.gray600 },
  lineStrong: { fontWeight: '700', color: Colors.black },
  lineValue: { fontSize: Type.base, fontWeight: '600', color: Colors.black },
  lineValueStrong: { fontSize: Type.md + 1, fontWeight: '700' },
  pill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  pillWait: { backgroundColor: Colors.bg },
  pillPaid: { backgroundColor: Colors.chipBg },
  pillText: { fontSize: Type.xs, fontWeight: '600' },
  pillTextWait: { color: Colors.action },
  pillTextPaid: { color: Colors.gray600 },
});

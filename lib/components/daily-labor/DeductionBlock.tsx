/* design-system: DESIGN.md — S54 사람별 공제 묶음. 예상값을 채워 두고 눌러서 고친다. 고친 칸은 '고침'과 '되돌리기'. */
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Radius, Type } from '../../../constants/designTokens';
import { NumericText } from '../ui/NumericText';
import { amountText, parseAmount, won } from './format';
import { AmountLine } from './parts';
import { DEDUCTION_FIELDS, isEdited, netOf, type DeductionKey } from './paymentDraft';
import type { DailyLaborDeductions } from '../../services/dailyLaborers';

interface DeductionBlockProps {
  name: string;
  days: number;
  gross: number;
  estimate: DailyLaborDeductions;
  actual: DailyLaborDeductions;
  /** 없으면 읽기 전용(지급 완료 내역) */
  onChange?: (key: DeductionKey, value: number) => void;
  onReset?: (key: DeductionKey) => void;
  error?: string;
}

export function DeductionBlock({ name, days, gross, estimate, actual, onChange, onReset, error }: DeductionBlockProps) {
  const editable = !!onChange;
  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.days}>{days}일</Text>
      </View>
      <AmountLine label="지급 합계" amount={won(gross)} />
      {DEDUCTION_FIELDS.map(([key, label]) => {
        const edited = isEdited({ estimate, actual }, key);
        return (
          <View key={key}>
            <View style={styles.line}>
              <Text style={styles.label}>{label}</Text>
              <View style={styles.valueWrap}>
                {edited && <View style={styles.tag}><Text style={styles.tagText}>고침</Text></View>}
                {editable ? (
                  <View style={[styles.inputBox, edited && styles.inputEdited]}>
                    <TextInput style={styles.input} value={amountText(actual[key])} keyboardType="number-pad" selectTextOnFocus
                      onChangeText={text => onChange?.(key, parseAmount(text) ?? 0)} accessibilityLabel={`${name} ${label}`}
                      accessibilityHint="눌러서 실제로 뗀 금액으로 고칠 수 있어요" />
                    <Text style={styles.unit}>원</Text>
                  </View>
                ) : (
                  <NumericText style={styles.readValue}>{actual[key] ? `−${won(actual[key])}` : won(0)}</NumericText>
                )}
              </View>
            </View>
            {editable && edited && (
              <Pressable accessibilityRole="button" accessibilityLabel={`${name} ${label} 예상값으로 되돌리기`} onPress={() => onReset?.(key)}
                hitSlop={8} style={styles.reset}>
                <Text style={styles.resetText}>예상 {won(estimate[key])}으로 되돌리기</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      <View style={styles.divider} />
      <AmountLine label="실수령" amount={won(netOf({ gross, actual }))} strong />
      {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.homeBorder, backgroundColor: Colors.white, paddingHorizontal: 14, paddingVertical: 12, gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  name: { flex: 1, fontSize: Type.md, fontWeight: '700', color: Colors.black },
  days: { fontSize: Type.sm, color: Colors.gray400 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, gap: 8 },
  label: { fontSize: Type.sm, color: Colors.gray600 },
  valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  tag: { backgroundColor: Colors.bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { fontSize: Type.xs, fontWeight: '700', color: Colors.action },
  inputBox: { flexDirection: 'row', alignItems: 'center', minWidth: 96, minHeight: 40, borderBottomWidth: 1, borderBottomColor: Colors.gray200, borderStyle: 'dashed' },
  inputEdited: { borderBottomColor: Colors.action, borderStyle: 'solid' },
  input: { minWidth: 64, textAlign: 'right', fontSize: Type.base, fontWeight: '600', color: Colors.black, paddingVertical: 6 },
  unit: { fontSize: Type.base, fontWeight: '600', color: Colors.gray600, marginLeft: 4 },
  readValue: { fontSize: Type.base, fontWeight: '600', color: Colors.black },
  reset: { alignSelf: 'flex-end', minHeight: 28, justifyContent: 'center' },
  resetText: { fontSize: Type.xs + 1, fontWeight: '600', color: Colors.action },
  divider: { height: 1, backgroundColor: Colors.hairline, marginVertical: 4 },
  error: { fontSize: Type.sm, color: Colors.negative, marginTop: 4 },
});

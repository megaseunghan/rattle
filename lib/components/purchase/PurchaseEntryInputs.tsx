/* design-system: DESIGN.md — 입력 카드 맨 위 [금액별 | 품목별] 전환과 카테고리별 금액 줄 */
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { ui, won } from './PurchaseUi';

export type EntryMode = 'amounts' | 'items';
const MODES: [EntryMode, string][] = [['amounts', '금액별'], ['items', '품목별']];

export function EntryModeSegment({ mode, onChange }: { mode: EntryMode; onChange: (mode: EntryMode) => void }) {
  return <View accessibilityRole="radiogroup" accessibilityLabel="입력 방식" style={styles.seg}>
    {MODES.map(([value, label]) => <TouchableOpacity key={value} accessibilityRole="radio" accessibilityState={{ checked: mode === value }}
      style={[styles.segButton, mode === value && styles.segOn]} onPress={() => onChange(value)}>
      <Text style={[styles.segText, mode === value && styles.segTextOn]}>{label}</Text>
    </TouchableOpacity>)}
  </View>;
}

/** 금액 칸. 값은 숫자만 보관하고 화면에는 천 단위 쉼표로 보여준다. */
export function AmountLine({ label, value, onChange, changed = false, onFocus, editable = true }: {
  label: string; value: string; onChange: (digits: string) => void; changed?: boolean; onFocus?: (target: unknown) => void; editable?: boolean;
}) {
  return <View style={[styles.amountLine, ui.rowLine]}>
    <Text style={styles.amountLabel}>{label}</Text>
    <TextInput style={[ui.input, styles.amountInput, changed && styles.changed]} accessibilityLabel={`${label} 금액`} keyboardType="number-pad"
      value={value ? won(Number(value)) : ''} placeholder="0원" placeholderTextColor={Colors.gray400} maxLength={17} editable={editable}
      onFocus={event => onFocus?.(event.currentTarget)} onChangeText={text => onChange(text.replace(/\D/g, ''))} />
  </View>;
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', backgroundColor: Colors.segmentTrack, borderRadius: 14, padding: 4, marginTop: 10, marginBottom: 8 },
  segButton: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: Colors.white, shadowColor: Colors.black, shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontFamily: Fonts.wantedSemiBold, fontSize: 15, color: Colors.gray500 },
  segTextOn: { color: Colors.action },
  amountLine: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  amountLabel: { flex: 1, fontFamily: Fonts.wantedMedium, fontSize: 15, color: Colors.black },
  amountInput: { width: 150, textAlign: 'right', fontSize: 16 },
  changed: { borderColor: Colors.primary },
});

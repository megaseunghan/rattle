/* design-system: DESIGN.md — 소제목 없는 4열 은행 버튼 + 맨 끝 '직접 입력'. 버튼엔 짧은 이름, 접근성 라벨·저장 값은 정식 이름. */
import { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { Radius, Type } from '../../../constants/designTokens';
import { BANK_OPTIONS, isListedBank, OTHER_BANK_LABEL } from './banks';

const COLUMNS = 4;
const GAP = 8;

export interface BankGridProps {
  /** 저장 값(정식 이름). 목록에 없으면 '직접 입력'으로 보여 준다. */
  value: string;
  onChange: (name: string) => void;
  disabled?: boolean;
}

export function BankGrid({ value, onChange, disabled = false }: BankGridProps) {
  const [width, setWidth] = useState(0);
  const [other, setOther] = useState(() => !!value.trim() && !isListedBank(value));
  const cell = width > 0 ? Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS) : undefined;
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  function pick(name: string) { setOther(false); onChange(name); }
  function pickOther() { if (!other) { setOther(true); onChange(''); } }

  return <View>
    <View style={styles.grid} onLayout={onLayout} accessibilityRole="radiogroup" accessibilityLabel="은행">
      {BANK_OPTIONS.map(bank => {
        const selected = !other && value.trim() === bank.name;
        return <Pressable key={bank.name} accessibilityRole="radio" accessibilityLabel={bank.name}
          accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={() => pick(bank.name)}
          style={({ pressed }) => [styles.cell, cell != null && { width: cell }, selected && styles.selected, pressed && styles.pressed]}>
          <Text style={[styles.text, selected && styles.selectedText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{bank.short}</Text>
        </Pressable>;
      })}
      <Pressable accessibilityRole="radio" accessibilityLabel={OTHER_BANK_LABEL} accessibilityState={{ checked: other, disabled }}
        disabled={disabled} onPress={pickOther}
        style={({ pressed }) => [styles.cell, cell != null && { width: cell }, other && styles.selected, pressed && styles.pressed]}>
        <Text style={[styles.text, other && styles.selectedText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{OTHER_BANK_LABEL}</Text>
      </Pressable>
    </View>
    {other && <View style={styles.inputWrap}>
      <TextInput accessibilityLabel="은행 이름" value={value} onChangeText={onChange} editable={!disabled}
        placeholder="정확한 기관 이름" placeholderTextColor={Colors.gray400} maxLength={50} autoCorrect={false}
        style={styles.input} />
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  cell: { width: '22%', minHeight: 48, borderRadius: Radius.md, backgroundColor: Colors.chipBg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  selected: { backgroundColor: Colors.bg },
  pressed: { opacity: 0.7 },
  text: { fontFamily: Fonts.wantedMedium, fontSize: Type.sm, color: Colors.gray700 },
  selectedText: { fontFamily: Fonts.wantedSemiBold, color: Colors.action },
  inputWrap: { marginTop: 16, borderBottomWidth: 1.5, borderBottomColor: Colors.action },
  input: { minHeight: 48, fontFamily: Fonts.wantedMedium, fontSize: Type.lg, color: Colors.black, paddingVertical: 8 },
});

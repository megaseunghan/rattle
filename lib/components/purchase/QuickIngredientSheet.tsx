/* design-system: DESIGN.md — 매입 품목 검색 결과가 없을 때 그 이름으로 재고 품목을 바로 등록 */
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { SheetModal } from '../ui/SheetModal';
import { PURCHASE_UNITS } from '../PurchaseReceiptRows';

/** 매입 단위에 재고에서만 쓰는 ml를 더한다. 단위 이름이 화면마다 달라지지 않게 매입 목록을 기준으로 둔다. */
const STOCK_UNITS: string[] = [...PURCHASE_UNITS, 'ml'];
const DEFAULT_UNIT = 'g';
const PREFERRED_CATEGORY = '식자재';

/** initialUnit: 품목 행에서 이미 고른 단위. 재고 품목은 단위가 고정되므로 그대로 이어받는다. */
export function QuickIngredientSheet({ visible, initialName, initialUnit, categories, adding, onCancel, onSubmit }: {
  visible: boolean; initialName: string; initialUnit?: string; categories: string[]; adding: boolean;
  onCancel: () => void; onSubmit: (input: { name: string; category: string; unit: string }) => void;
}) {
  const firstCategory = categories.includes(PREFERRED_CATEGORY) ? PREFERRED_CATEGORY : categories[0] ?? '';
  const firstUnit = initialUnit && STOCK_UNITS.includes(initialUnit) ? initialUnit : DEFAULT_UNIT;
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(firstCategory);
  const [unit, setUnit] = useState(firstUnit);
  useEffect(() => { if (visible) { setName(initialName); setCategory(firstCategory); setUnit(firstUnit); } }, [visible, initialName, firstCategory, firstUnit]);
  return <SheetModal visible={visible} onRequestClose={() => { if (!adding) onCancel(); }}>
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" style={styles.headerButton} disabled={adding} onPress={onCancel}><Text style={styles.cancel}>취소</Text></TouchableOpacity>
          <Text style={styles.title}>새 품목 등록</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.headerButton} disabled={adding} onPress={() => onSubmit({ name, category, unit })}><Text style={styles.confirm}>추가</Text></TouchableOpacity>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
          <Text style={styles.label}>품목명</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="예: 삼겹살" placeholderTextColor={Colors.gray400} autoFocus accessibilityLabel="품목명" />
          <Text style={styles.label}>카테고리</Text>
          <ChoiceRow options={categories} value={category} onChange={setCategory} />
          <Text style={styles.label}>단위</Text>
          <ChoiceRow options={STOCK_UNITS} value={unit} onChange={setUnit} />
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  </SheetModal>;
}

function ChoiceRow({ options, value, onChange }: { options: string[]; value: string; onChange: (value: string) => void }) {
  return <View style={styles.chips}>{options.map(option => <TouchableOpacity key={option} accessibilityRole="radio" accessibilityState={{ checked: value === option }}
    style={[styles.chip, value === option && styles.chipOn]} onPress={() => onChange(option)}>
    <Text style={[styles.chipText, value === option && styles.chipTextOn]}>{option}</Text>
  </TouchableOpacity>)}</View>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.homeCanvas, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.homeBorder },
  headerButton: { minWidth: 44, minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  title: { fontFamily: Fonts.wantedBold, fontSize: 17, color: Colors.black },
  cancel: { fontFamily: Fonts.wantedMedium, fontSize: 15, color: Colors.gray500 },
  confirm: { fontFamily: Fonts.wantedBold, fontSize: 15, color: Colors.action },
  form: { padding: 20, paddingBottom: 40 },
  label: { fontFamily: Fonts.wantedSemiBold, fontSize: 13, color: Colors.gray700, marginBottom: 8, marginTop: 14 },
  input: { backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.homeBorder, paddingHorizontal: 14, minHeight: 44, fontFamily: Fonts.wantedMedium, fontSize: 15, color: Colors.black },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minWidth: 44, minHeight: 44, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.homeBorder, backgroundColor: Colors.white, justifyContent: 'center', alignItems: 'center' },
  chipOn: { backgroundColor: Colors.tinted, borderColor: Colors.primary },
  chipText: { fontFamily: Fonts.wantedSemiBold, fontSize: 13, color: Colors.gray600 },
  chipTextOn: { color: Colors.action },
});

import { getErrorMessage } from '../../lib/utils/error';
import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { useCategories } from '../../lib/hooks/useCategories';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';

import { STOCK_UNITS } from '../../lib/utils/unit';

export default function NewIngredientScreen() {
  const { store } = useAuth();
  const { create } = useIngredients();
  const { categories } = useCategories();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState<string>(STOCK_UNITS[0]);
  const [currentStock, setCurrentStock] = useState('0');
  const [minStock, setMinStock] = useState('0');
  const [lastPrice, setLastPrice] = useState('0');
  const [submitting, setSubmitting] = useState(false);

  const isDirty = name.trim().length > 0 || category.trim().length > 0
    || currentStock !== '0' || minStock !== '0' || lastPrice !== '0';
  const bypassLeaveGuard = useConfirmLeave(isDirty, { message: '지금 나가면 입력한 재고 정보가 저장되지 않아요.' });

  async function handleSubmit() {
    if (!name.trim()) {
      Alert.alert('입력 오류', '식자재명을 입력해주세요.');
      return;
    }
    if (!store) return;

    setSubmitting(true);
    try {
      await create({
        store_id: store.id,
        name: name.trim(),
        category: category.trim() || '기타',
        unit,
        current_stock: parseFloat(currentStock) || 0,
        min_stock: parseFloat(minStock) || 0,
        last_price: parseFloat(lastPrice) || 0,
      });
      bypassLeaveGuard();
      router.back();
    } catch (e: any) {
      Alert.alert('오류', getErrorMessage(e, '식자재 등록에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="뒤로">
          <Ionicons name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>새 식자재</Text>
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.submitText}>{submitting ? '등록 중...' : '등록'}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.label}>식자재명 *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="예) 원두, 우유, 설탕"
            placeholderTextColor={Colors.gray400}
          />

          <Text style={styles.label}>카테고리</Text>
          <View style={styles.categoryChips}>
            {categories.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.categoryChip, category === c && styles.categoryChipActive]}
                onPress={() => setCategory(category === c ? '' : c)}
              >
                <Text style={[styles.categoryChipText, category === c && styles.categoryChipTextActive]}>
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>단위 *</Text>
          <View style={styles.unitPresets}>
            {STOCK_UNITS.map(u => (
              <TouchableOpacity
                key={u}
                style={[styles.unitChip, unit === u && styles.unitChipActive]}
                onPress={() => setUnit(u)}
              >
                <Text style={[styles.unitChipText, unit === u && styles.unitChipTextActive]}>
                  {u}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.unitHelp}>레시피에서는 g·mL 등으로 입력하면 자동 환산돼요</Text>

          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.label}>개수 (현재 재고)</Text>
              <TextInput
                style={styles.input}
                value={currentStock}
                onChangeText={setCurrentStock}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Colors.gray400}
              />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.label}>품절 임박 기준</Text>
              <TextInput
                style={styles.input}
                value={minStock}
                onChangeText={setMinStock}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Colors.gray400}
              />
            </View>
          </View>

          <Text style={styles.label}>가격 (1{unit || '개'}당, 원)</Text>
          <TextInput
            style={styles.input}
            value={lastPrice}
            onChangeText={setLastPrice}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={Colors.gray400}
          />

          <View style={styles.hint}>
            <Text style={styles.hintText}>
              현재 재고가 품절 임박 기준 이하일 때 재고 탭에서 경고가 표시됩니다
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backButton: { width: 44, height: 44, justifyContent: 'center' },
  container: { flex: 1, backgroundColor: Colors.homeCanvas},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.homeCanvas,
    borderBottomWidth: 0,
    borderBottomColor: Colors.homeBorder,
  },
  title: { fontSize: 22, fontWeight: '700', color: Colors.black, flexShrink: 1 },
  submitBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 14, minHeight: 44, justifyContent: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.gray700, marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.black, minHeight: 44 },
  categoryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    backgroundColor: Colors.white, minHeight: 44, justifyContent: 'center' },
  categoryChipActive: { borderColor: Colors.primary, backgroundColor: Colors.bg },
  categoryChipText: { fontSize: 14, color: Colors.gray600 },
  categoryChipTextActive: { color: Colors.primary, fontWeight: '700' },
  unitPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  unitChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    backgroundColor: Colors.white, minHeight: 44, justifyContent: 'center' },
  unitChipActive: { borderColor: Colors.primary, backgroundColor: Colors.bg },
  unitChipText: { fontSize: 14, color: Colors.gray600 },
  unitChipTextActive: { color: Colors.primary, fontWeight: '700' },
  unitHelp: { fontSize: 13, color: Colors.gray500, marginTop: 2 },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  hint: {
    marginTop: 24,
    backgroundColor: Colors.bg,
    borderRadius: 10,
    padding: 14,
  },
  hintText: { fontSize: 13, color: Colors.dark, lineHeight: 18 },
});

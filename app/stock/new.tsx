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
import { Colors } from '../../constants/colors';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { useAuth } from '../../lib/contexts/AuthContext';

const UNIT_PRESETS = ['g', 'kg', '개', 'L', 'mL', '봉', '팩', '병'];

export default function NewIngredientScreen() {
  const { store } = useAuth();
  const { create } = useIngredients();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('g');
  const [currentStock, setCurrentStock] = useState('0');
  const [minStock, setMinStock] = useState('0');
  const [lastPrice, setLastPrice] = useState('0');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) {
      Alert.alert('입력 오류', '식자재명을 입력해주세요.');
      return;
    }
    if (!unit.trim()) {
      Alert.alert('입력 오류', '단위를 입력해주세요.');
      return;
    }
    if (!store) return;

    setSubmitting(true);
    try {
      await create({
        store_id: store.id,
        name: name.trim(),
        category: category.trim() || '기타',
        unit: unit.trim(),
        current_stock: parseFloat(currentStock) || 0,
        min_stock: parseFloat(minStock) || 0,
        last_price: parseFloat(lastPrice) || 0,
      });
      router.back();
    } catch (e: any) {
      Alert.alert('오류', e.message ?? '식자재 등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 뒤로</Text>
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
          <TextInput
            style={styles.input}
            value={category}
            onChangeText={setCategory}
            placeholder="예) 음료재료, 식품, 소모품"
            placeholderTextColor={Colors.gray400}
          />

          <Text style={styles.label}>단위 *</Text>
          <View style={styles.unitPresets}>
            {UNIT_PRESETS.map(u => (
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
          <TextInput
            style={[styles.input, styles.unitInput]}
            value={unit}
            onChangeText={setUnit}
            placeholder="직접 입력"
            placeholderTextColor={Colors.gray400}
          />

          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.label}>현재 재고</Text>
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

          <Text style={styles.label}>최근 단가 (원/{unit || '단위'})</Text>
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
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  back: { fontSize: 15, color: Colors.primary, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.black },
  submitBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 9,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.gray700, marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: Colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.gray200,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.black,
  },
  unitPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  unitChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  unitChipActive: { borderColor: Colors.primary, backgroundColor: Colors.bg },
  unitChipText: { fontSize: 14, color: Colors.gray600 },
  unitChipTextActive: { color: Colors.primary, fontWeight: '700' },
  unitInput: { marginTop: 0 },
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

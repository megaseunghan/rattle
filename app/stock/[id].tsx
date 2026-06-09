import { useState, useEffect } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { useCategories } from '../../lib/hooks/useCategories';
import { getIngredientById } from '../../lib/services/ingredients';
import { Ingredient } from '../../types';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { ErrorMessage } from '../../lib/components/ErrorMessage';

const UNIT_PRESETS = ['g', 'kg', '개', 'L', 'mL', '봉', '팩', '병'];

export default function EditIngredientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { update } = useIngredients();
  const { categories } = useCategories();

  const [ingredient, setIngredient] = useState<Ingredient | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('g');
  const [currentStock, setCurrentStock] = useState('0');
  const [minStock, setMinStock] = useState('0');
  const [lastPrice, setLastPrice] = useState('0');
  const [containerUnit, setContainerUnit] = useState('');
  const [containerSize, setContainerSize] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    setFetchLoading(true);
    getIngredientById(id)
      .then((item) => {
        setIngredient(item);
        setName(item.name);
        setCategory(item.category);
        setUnit(item.unit);
        setCurrentStock(String(item.current_stock));
        setMinStock(String(item.min_stock));
        setLastPrice(String(item.last_price));
        setContainerUnit(item.container_unit ?? '');
        setContainerSize(item.container_size ? String(item.container_size) : '');
      })
      .catch((e) => setFetchError(e.message ?? '식자재를 불러오지 못했습니다.'))
      .finally(() => setFetchLoading(false));
  }, [id]);

  if (fetchLoading) return <SafeAreaView style={styles.container}><LoadingSpinner /></SafeAreaView>;
  if (fetchError) return <SafeAreaView style={styles.container}><ErrorMessage message={fetchError} /></SafeAreaView>;
  if (!ingredient) return <SafeAreaView style={styles.container}><ErrorMessage message="식자재를 찾을 수 없습니다." /></SafeAreaView>;

  async function handleSubmit() {
    if (!name.trim()) {
      Alert.alert('입력 오류', '식자재명을 입력해주세요.');
      return;
    }
    if (!unit.trim()) {
      Alert.alert('입력 오류', '단위를 입력해주세요.');
      return;
    }
    if (containerUnit.trim() && !containerSize) {
      Alert.alert('입력 오류', '용량 단위를 입력하려면 1개당 용량도 입력해주세요.');
      return;
    }
    const parsedSize = containerSize ? parseFloat(containerSize) : null;
    if (parsedSize !== null && (isNaN(parsedSize) || parsedSize <= 0)) {
      Alert.alert('입력 오류', '1개당 용량은 0보다 큰 숫자여야 합니다.');
      return;
    }
    setSubmitting(true);
    try {
      await update(id!, {
        name: name.trim(),
        category: category.trim() || '기타',
        unit: unit.trim(),
        current_stock: parseFloat(currentStock) || 0,
        min_stock: parseFloat(minStock) || 0,
        last_price: parseFloat(lastPrice) || 0,
        container_unit: containerUnit.trim() || null,
        container_size: parsedSize,
      });
      router.back();
    } catch (e: any) {
      Alert.alert('오류', e.message ?? '수정에 실패했습니다.');
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
        <Text style={styles.title}>식자재 수정</Text>
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.submitText}>{submitting ? '저장 중...' : '저장'}</Text>
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
            {UNIT_PRESETS.map(u => (
              <TouchableOpacity
                key={u}
                style={[styles.unitChip, unit === u && styles.unitChipActive]}
                onPress={() => setUnit(u)}
              >
                <Text style={[styles.unitChipText, unit === u && styles.unitChipTextActive]}>{u}</Text>
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

          <View style={styles.containerSection}>
            <Text style={styles.containerSectionTitle}>개당 용량 & 단위 (선택)</Text>
            <Text style={styles.containerHint}>
              💡 1{unit || '개'}에 담긴 용량을 입력하면 레시피 원가를 정확히 계산해요 (예: 1박스 = 500 g)
            </Text>
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>1{unit || '개'}당 용량</Text>
                <TextInput
                  style={styles.input}
                  value={containerSize}
                  onChangeText={setContainerSize}
                  keyboardType="numeric"
                  placeholder="예) 500"
                  placeholderTextColor={Colors.gray400}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>용량 단위</Text>
                <TextInput
                  style={styles.input}
                  value={containerUnit}
                  onChangeText={setContainerUnit}
                  placeholder="예) g, mL"
                  placeholderTextColor={Colors.gray400}
                />
              </View>
            </View>
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
  categoryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  categoryChipActive: { borderColor: Colors.primary, backgroundColor: Colors.bg },
  categoryChipText: { fontSize: 14, color: Colors.gray600 },
  categoryChipTextActive: { color: Colors.primary, fontWeight: '700' },
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
  containerSection: {
    marginTop: 24,
    backgroundColor: Colors.bg,
    borderRadius: 12,
    padding: 14,
  },
  containerSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.dark,
    marginBottom: 4,
  },
  containerHint: {
    fontSize: 13,
    color: Colors.dark,
    marginBottom: 12,
    lineHeight: 18,
  },
});

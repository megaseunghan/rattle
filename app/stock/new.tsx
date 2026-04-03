import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { useOrders } from '../../lib/hooks/useOrders';
import { useCategories } from '../../lib/hooks/useCategories';
import { useAuth } from '../../lib/contexts/AuthContext';

const UNIT_PRESETS = ['g', 'kg', '개', 'L', 'mL', '봉', '팩', '병'];

export default function NewIngredientScreen() {
  const { store } = useAuth();
  const { create } = useIngredients();
  const ordersHook = useOrders();
  const { categories } = useCategories();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('g');
  const [currentStock, setCurrentStock] = useState('0');
  const [minStock, setMinStock] = useState('0');
  const [lastPrice, setLastPrice] = useState('0');
  const [containerUnit, setContainerUnit] = useState('');
  const [containerSize, setContainerSize] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const existingSuppliers = [...new Set(ordersHook.data.map(o => o.supplier_name).filter(Boolean))];

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

    if (containerUnit.trim() && !containerSize) {
      Alert.alert('입력 오류', '컨테이너 단위를 설정하려면 크기도 입력해주세요.');
      return;
    }

    const parsedSize = containerSize ? parseFloat(containerSize) : null;
    if (parsedSize !== null && (isNaN(parsedSize) || parsedSize <= 0)) {
      Alert.alert('입력 오류', '컨테이너 크기는 0보다 큰 숫자여야 합니다.');
      return;
    }

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
        container_unit: containerUnit.trim() || null,
        container_size: parsedSize,
        supplier_name: supplierName.trim() || null,
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

          <Text style={styles.label}>거래처 (발주 담당)</Text>
          <View style={styles.supplierRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={supplierName}
              onChangeText={setSupplierName}
              placeholder="예) 서울식품"
              placeholderTextColor={Colors.gray400}
            />
            {existingSuppliers.length > 0 && (
              <TouchableOpacity style={styles.supplierPickerBtn} onPress={() => setShowSupplierPicker(true)}>
                <Text style={styles.supplierPickerBtnText}>목록</Text>
              </TouchableOpacity>
            )}
          </View>

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

          <View style={styles.containerSection}>
            <Text style={styles.containerSectionTitle}>컨테이너 단위 설정</Text>
            <Text style={styles.containerHint}>
              💡 설정하면 발주·재고를 통/박스 단위로 표시할 수 있어요
            </Text>
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>컨테이너 단위</Text>
                <TextInput
                  style={styles.input}
                  value={containerUnit}
                  onChangeText={setContainerUnit}
                  placeholder="예) 통, 박스, 봉"
                  placeholderTextColor={Colors.gray400}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>1{containerUnit || '단위'} = ({unit})</Text>
                <TextInput
                  style={styles.input}
                  value={containerSize}
                  onChangeText={setContainerSize}
                  keyboardType="numeric"
                  placeholder="예) 5000"
                  placeholderTextColor={Colors.gray400}
                />
              </View>
            </View>
          </View>

          <View style={styles.hint}>
            <Text style={styles.hintText}>
              현재 재고가 품절 임박 기준 이하일 때 재고 탭에서 경고가 표시됩니다
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal visible={showSupplierPicker} animationType="slide" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowSupplierPicker(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.supplierSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>거래처 선택</Text>
              <TouchableOpacity onPress={() => setShowSupplierPicker(false)}>
                <Text style={styles.modalClose}>닫기</Text>
              </TouchableOpacity>
            </View>
            {existingSuppliers.map(s => (
              <TouchableOpacity
                key={s}
                style={styles.supplierItem}
                onPress={() => { setSupplierName(s); setShowSupplierPicker(false); }}
              >
                <Text style={styles.supplierItemText}>{s}</Text>
                {supplierName === s && <Text style={styles.supplierItemCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  hint: {
    marginTop: 24,
    backgroundColor: Colors.bg,
    borderRadius: 10,
    padding: 14,
  },
  hintText: { fontSize: 13, color: Colors.dark, lineHeight: 18 },
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
  supplierRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  supplierPickerBtn: {
    paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10,
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.pale,
  },
  supplierPickerBtnText: { fontSize: 13, color: Colors.dark, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  supplierSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.black },
  modalClose: { fontSize: 15, color: Colors.primary, fontWeight: '600' },
  supplierItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  supplierItemText: { fontSize: 15, color: Colors.black },
  supplierItemCheck: { fontSize: 16, color: Colors.primary, fontWeight: '700' },
});

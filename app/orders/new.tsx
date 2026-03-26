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
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useOrders } from '../../lib/hooks/useOrders';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { Ingredient } from '../../types';

const CATEGORIES = ['식자재', '주류', '비품소모품', '기타'];
const FILTER_CATEGORIES = ['전체', ...CATEGORIES];
const COMMON_UNITS = ['g', 'kg', 'ml', 'L', '개', '병', '봉', '박스'];

interface OrderItemForm {
  ingredient: Ingredient;
  quantity: string;
  unit_price: string;
}

export default function NewOrderScreen() {
  const { store } = useAuth();
  const { create } = useOrders();
  const { data: ingredients, create: createIngredient } = useIngredients();

  const [supplierName, setSupplierName] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<OrderItemForm[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('전체');
  const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(new Set());

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickCategory, setQuickCategory] = useState('식자재');
  const [quickUnit, setQuickUnit] = useState('g');
  const [quickAdding, setQuickAdding] = useState(false);

  function closePicker() {
    setShowPicker(false);
    setShowQuickAdd(false);
    setSearchQuery('');
    setActiveCategory('전체');
    setSelectedIngredients(new Set());
  }

  async function handleQuickAdd() {
    if (!quickName.trim()) {
      Alert.alert('입력 오류', '품목명을 입력해주세요.');
      return;
    }
    if (!store) return;
    setQuickAdding(true);
    try {
      await createIngredient({
        store_id: store.id,
        name: quickName.trim(),
        category: quickCategory,
        unit: quickUnit,
        current_stock: 0,
        min_stock: 0,
        last_price: 0,
      });
      setShowQuickAdd(false);
      setQuickName('');
      setQuickCategory('식자재');
      setQuickUnit('g');
      Alert.alert('등록 완료', `"${quickName.trim()}"이(가) 재고에 추가되었어요.\n목록에서 선택해주세요.`);
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setQuickAdding(false);
    }
  }

  function addIngredient(ingredient: Ingredient) {
    const alreadyAdded = items.some(i => i.ingredient.id === ingredient.id);
    if (!alreadyAdded) {
      setItems(prev => [
        ...prev,
        {
          ingredient,
          quantity: '1',
          unit_price: String(ingredient.last_price ?? 0),
        },
      ]);
    }
  }

  function toggleIngredient(ingredient: Ingredient) {
    const already = items.some(i => i.ingredient.id === ingredient.id);
    if (already) return;
    setSelectedIngredients(prev => {
      const next = new Set(prev);
      if (next.has(ingredient.id)) {
        next.delete(ingredient.id);
      } else {
        next.add(ingredient.id);
      }
      return next;
    });
  }

  function handleBulkAdd() {
    const toAdd = ingredients.filter(
      ing => selectedIngredients.has(ing.id) && !items.some(i => i.ingredient.id === ing.id)
    );
    toAdd.forEach(ing => addIngredient(ing));
    closePicker();
  }

  function removeItem(ingredientId: string) {
    setItems(prev => prev.filter(i => i.ingredient.id !== ingredientId));
  }

  function updateItem(ingredientId: string, field: 'quantity' | 'unit_price', value: string) {
    setItems(prev =>
      prev.map(i => (i.ingredient.id === ingredientId ? { ...i, [field]: value } : i))
    );
  }

  async function handleSubmit() {
    if (!supplierName.trim()) {
      Alert.alert('입력 오류', '거래처명을 입력해주세요.');
      return;
    }
    if (items.length === 0) {
      Alert.alert('입력 오류', '발주 항목을 1개 이상 추가해주세요.');
      return;
    }

    setSubmitting(true);
    try {
      await create(
        supplierName.trim(),
        orderDate,
        items.map(i => ({
          ingredient_id: i.ingredient.id,
          quantity: parseFloat(i.quantity) || 0,
          unit: i.ingredient.unit,
          unit_price: parseFloat(i.unit_price) || 0,
        }))
      );
      router.back();
    } catch (e: any) {
      Alert.alert('오류', e.message ?? '발주 등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  const filteredIngredients = ingredients.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory = activeCategory === '전체' || item.category === activeCategory;
    return matchSearch && matchCategory;
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 뒤로</Text>
        </TouchableOpacity>
        <Text style={styles.title}>새 발주</Text>
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
          <Text style={styles.label}>거래처명</Text>
          <TextInput
            style={styles.input}
            value={supplierName}
            onChangeText={setSupplierName}
            placeholder="거래처명 입력"
            placeholderTextColor={Colors.gray400}
          />

          <Text style={styles.label}>발주일</Text>
          <TextInput
            style={styles.input}
            value={orderDate}
            onChangeText={setOrderDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.gray400}
          />

          <View style={styles.itemsHeader}>
            <Text style={styles.label}>발주 항목</Text>
            <TouchableOpacity style={styles.addItemBtn} onPress={() => setShowPicker(true)}>
              <Text style={styles.addItemText}>+ 추가</Text>
            </TouchableOpacity>
          </View>

          {items.length === 0 ? (
            <View style={styles.emptyItems}>
              <Text style={styles.emptyItemsText}>식자재를 추가해주세요</Text>
            </View>
          ) : (
            items.map(item => (
              <View key={item.ingredient.id} style={styles.orderItem}>
                <View style={styles.orderItemTop}>
                  <Text style={styles.orderItemName}>{item.ingredient.name}</Text>
                  <TouchableOpacity onPress={() => removeItem(item.ingredient.id)}>
                    <Text style={styles.removeText}>✕</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.orderItemInputs}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>수량 ({item.ingredient.unit})</Text>
                    <TextInput
                      style={styles.smallInput}
                      value={item.quantity}
                      onChangeText={v => updateItem(item.ingredient.id, 'quantity', v)}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>단가 (원)</Text>
                    <TextInput
                      style={styles.smallInput}
                      value={item.unit_price}
                      onChangeText={v => updateItem(item.ingredient.id, 'unit_price', v)}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showPicker} animationType="slide" transparent>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={closePicker}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>식자재 선택</Text>
              <TouchableOpacity onPress={closePicker}>
                <Text style={styles.modalClose}>닫기</Text>
              </TouchableOpacity>
            </View>

            {showQuickAdd ? (
              <ScrollView contentContainerStyle={styles.quickAddForm}>
                <Text style={styles.quickAddTitle}>새 식자재 등록</Text>

                <Text style={styles.quickLabel}>품목명</Text>
                <TextInput
                  style={styles.quickInput}
                  value={quickName}
                  onChangeText={setQuickName}
                  placeholder="예: 삼겹살 500g"
                  placeholderTextColor={Colors.gray400}
                  autoFocus
                />

                <Text style={styles.quickLabel}>카테고리</Text>
                <View style={styles.chipRow}>
                  {CATEGORIES.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.chip, quickCategory === c && styles.chipActive]}
                      onPress={() => setQuickCategory(c)}
                    >
                      <Text style={[styles.chipText, quickCategory === c && styles.chipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.quickLabel}>단위</Text>
                <View style={styles.chipRow}>
                  {COMMON_UNITS.map(u => (
                    <TouchableOpacity
                      key={u}
                      style={[styles.chip, quickUnit === u && styles.chipActive]}
                      onPress={() => setQuickUnit(u)}
                    >
                      <Text style={[styles.chipText, quickUnit === u && styles.chipTextActive]}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.quickActions}>
                  <TouchableOpacity style={styles.quickCancelBtn} onPress={() => setShowQuickAdd(false)}>
                    <Text style={styles.quickCancelText}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.quickSubmitBtn, quickAdding && { opacity: 0.5 }]}
                    onPress={handleQuickAdd}
                    disabled={quickAdding}
                  >
                    <Text style={styles.quickSubmitText}>{quickAdding ? '등록 중...' : '재고에 추가'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : (
              <>
                <View style={styles.searchContainer}>
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="식자재 검색..."
                    placeholderTextColor={Colors.gray400}
                  />
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterTabsContent}
                  style={styles.filterTabsContainer}
                >
                  {FILTER_CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.filterTab, activeCategory === cat && styles.filterTabActive]}
                      onPress={() => setActiveCategory(cat)}
                    >
                      <Text style={[styles.filterTabText, activeCategory === cat && styles.filterTabTextActive]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {filteredIngredients.length === 0 ? (
                  <View style={styles.emptyItems}>
                    <Text style={styles.emptyItemsText}>
                      {ingredients.length === 0 ? '등록된 식자재가 없어요' : '검색 결과가 없어요'}
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={filteredIngredients}
                    keyExtractor={i => i.id}
                    renderItem={({ item }) => {
                      const already = items.some(o => o.ingredient.id === item.id);
                      const checked = selectedIngredients.has(item.id);
                      return (
                        <TouchableOpacity
                          style={[styles.pickerRow, already && styles.pickerRowAdded]}
                          onPress={() => toggleIngredient(item)}
                          disabled={already}
                        >
                          <View style={styles.pickerRowLeft}>
                            <Text style={[styles.pickerName, already && styles.pickerNameAdded]}>
                              {item.name}
                            </Text>
                            <Text style={styles.pickerCategory}>{item.category}</Text>
                          </View>
                          <View style={styles.pickerRowRight}>
                            <Text style={styles.pickerUnit}>{item.unit}</Text>
                            {checked && !already && (
                              <Text style={styles.checkMark}>✓</Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    }}
                  />
                )}

                <TouchableOpacity style={styles.quickAddTrigger} onPress={() => setShowQuickAdd(true)}>
                  <Text style={styles.quickAddTriggerText}>+ 재고에 없는 품목 바로 추가</Text>
                </TouchableOpacity>

                {selectedIngredients.size > 0 && (
                  <TouchableOpacity style={styles.bulkAddBtn} onPress={handleBulkAdd}>
                    <Text style={styles.bulkAddText}>{selectedIngredients.size}개 추가</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
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
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  addItemBtn: {
    backgroundColor: Colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.pale,
  },
  addItemText: { fontSize: 13, color: Colors.dark, fontWeight: '600' },
  emptyItems: {
    backgroundColor: Colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 24,
    alignItems: 'center',
    marginTop: 6,
  },
  emptyItemsText: { color: Colors.gray400, fontSize: 14 },
  orderItem: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 14,
    marginTop: 8,
  },
  orderItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  orderItemName: { fontSize: 15, fontWeight: '600', color: Colors.black },
  removeText: { fontSize: 15, color: Colors.gray400 },
  orderItemInputs: { flexDirection: 'row', gap: 12 },
  inputGroup: { flex: 1 },
  inputLabel: { fontSize: 12, color: Colors.gray500, marginBottom: 4 },
  smallInput: {
    backgroundColor: Colors.gray50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.gray200,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.black,
    textAlign: 'right',
  },
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.black },
  modalClose: { fontSize: 15, color: Colors.primary, fontWeight: '600' },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  searchInput: {
    backgroundColor: Colors.gray50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.gray200,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.black,
  },
  filterTabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  filterTabsContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  filterTabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterTabText: { fontSize: 13, color: Colors.gray600, fontWeight: '600' },
  filterTabTextActive: { color: Colors.white },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  pickerRowAdded: { opacity: 0.4 },
  pickerRowLeft: { flex: 1 },
  pickerRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickerName: { fontSize: 15, color: Colors.black, fontWeight: '500' },
  pickerNameAdded: { color: Colors.gray400 },
  pickerCategory: { fontSize: 12, color: Colors.gray400, marginTop: 2 },
  pickerUnit: { fontSize: 13, color: Colors.gray500 },
  checkMark: { fontSize: 16, color: Colors.primary, fontWeight: '700' },
  quickAddTrigger: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  quickAddTriggerText: { fontSize: 14, color: Colors.primary, fontWeight: '700' },
  bulkAddBtn: {
    margin: 12,
    marginTop: 0,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  bulkAddText: { fontSize: 15, color: Colors.white, fontWeight: '700' },
  quickAddForm: { padding: 20, paddingBottom: 40 },
  quickAddTitle: { fontSize: 16, fontWeight: '700', color: Colors.black, marginBottom: 16 },
  quickLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 8, marginTop: 14 },
  quickInput: {
    backgroundColor: Colors.gray50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.gray200,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: Colors.black,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.gray600, fontWeight: '600' },
  chipTextActive: { color: Colors.white },
  quickActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  quickCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.gray200,
    alignItems: 'center',
  },
  quickCancelText: { fontSize: 14, color: Colors.gray600, fontWeight: '600' },
  quickSubmitBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  quickSubmitText: { fontSize: 14, color: Colors.white, fontWeight: '700' },
});

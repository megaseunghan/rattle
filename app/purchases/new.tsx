import { getErrorMessage } from '../../lib/utils/error';
import { useEffect, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { usePurchases } from '../../lib/hooks/usePurchases';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { Ingredient, PurchaseType } from '../../types';
import { convertQuantity, recipeUnitOptions } from '../../lib/utils/unit';
import { usePurchaseTypes } from '../../lib/hooks/usePurchaseTypes';
import { useCategories } from '../../lib/hooks/useCategories';
import { CategoryManageModal } from '../../lib/components/CategoryManageModal';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';

const COMMON_UNITS = ['g', 'kg', 'ml', 'L', '개', '병', '봉', '박스'];

interface PurchaseItemForm {
  ingredient: Ingredient;
  quantity: string;
  unit: string;       // 입력 단위 (g/kg, mL/L, 개) — 저장 시 재고 단위로 환산
  unit_price: string; // 입력 단위당 단가
}

// 로컬 시간대 기준 YYYY-MM-DD
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseInitialDate(value?: string): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date();
}

export default function NewPurchaseScreen() {
  const { store, currentRole } = useAuth();
  const purchaseTypes = usePurchaseTypes();
  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const params = useLocalSearchParams<{ date?: string }>();
  // 이번 달 매입 훅 (등록 후 refetch 위해 화면 진입 달 기준)
  const yearMonth = formatDate(parseInitialDate(params.date)).slice(0, 7);
  const { purchases, addWithItems, refetch: refetchPurchases } = usePurchases(yearMonth);
  const { data: ingredients, create: createIngredient, refetch: refetchIngredients } = useIngredients();
  const ingredientCategoriesBase = useCategories();
  const [ingredientCategoryModalVisible, setIngredientCategoryModalVisible] = useState(false);
  // 카테고리 이름변경/삭제는 서버의 ingredients.category도 바꾸므로, 캐시된 재료 목록을 즉시 재조회한다
  const ingredientCategories = {
    ...ingredientCategoriesBase,
    rename: async (oldName: string, newName: string) => {
      await ingredientCategoriesBase.rename(oldName, newName);
      await refetchIngredients();
    },
    remove: async (name: string) => {
      await ingredientCategoriesBase.remove(name);
      await refetchIngredients();
    },
  };
  const filterCategories = ['전체', ...ingredientCategories.categories];

  const [supplier, setSupplier] = useState('');
  const [date, setDate] = useState(parseInitialDate(params.date));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [purchaseType, setPurchaseType] = useState<PurchaseType>('');
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (!purchaseTypes.loading && !purchaseTypes.error && !purchaseTypes.types.includes(purchaseType)) {
      setPurchaseType(purchaseTypes.types.includes('수기') ? '수기' : purchaseTypes.types[0] ?? '');
    }
  }, [purchaseTypes.loading, purchaseTypes.error, purchaseTypes.types, purchaseType]);

  // 매입 품목
  const [items, setItems] = useState<PurchaseItemForm[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('전체');
  const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(new Set());

  const isDirty = supplier.trim().length > 0 || items.length > 0;
  const bypassLeaveGuard = useConfirmLeave(isDirty, { message: '지금 나가면 입력한 매입 내용이 저장되지 않아요.' });

  // 새 식자재 빠른 등록
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickCategory, setQuickCategory] = useState('식자재');
  const [quickUnit, setQuickUnit] = useState('g');
  const [quickAdding, setQuickAdding] = useState(false);

  const existingSuppliers = [...new Set(purchases.map(p => p.supplier).filter(Boolean))];

  function closePicker() {
    setShowPicker(false);
    setShowQuickAdd(false);
    setSearchQuery('');
    setActiveCategory('전체');
    setSelectedIngredients(new Set());
  }

  function addIngredient(ingredient: Ingredient) {
    setItems(prev =>
      prev.some(i => i.ingredient.id === ingredient.id)
        ? prev
        : [
            ...prev,
            {
              ingredient,
              quantity: '1',
              unit: ingredient.unit, // 기본 입력 단위 = 재고 단위
              unit_price: String(ingredient.last_price ?? 0),
            },
          ]
    );
  }

  function toggleIngredient(ingredient: Ingredient) {
    if (items.some(i => i.ingredient.id === ingredient.id)) return;
    setSelectedIngredients(prev => {
      const next = new Set(prev);
      next.has(ingredient.id) ? next.delete(ingredient.id) : next.add(ingredient.id);
      return next;
    });
  }

  function handleBulkAdd() {
    ingredients
      .filter(ing => selectedIngredients.has(ing.id) && !items.some(i => i.ingredient.id === ing.id))
      .forEach(addIngredient);
    closePicker();
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.ingredient.id !== id));
  }

  function updateItem(id: string, field: 'quantity' | 'unit_price', value: string) {
    setItems(prev => prev.map(i => (i.ingredient.id === id ? { ...i, [field]: value } : i)));
  }

  function setItemUnit(id: string, unit: string) {
    setItems(prev => prev.map(i => (i.ingredient.id === id ? { ...i, unit } : i)));
  }

  async function handleQuickAdd() {
    if (!quickName.trim()) {
      Alert.alert('입력 오류', '품목명을 입력해주세요.');
      return;
    }
    if (!store) return;
    setQuickAdding(true);
    try {
      const created = await createIngredient({
        store_id: store.id,
        name: quickName.trim(),
        category: quickCategory,
        unit: quickUnit,
        current_stock: 0,
        min_stock: 0,
        last_price: 0,
      });
      addIngredient(created);
      setQuickName('');
      setQuickCategory('식자재');
      setQuickUnit('g');
      closePicker();
    } catch (e: any) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setQuickAdding(false);
    }
  }

  async function handleSubmit() {
    if (purchaseTypes.loading || purchaseTypes.error || !purchaseTypes.types.includes(purchaseType)) {
      Alert.alert('유형 확인', '현재 매입 유형을 불러온 뒤 선택해주세요.'); return;
    }
    if (!supplier.trim()) {
      Alert.alert('입력 오류', '거래처명을 입력해주세요.');
      return;
    }
    setSubmitting(true);
    try {
      if (items.length === 0) {
        Alert.alert('입력 오류', '매입 품목을 1개 이상 추가해주세요.');
        setSubmitting(false);
        return;
      }
      await addWithItems({
        date: formatDate(date),
        supplier: supplier.trim(),
        type: purchaseType,
        items: items.map(i => {
          const qty = parseFloat(i.quantity) || 0;
          const price = parseFloat(i.unit_price) || 0;
          // 입력 단위 → 재고 단위 환산 (예: 5000g → 5kg)
          const factor = convertQuantity(1, i.unit, i.ingredient.unit) || 1;
          return {
            ingredient_id: i.ingredient.id,
            name: i.ingredient.name,
            quantity: qty * factor,             // 재고 단위 기준 수량 → current_stock 증가량
            unit: i.ingredient.unit,            // 재고 단위로 저장
            unit_price: factor !== 0 ? price / factor : price, // 재고 단위당 단가 (합계 보존)
            category: i.ingredient.category,
          };
        }),
      });
      bypassLeaveGuard();
      router.back();
    } catch (e: any) {
      Alert.alert('오류', getErrorMessage(e, '매입 등록에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  }

  const filteredIngredients = ingredients.filter(item => {
    const matchSearch = !searchQuery || item.name.toLowerCase().startsWith(searchQuery.toLowerCase());
    const matchCategory = activeCategory === '전체' || item.category === activeCategory;
    return matchSearch && matchCategory;
  });

  const totalAmount = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0), 0);
  const canSubmit = items.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>매입 등록</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.modeHint}>품목·수량·단가를 입력하면 매입 금액과 재고에 함께 반영돼요.</Text>

          <Text style={styles.label}>거래처명</Text>
          <View style={styles.supplierRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={supplier}
              onChangeText={setSupplier}
              placeholder="예: 쿠팡, 농협"
              placeholderTextColor={Colors.gray400}
            />
            {existingSuppliers.length > 0 && (
              <TouchableOpacity style={styles.supplierPickerBtn} onPress={() => setShowSupplierPicker(true)}>
                <Text style={styles.supplierPickerBtnText}>목록</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.label}>매입일</Text>
          <TouchableOpacity style={styles.dateInput} onPress={() => setShowDatePicker(p => !p)} activeOpacity={0.7}>
            <Text style={styles.dateText}>{formatDate(date)}</Text>
            <Ionicons name="calendar-outline" size={18} color={Colors.gray500} />
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={date}
              mode="date"
              locale="ko-KR"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(_, d) => {
                if (Platform.OS === 'android') setShowDatePicker(false);
                if (d) setDate(d);
              }}
            />
          )}

          <View style={styles.amountLabelRow}>
            <Text style={styles.label}>유형</Text>
            {currentRole === 'admin' && <TouchableOpacity onPress={() => setTypeModalVisible(true)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: Colors.primary }}>유형 관리</Text>
            </TouchableOpacity>}
          </View>
          {purchaseTypes.error && <Text style={{ color: Colors.negative }}>{purchaseTypes.error}</Text>}
          <View style={styles.chipRow}>
            {purchaseTypes.types.map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, purchaseType === t && styles.chipActive]}
                onPress={() => setPurchaseType(t)}
              >
                <Text style={[styles.chipText, purchaseType === t && styles.chipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.itemsHeader}>
            <Text style={styles.label}>매입 품목</Text>
            <TouchableOpacity style={styles.addItemBtn} onPress={() => setShowPicker(true)}>
              <Text style={styles.addItemText}>+ 추가</Text>
            </TouchableOpacity>
          </View>

          {items.length === 0 ? (
            <View style={styles.emptyItems}>
              <Text style={styles.emptyItemsText}>품목을 추가해주세요</Text>
            </View>
          ) : (
            items.map(item => (
              <View key={item.ingredient.id} style={styles.itemCard}>
                <View style={styles.itemCardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.ingredient.name}</Text>
                    <Text style={styles.itemCategory}>{item.ingredient.category}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeItem(item.ingredient.id)}>
                    <Ionicons name="close" size={16} color={Colors.gray400} />
                  </TouchableOpacity>
                </View>
                {(() => {
                  const unitOptions = recipeUnitOptions(item.ingredient.unit);
                  return (
                    <>
                      {unitOptions.length > 1 && (
                        <View style={styles.unitToggleRow}>
                          {unitOptions.map(u => (
                            <TouchableOpacity
                              key={u}
                              style={[styles.unitToggle, item.unit === u && styles.unitToggleActive]}
                              onPress={() => setItemUnit(item.ingredient.id, u)}
                            >
                              <Text style={[styles.unitToggleText, item.unit === u && styles.unitToggleTextActive]}>{u}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                      <View style={styles.itemInputs}>
                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>수량 ({item.unit})</Text>
                          <TextInput
                            style={styles.smallInput}
                            value={item.quantity}
                            onChangeText={v => updateItem(item.ingredient.id, 'quantity', v)}
                            keyboardType="numeric"
                          />
                        </View>
                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>단가 (원/{item.unit})</Text>
                          <TextInput
                            style={styles.smallInput}
                            value={item.unit_price}
                            onChangeText={v => updateItem(item.ingredient.id, 'unit_price', v)}
                            keyboardType="numeric"
                          />
                        </View>
                      </View>
                    </>
                  );
                })()}
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 하단 고정 바 */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomTotal}>
          <Text style={styles.bottomTotalLabel}>합계</Text>
          <Text style={styles.bottomTotalValue}>{Math.round(totalAmount).toLocaleString('ko-KR')}원</Text>
        </View>
        <TouchableOpacity
          style={[styles.bottomSubmit, (submitting || !canSubmit) && styles.bottomSubmitDisabled]}
          onPress={handleSubmit}
          disabled={submitting || !canSubmit}
        >
          <Text style={styles.bottomSubmitText}>
            {submitting ? '등록 중...' : items.length > 0 ? `매입 등록 (${items.length})` : '매입 등록'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 거래처 선택 모달 */}
      <Modal visible={showSupplierPicker} animationType="slide" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowSupplierPicker(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.supplierSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>거래처 선택</Text>
              <TouchableOpacity onPress={() => setShowSupplierPicker(false)}>
                <Text style={styles.modalClose}>닫기</Text>
              </TouchableOpacity>
            </View>
            {existingSuppliers.map(name => (
              <TouchableOpacity
                key={name}
                style={styles.supplierItem}
                onPress={() => {
                  setSupplier(name);
                  setShowSupplierPicker(false);
                }}
              >
                <Text style={styles.supplierItemText}>{name}</Text>
                {supplier === name && <Ionicons name="checkmark" size={18} color={Colors.primary} />}
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 식자재 선택 모달 */}
      <Modal visible={showPicker} animationType="slide" transparent onRequestClose={closePicker}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closePicker} accessible={false}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.modalSheet} accessible={false}>
            <View style={styles.modalHeader}>
              {showQuickAdd ? (
                <>
                  <TouchableOpacity onPress={() => setShowQuickAdd(false)} hitSlop={8}>
                    <Text style={styles.modalCancel}>취소</Text>
                  </TouchableOpacity>
                  <Text style={styles.modalTitle}>새 품목 등록</Text>
                  <TouchableOpacity onPress={handleQuickAdd} disabled={quickAdding} hitSlop={8}>
                    <Text style={styles.modalClose}>{quickAdding ? '등록 중...' : '추가'}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.modalTitle}>품목 선택</Text>
                  <TouchableOpacity onPress={closePicker} hitSlop={8}>
                    <Text style={styles.modalClose}>닫기</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {showQuickAdd ? (
              <ScrollView contentContainerStyle={styles.quickAddForm}>
                <Text style={styles.quickLabel}>품목명</Text>
                <TextInput
                  style={styles.quickInput}
                  value={quickName}
                  onChangeText={setQuickName}
                  placeholder="예: 삼겹살"
                  placeholderTextColor={Colors.gray400}
                  autoFocus
                />

                <Text style={styles.quickLabel}>카테고리</Text>
                <View style={styles.chipRow}>
                  {ingredientCategories.categories.map(c => (
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

              </ScrollView>
            ) : (
              <>
                <View style={styles.searchContainer}>
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="품목 검색..."
                    placeholderTextColor={Colors.gray400}
                  />
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterTabsContent}
                  style={styles.filterTabsContainer}
                >
                  {filterCategories.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.filterTab, activeCategory === cat && styles.filterTabActive]}
                      onPress={() => setActiveCategory(cat)}
                    >
                      <Text style={[styles.filterTabText, activeCategory === cat && styles.filterTabTextActive]} numberOfLines={1}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={styles.filterTabManageBtn}
                    onPress={() => { setShowPicker(false); setIngredientCategoryModalVisible(true); }}
                    hitSlop={8}
                  >
                    <Ionicons name="add" size={16} color={Colors.gray600} />
                  </TouchableOpacity>
                </ScrollView>

                {filteredIngredients.length === 0 ? (
                  <View style={styles.emptyItems}>
                    <Text style={styles.emptyItemsText}>
                      {ingredients.length === 0 ? '등록된 품목이 없어요' : '검색 결과가 없어요'}
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
                            <Text style={[styles.pickerName, already && styles.pickerNameAdded]}>{item.name}</Text>
                            <Text style={styles.pickerCategory}>{item.category}</Text>
                          </View>
                          <View style={styles.pickerRowRight}>
                            <Text style={styles.pickerUnit}>{item.unit}</Text>
                            {checked && !already && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
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

      <CategoryManageModal visible={typeModalVisible} onClose={() => setTypeModalVisible(false)} title="매입 유형 관리" noun="유형"
        removeConfirmHint="" categories={purchaseTypes.types} loading={purchaseTypes.loading}
        add={purchaseTypes.add} rename={async (oldName, newName) => {
          await purchaseTypes.rename(oldName, newName);
          if (purchaseType === oldName) setPurchaseType(newName.trim());
          await refetchPurchases();
        }} />
      <CategoryManageModal
        visible={ingredientCategoryModalVisible}
        onClose={() => { setIngredientCategoryModalVisible(false); setShowPicker(true); }}
        title="재고 카테고리 관리"
        removeConfirmHint="해당 카테고리의 재료는 '기타'로 이동해요."
        categories={ingredientCategories.categories}
        loading={ingredientCategories.loading}
        add={ingredientCategories.add}
        rename={ingredientCategories.rename}
        remove={ingredientCategories.remove}
      />
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
  title: { fontSize: 17, fontWeight: '700', color: Colors.black },
  headerSpacer: { width: 48 },
  content: { padding: 20, paddingBottom: 32 },

  modeHint: { fontSize: 12, color: Colors.gray400, marginTop: 8 },

  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.gray200,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  dateText: { fontSize: 15, color: Colors.black },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  bottomTotal: { flex: 1 },
  bottomTotalLabel: { fontSize: 12, color: Colors.gray500, marginBottom: 2 },
  bottomTotalValue: { fontSize: 20, fontWeight: '800', color: Colors.black, letterSpacing: -0.3 },
  bottomSubmit: { backgroundColor: Colors.primary, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 12 },
  bottomSubmitDisabled: { opacity: 0.4 },
  bottomSubmitText: { color: Colors.white, fontSize: 15, fontWeight: '700' },

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
  itemsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
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
  itemCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 14,
    marginTop: 8,
  },
  itemCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  itemName: { fontSize: 15, fontWeight: '600', color: Colors.black },
  itemCategory: { fontSize: 12, color: Colors.gray400, marginTop: 2 },
  unitToggleRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  unitToggle: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.gray50,
  },
  unitToggleActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  unitToggleText: { fontSize: 13, color: Colors.gray500, fontWeight: '600' },
  unitToggleTextActive: { color: Colors.white },
  itemInputs: { flexDirection: 'row', gap: 12 },
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

  amountLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

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

  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.black },
  modalClose: { fontSize: 15, color: Colors.primary, fontWeight: '700' },
  modalCancel: { fontSize: 15, color: Colors.gray500, fontWeight: '500' },
  searchContainer: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
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
  filterTabsContainer: { flexGrow: 0, flexShrink: 0, minHeight: 60, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  filterTabsContent: { paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', gap: 6 },
  filterTab: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
    flexShrink: 0,
  },
  filterTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterTabText: { fontSize: 13, color: Colors.gray600, fontWeight: '600' },
  filterTabTextActive: { color: Colors.white },
  filterTabManageBtn: {
    width: 44, height: 44, borderRadius: 20, alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.gray100, borderWidth: 0.5, borderColor: Colors.gray200,
  },
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
  pickerRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickerName: { fontSize: 15, color: Colors.black, fontWeight: '500' },
  pickerNameAdded: { color: Colors.gray400 },
  pickerCategory: { fontSize: 12, color: Colors.gray400, marginTop: 2 },
  pickerUnit: { fontSize: 13, color: Colors.gray500 },
  quickAddTrigger: { padding: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.gray100 },
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
  quickSubmitBtn: { flex: 2, paddingVertical: 13, borderRadius: 10, backgroundColor: Colors.primary, alignItems: 'center' },
  quickSubmitText: { fontSize: 14, color: Colors.white, fontWeight: '700' },
  supplierRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  supplierPickerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.pale,
  },
  supplierPickerBtnText: { fontSize: 13, color: Colors.dark, fontWeight: '600' },
  supplierSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  supplierItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  supplierItemText: { fontSize: 15, color: Colors.black },
});

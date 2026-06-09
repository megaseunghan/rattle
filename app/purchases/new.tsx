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
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { usePurchases } from '../../lib/hooks/usePurchases';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { Ingredient, PurchaseCategory, PurchaseType } from '../../types';
import { convertQuantity, recipeUnitOptions } from '../../lib/utils/unit';

const CATEGORIES = ['식자재', '주류', '비품소모품', '기타'];
const FILTER_CATEGORIES = ['전체', ...CATEGORIES];
const COMMON_UNITS = ['g', 'kg', 'ml', 'L', '개', '병', '봉', '박스'];
const PURCHASE_CATEGORIES: PurchaseCategory[] = ['식자재', '비품', '소모품', '주류', '기타'];
const PURCHASE_TYPES: PurchaseType[] = ['전자세금계산서', '쿠팡', '네이버', '수기'];

type Mode = '품목별' | '금액만';

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
  const { store } = useAuth();
  const params = useLocalSearchParams<{ date?: string }>();
  // 이번 달 매입 훅 (등록 후 refetch 위해 화면 진입 달 기준)
  const yearMonth = formatDate(parseInitialDate(params.date)).slice(0, 7);
  const { purchases, add, addWithItems } = usePurchases(yearMonth);
  const { data: ingredients, create: createIngredient } = useIngredients();

  const [mode, setMode] = useState<Mode>('품목별');
  const [supplier, setSupplier] = useState('');
  const [date, setDate] = useState(parseInitialDate(params.date));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [purchaseType, setPurchaseType] = useState<PurchaseType>('수기');
  const [submitting, setSubmitting] = useState(false);

  // 품목별 모드
  const [items, setItems] = useState<PurchaseItemForm[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('전체');
  const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(new Set());

  // 금액만 모드
  const [amount, setAmount] = useState('');
  const [amountCategory, setAmountCategory] = useState<PurchaseCategory>('식자재');

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
      Alert.alert('오류', e.message);
    } finally {
      setQuickAdding(false);
    }
  }

  async function handleSubmit() {
    if (!supplier.trim()) {
      Alert.alert('입력 오류', '거래처명을 입력해주세요.');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === '품목별') {
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
      } else {
        const amt = Number(amount.replace(/,/g, ''));
        if (!amt || amt <= 0) {
          Alert.alert('입력 오류', '금액을 올바르게 입력해주세요.');
          setSubmitting(false);
          return;
        }
        await add({
          date: formatDate(date),
          supplier: supplier.trim(),
          amount: amt,
          category: amountCategory,
          type: purchaseType,
          note: null,
        });
      }
      router.back();
    } catch (e: any) {
      Alert.alert('오류', e.message ?? '매입 등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  const filteredIngredients = ingredients.filter(item => {
    const matchSearch = !searchQuery || item.name.toLowerCase().startsWith(searchQuery.toLowerCase());
    const matchCategory = activeCategory === '전체' || item.category === activeCategory;
    return matchSearch && matchCategory;
  });

  const totalAmount =
    mode === '품목별'
      ? items.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0), 0)
      : Number(amount.replace(/,/g, '')) || 0;

  const canSubmit = mode === '품목별' ? items.length > 0 : (Number(amount.replace(/,/g, '')) || 0) > 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 뒤로</Text>
        </TouchableOpacity>
        <Text style={styles.title}>매입 등록</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* 모드 토글 */}
          <View style={styles.modeRow}>
            {(['품목별', '금액만'] as Mode[]).map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.modeTab, mode === m && styles.modeTabActive]}
                onPress={() => setMode(m)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.modeHint}>
            {mode === '품목별'
              ? '품목·수량을 입력하면 재고가 자동으로 늘어나요'
              : '재고 반영 없이 금액만 손익계산서에 누적돼요'}
          </Text>

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

          <Text style={styles.label}>유형</Text>
          <View style={styles.chipRow}>
            {PURCHASE_TYPES.map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, purchaseType === t && styles.chipActive]}
                onPress={() => setPurchaseType(t)}
              >
                <Text style={[styles.chipText, purchaseType === t && styles.chipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === '금액만' ? (
            <>
              <Text style={styles.label}>금액</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor={Colors.gray400}
                keyboardType="numeric"
              />
              <Text style={styles.label}>카테고리</Text>
              <View style={styles.chipRow}>
                {PURCHASE_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.chip, amountCategory === cat && styles.chipActive]}
                    onPress={() => setAmountCategory(cat)}
                  >
                    <Text style={[styles.chipText, amountCategory === cat && styles.chipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <>
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
                        <Text style={styles.removeText}>✕</Text>
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
            </>
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
            {submitting ? '등록 중...' : mode === '품목별' && items.length > 0 ? `매입 등록 (${items.length})` : '매입 등록'}
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
                {supplier === name && <Text style={styles.supplierItemCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 식자재 선택 모달 */}
      <Modal visible={showPicker} animationType="slide" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closePicker}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>품목 선택</Text>
              <TouchableOpacity onPress={closePicker}>
                <Text style={styles.modalClose}>닫기</Text>
              </TouchableOpacity>
            </View>

            {showQuickAdd ? (
              <ScrollView contentContainerStyle={styles.quickAddForm}>
                <Text style={styles.quickAddTitle}>새 품목 등록</Text>

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
                            {checked && !already && <Text style={styles.checkMark}>✓</Text>}
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
  headerSpacer: { width: 48 },
  content: { padding: 20, paddingBottom: 32 },

  modeRow: { flexDirection: 'row', gap: 4, backgroundColor: Colors.gray100, borderRadius: 12, padding: 3 },
  modeTab: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  modeTabActive: {
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  modeText: { fontSize: 14, fontWeight: '500', color: Colors.gray400 },
  modeTextActive: { color: Colors.black, fontWeight: '700' },
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
  removeText: { fontSize: 15, color: Colors.gray400 },
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
  modalClose: { fontSize: 15, color: Colors.primary, fontWeight: '600' },
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
  filterTabsContainer: { borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  filterTabsContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  filterTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
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
  pickerRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickerName: { fontSize: 15, color: Colors.black, fontWeight: '500' },
  pickerNameAdded: { color: Colors.gray400 },
  pickerCategory: { fontSize: 12, color: Colors.gray400, marginTop: 2 },
  pickerUnit: { fontSize: 13, color: Colors.gray500 },
  checkMark: { fontSize: 16, color: Colors.primary, fontWeight: '700' },
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
  supplierItemCheck: { fontSize: 16, color: Colors.primary, fontWeight: '700' },
});

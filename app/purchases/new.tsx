import { entityKey } from '../../lib/utils/listKeys';
import { SheetModal } from '../../lib/components/ui/SheetModal';
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md · designed-as-app */
import { getErrorMessage } from '../../lib/utils/error';
import { useEffect, useState, useRef, useMemo, useCallback, memo } from 'react';
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
  Keyboard,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { useAuth } from '../../lib/contexts/AuthContext';
import { usePurchases } from '../../lib/hooks/usePurchases';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { Ingredient, PurchaseType } from '../../types';
import { convertQuantity, recipeUnitOptions } from '../../lib/utils/unit';
import { usePurchaseTypes } from '../../lib/hooks/usePurchaseTypes';
import { useCategories } from '../../lib/hooks/useCategories';
import { CategoryManageModal } from '../../lib/components/CategoryManageModal';
import { PurchaseWriteError } from '../../lib/services/purchases';
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

const IngredientPickerRow = memo(function IngredientPickerRow({ item, already, checked, onSelect }: {
  item: Ingredient; already: boolean; checked: boolean; onSelect: (item: Ingredient) => void;
}) {
  const handlePress = useCallback(() => onSelect(item), [onSelect, item]);
  return (
      <TouchableOpacity
        style={[styles.pickerRow, already && styles.pickerRowAdded]}
        onPress={handlePress}
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
});

export default function NewPurchaseScreen() {
  const { store, currentRole } = useAuth();
  const purchaseTypes = usePurchaseTypes();
  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const sheetHandoff = useRef<'categories' | 'picker' | null>(null);
  const params = useLocalSearchParams<{ date?: string }>();
  // 이번 달 매입 훅 (등록 후 refetch 위해 화면 진입 달 기준)
  const yearMonth = formatDate(parseInitialDate(params.date)).slice(0, 7);
  const { purchases, addWithItems, refetch: refetchPurchases } = usePurchases(yearMonth);
  const { data: ingredients, loading: ingredientsLoading, error: ingredientsError, hasMore, loadMore, loadingMore, create: createIngredient, refetch: refetchIngredients } = useIngredients();
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

  const [step, setStep] = useState(0);
  const [editingReview, setEditingReview] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [writeState, setWriteState] = useState<'idle' | 'rejected' | 'unknown' | 'saved' | 'saved-refresh'>('idle');
  const scrollRef = useRef<ScrollView>(null);
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const fieldY = useRef<Record<string, number>>({});
  const [supplier, setSupplier] = useState('');
  const [date, setDate] = useState(parseInitialDate(params.date));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [typeEdited, setTypeEdited] = useState(false);
  const [purchaseType, setPurchaseType] = useState<PurchaseType>('');
  const writeLock = useRef(false);
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

  const isDirty = writeState !== 'saved' && writeState !== 'saved-refresh' && (supplier.trim().length > 0 || typeEdited || items.length > 0 || formatDate(date) !== formatDate(parseInitialDate(params.date)));
  useEffect(() => {
    if ((step === 0 && !editingReview) || submitting || writeState.startsWith('saved') || writeState === 'unknown') return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { goBackStep(); return true; });
    return () => listener.remove();
  }, [step, submitting, editingReview, writeState]);
  const bypassLeaveGuard = useConfirmLeave(isDirty, { message: '지금 나가면 입력한 매입 내용이 저장되지 않아요.' });

  // 새 식자재 빠른 등록
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickCategory, setQuickCategory] = useState('식자재');
  const [quickUnit, setQuickUnit] = useState('g');
  const [quickAdding, setQuickAdding] = useState(false);

  const existingSuppliers = useMemo(() => [...new Set(purchases.map(p => p.supplier).filter(Boolean))], [purchases]);

  function closePicker() {
    setShowPicker(false);
    setShowQuickAdd(false);
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
              unit_price: ingredient.last_price > 0 ? String(ingredient.last_price) : '',
            },
          ]
    );
  }

  const toggleIngredient = useCallback((ingredient: Ingredient) => {
    if (items.some(i => i.ingredient.id === ingredient.id)) return;
    setSelectedIngredients(prev => {
      const next = new Set(prev);
      next.has(ingredient.id) ? next.delete(ingredient.id) : next.add(ingredient.id);
      return next;
    });
  }, [items]);

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

  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (focusTimer.current !== null) clearTimeout(focusTimer.current); }, []);

  function validate(stage: number) {
    const next: Record<string, string> = {};
    if (stage === 0) {
      if (!supplier.trim()) next.supplier = '거래처명을 입력해주세요.';
      if (purchaseTypes.loading || purchaseTypes.error || !purchaseTypes.types.includes(purchaseType)) next.type = '매입 유형을 불러온 뒤 선택해주세요.';
    } else {
      if (!items.length) next.items = '매입 품목을 1개 이상 추가해주세요.';
      for (const item of items) {
        const quantity = Number(item.quantity), price = Number(item.unit_price);
        if (!item.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0) next[`${item.ingredient.id}:quantity`] = '0보다 큰 수량을 입력해주세요.';
        if (!item.unit_price.trim() || !Number.isFinite(price) || price < 0) next[`${item.ingredient.id}:unit_price`] = '단가를 입력해주세요. 무상이면 0원을 입력해주세요.';
        if (!Number.isFinite(quantity * price) || !Number.isSafeInteger(Math.round(quantity * price))) next[`${item.ingredient.id}:unit_price`] = '금액 범위를 확인해주세요.';
      }
      const sum = items.reduce((total, item) => total + Number(item.quantity) * Number(item.unit_price), 0);
      if (items.length && (!Number.isFinite(sum) || !Number.isSafeInteger(Math.round(sum)))) next.items = '매입 합계 범위를 확인해주세요.';
    }
    setErrors(next);
    if (focusTimer.current !== null) clearTimeout(focusTimer.current);
    const first = Object.keys(next)[0];
    if (first) {
      scrollRef.current?.scrollTo({ y: Math.max(0, (fieldY.current[first] ?? 0) - 20), animated: true });
      focusTimer.current = setTimeout(() => { focusTimer.current = null; inputRefs.current[first]?.focus(); }, 100);
    }
    return !first;
  }

  function advance() {
    if (submitting || writeState === 'unknown') return;
    if (!validate(step)) return;
    Keyboard.dismiss();
    setStep(value => editingReview ? 2 : value + 1);
    setEditingReview(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  async function handleSubmit() {
    if (writeLock.current || submitting || writeState === 'unknown' || writeState.startsWith('saved')) return;
    if (!store) return;
    if (!validate(0)) { setStep(0); return; }
    if (!validate(1)) { setStep(1); return; }
    writeLock.current = true;
    setSubmitting(true);
    try {
      const result = await addWithItems({
        date: formatDate(date), supplier: supplier.trim(), type: purchaseType,
        items: items.map(i => {
          const factor = convertQuantity(1, i.unit, i.ingredient.unit) || 1;
          return { ingredient_id: i.ingredient.id, name: i.ingredient.name,
            quantity: Number(i.quantity) * factor, unit: i.ingredient.unit,
            unit_price: Number(i.unit_price) / factor, category: i.ingredient.category };
        }),
      });
      setWriteState(result.refreshFailed ? 'saved-refresh' : 'saved');
      Keyboard.dismiss();
    } catch (error) {
      setWriteState(error instanceof PurchaseWriteError && error.outcome === 'rejected' ? 'rejected' : 'unknown');
    } finally { writeLock.current = false; setSubmitting(false); }
  }

  function editReview(target: number) {
    Keyboard.dismiss();
    setErrors({});
    setEditingReview(true);
    setStep(target);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function goBackStep() {
    Keyboard.dismiss();
    setErrors({});
    setStep(value => editingReview ? 2 : value - 1);
    setEditingReview(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function leaveSaved() {
    bypassLeaveGuard();
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/(tabs)', params: { targetTab: 'purchases', month: formatDate(date).slice(0, 7), homeScope: 'store' } });
  }

  const filteredIngredients = useMemo(() => ingredients.filter(item => {
    const matchSearch = !searchQuery || item.name.toLowerCase().startsWith(searchQuery.toLowerCase());
    const matchCategory = activeCategory === '전체' || item.category === activeCategory;
    return matchSearch && matchCategory;
  }), [ingredients, searchQuery, activeCategory]);

  const pickerExtraData = useMemo(() => ({ items, selectedIngredients }), [items, selectedIngredients]);
  const addedIngredientIds = useMemo(() => new Set(items.map(row => row.ingredient.id)), [items]);
  const renderPickerItem = useCallback(({ item }: { item: Ingredient }) => (
    <IngredientPickerRow item={item} already={addedIngredientIds.has(item.id)} checked={selectedIngredients.has(item.id)} onSelect={toggleIngredient} />
  ), [addedIngredientIds, selectedIngredients, toggleIngredient]);

  const totalAmount = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0), 0);
  const saved = writeState === 'saved' || writeState === 'saved-refresh';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { if (saved) leaveSaved(); else if (!submitting && (step > 0 || editingReview) && writeState !== 'unknown') goBackStep(); else if (!submitting) router.back(); }} disabled={submitting} style={styles.backButton} accessibilityRole="button" accessibilityLabel="뒤로">
          <Ionicons name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>매입 등록</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.storeContext}>{store?.name ?? '매장 확인 필요'} · {saved ? '등록 완료' : `${step + 1}/3 · ${['기본 정보', '품목 입력', '등록 내용 확인'][step]}`}</Text>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${(step + 1) / 3 * 100}%` }]} /></View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          {step === 0 && !saved && <>
          <Text style={styles.modeHint}>품목·수량·단가를 입력하면 매입 금액과 재고에 함께 반영돼요.</Text>

          <Text style={styles.label}>거래처명</Text>
          <View style={styles.supplierRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              ref={ref => { inputRefs.current.supplier = ref; }}
              accessibilityLabel="거래처명"
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

          {errors.supplier && <Text style={styles.fieldError}>{errors.supplier}</Text>}
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
              <Text style={{ color: Colors.action }}>유형 관리</Text>
            </TouchableOpacity>}
          </View>
          {purchaseTypes.error && <Text style={styles.fieldError}>매입 유형을 불러오지 못했어요.</Text>}
          <View style={styles.chipRow}>
            {purchaseTypes.types.map(t => (
              <TouchableOpacity
                key={t}
                accessibilityRole="radio"
                accessibilityState={{ checked: purchaseType === t }}
                style={[styles.chip, purchaseType === t && styles.chipActive]}
                onPress={() => { setPurchaseType(t); setTypeEdited(true); }}
              >
                <Text style={[styles.chipText, purchaseType === t && styles.chipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {errors.type && <Text style={styles.fieldError}>{errors.type}</Text>}
          </>}
          {step === 1 && !saved && <>
          <View style={styles.itemsHeader}>
            <Text style={styles.label}>매입 품목</Text>
            <TouchableOpacity style={styles.addItemBtn} accessibilityRole="button" accessibilityLabel="매입 품목 추가" onPress={() => setShowPicker(true)}>
              <Text style={styles.addItemText}>+ 추가</Text>
            </TouchableOpacity>
          </View>

          {errors.items && <Text style={styles.fieldError}>{errors.items}</Text>}
          {items.length === 0 ? (
            <View style={styles.emptyItems}>
              <Text style={styles.emptyItemsText}>품목을 추가해주세요</Text>
            </View>
          ) : (
            items.map(item => (
              <View key={item.ingredient.id} style={styles.itemCard} onLayout={event => { fieldY.current[`${item.ingredient.id}:quantity`] = event.nativeEvent.layout.y; fieldY.current[`${item.ingredient.id}:unit_price`] = event.nativeEvent.layout.y; }}>
                <View style={styles.itemCardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.ingredient.name}</Text>
                    <Text style={styles.itemCategory}>{item.ingredient.category}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeItem(item.ingredient.id)} style={styles.actionButton} accessibilityRole="button" accessibilityLabel={`${item.ingredient.name} 품목 삭제`}>
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
                            ref={ref => { inputRefs.current[`${item.ingredient.id}:quantity`] = ref; }}
                            accessibilityLabel={`${item.ingredient.name} 수량`}
                            value={item.quantity}
                            onChangeText={v => updateItem(item.ingredient.id, 'quantity', v)}
                            keyboardType="decimal-pad"
                          />
                          {errors[`${item.ingredient.id}:quantity`] && <Text style={styles.fieldError}>{errors[`${item.ingredient.id}:quantity`]}</Text>}
                        </View>
                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>단가 (원/{item.unit})</Text>
                          <TextInput
                            style={styles.smallInput}
                            ref={ref => { inputRefs.current[`${item.ingredient.id}:unit_price`] = ref; }}
                            accessibilityLabel={`${item.ingredient.name} 단가`}
                            value={item.unit_price}
                            onChangeText={v => updateItem(item.ingredient.id, 'unit_price', v)}
                            keyboardType="decimal-pad"
                          />
                          {errors[`${item.ingredient.id}:unit_price`] && <Text style={styles.fieldError}>{errors[`${item.ingredient.id}:unit_price`]}</Text>}
                        </View>
                      </View>
                      <Text style={styles.reviewText}>소계 {(Number(item.quantity || 0) * Number(item.unit_price || 0)).toLocaleString('ko-KR', { maximumFractionDigits: 6 })}원</Text>
                    </>
                  );
                })()}
              </View>
            ))
          )}
          </>}
          {step === 2 && !saved && <View style={styles.itemCard}>
            <Text style={styles.itemName}>등록할 내용을 확인해주세요</Text>
            <Text style={styles.reviewText}>{store?.name} · {formatDate(date)}</Text>
            <Text style={styles.reviewText}>{supplier} · {purchaseType}</Text>
            <TouchableOpacity style={styles.actionButton} disabled={submitting || writeState === 'unknown'} onPress={() => editReview(0)}><Text style={styles.modalClose}>기본 정보 수정</Text></TouchableOpacity>
            {items.map(item => <Text key={item.ingredient.id} style={styles.reviewText}>{item.ingredient.name} · {item.quantity}{item.unit} × {Number(item.unit_price).toLocaleString()}원 = {(Number(item.quantity) * Number(item.unit_price)).toLocaleString('ko-KR', { maximumFractionDigits: 6 })}원</Text>)}
            <TouchableOpacity style={styles.actionButton} disabled={submitting || writeState === 'unknown'} onPress={() => editReview(1)}><Text style={styles.modalClose}>품목 수정</Text></TouchableOpacity>
          </View>}
          {writeState === 'rejected' && <Text style={styles.fieldError}>등록되지 않았어요. 입력 내용을 확인한 뒤 다시 등록해주세요.</Text>}
          {writeState === 'unknown' && <View style={styles.itemCard}><Text style={styles.itemName}>등록 결과를 확인해주세요</Text><Text style={styles.reviewText}>응답을 받지 못해 등록 여부가 확실하지 않아요. 중복 등록을 막기 위해 매입 내역을 먼저 확인해주세요. 현재 입력은 이 화면에 유지돼요.</Text><TouchableOpacity style={styles.actionButton} onPress={() => router.push({ pathname: '/(tabs)', params: { targetTab: 'purchases', month: formatDate(date).slice(0, 7), homeScope: 'store' } })}><Text style={styles.modalClose}>등록 내역 확인</Text></TouchableOpacity></View>}
          {saved && <View style={styles.itemCard}><Text style={styles.itemName}>매입이 등록됐어요</Text><Text style={styles.reviewText}>{store?.name} · {formatDate(date)} · {supplier}</Text><Text style={styles.reviewText}>{writeState === 'saved-refresh' ? '등록은 완료됐어요. 목록에서 합계를 다시 불러와 주세요.' : '목록에서 등록 내역을 확인할 수 있어요.'}</Text></View>}
        </ScrollView>

      {/* 하단 고정 바 */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomTotal}>
          <Text style={styles.bottomTotalLabel}>합계</Text>
          <Text style={styles.bottomTotalValue} >{items.some(item => !item.quantity.trim() || !item.unit_price.trim() || !Number.isFinite(Number(item.quantity) * Number(item.unit_price))) ? '입력 확인 필요' : `${totalAmount.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}원`}</Text>
        </View>
        <TouchableOpacity
          style={[styles.bottomSubmit, (submitting || writeState === 'unknown') && styles.bottomSubmitDisabled]}
          accessibilityRole="button"
          accessibilityLabel={saved ? '매입 내역으로' : step < 2 ? '다음 단계' : '매입 최종 등록'}
          onPress={saved ? leaveSaved : step < 2 ? advance : handleSubmit}
          disabled={submitting || writeState === 'unknown'}
        >
          <Text style={styles.bottomSubmitText}>
            {submitting ? '등록 중...' : saved ? '매입 내역으로' : editingReview ? '검토로 돌아가기' : step === 0 ? '품목 입력으로' : step === 1 ? '입력 내용 검토' : writeState === 'rejected' ? '다시 등록' : '매입 등록'}
          </Text>
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>

      {/* 거래처 선택 모달 */}
      <SheetModal visible={showSupplierPicker} onRequestClose={() => setShowSupplierPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowSupplierPicker(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.supplierSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>거래처 선택</Text>
              <TouchableOpacity onPress={() => setShowSupplierPicker(false)} style={styles.actionButton} accessibilityRole="button">
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
      </SheetModal>

      {/* 식자재 선택 모달 */}
      <SheetModal visible={showPicker} onRequestClose={closePicker} onDismiss={() => { if (sheetHandoff.current === 'categories') { sheetHandoff.current = null; setIngredientCategoryModalVisible(true); } }}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closePicker} accessible={false}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.modalSheet} accessible={false}>
            <View style={styles.modalHeader}>
              {showQuickAdd ? (
                <>
                  <TouchableOpacity onPress={() => setShowQuickAdd(false)} hitSlop={8} style={styles.actionButton} accessibilityRole="button">
                    <Text style={styles.modalCancel}>취소</Text>
                  </TouchableOpacity>
                  <Text style={styles.modalTitle}>새 품목 등록</Text>
                  <TouchableOpacity onPress={handleQuickAdd} disabled={quickAdding} hitSlop={8} style={styles.actionButton} accessibilityRole="button">
                    <Text style={styles.modalClose}>{quickAdding ? '등록 중...' : '추가'}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.modalTitle}>품목 선택</Text>
                  <TouchableOpacity onPress={closePicker} hitSlop={8} style={styles.actionButton} accessibilityRole="button">
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
                    onPress={() => { sheetHandoff.current = 'categories'; setShowPicker(false); }}
                    hitSlop={8}
                  >
                    <Ionicons name="add" size={16} color={Colors.gray600} />
                  </TouchableOpacity>
                </ScrollView>

                {ingredientsLoading || ingredientsError ? <View style={styles.emptyItems}><Text style={styles.emptyItemsText}>{ingredientsLoading ? '품목을 불러오는 중이에요' : '품목을 불러오지 못했어요'}</Text>{ingredientsError && <TouchableOpacity onPress={() => void refetchIngredients()} style={styles.actionButton}><Text style={styles.modalClose}>다시 불러오기</Text></TouchableOpacity>}</View> : filteredIngredients.length === 0 ? (
                  <View style={styles.emptyItems}>
                    <Text style={styles.emptyItemsText}>
                      {ingredients.length === 0 ? '등록된 품목이 없어요' : '검색 결과가 없어요'}
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    initialNumToRender={5}
                    maxToRenderPerBatch={10}
                    windowSize={5}
                    data={filteredIngredients}
                    onEndReached={() => { if (hasMore && !loadingMore) void loadMore(); }}
                    ListFooterComponent={hasMore ? <TouchableOpacity style={styles.actionButton} onPress={() => void loadMore()}><Text style={styles.modalClose}>{loadingMore ? '불러오는 중' : '품목 더 불러오기'}</Text></TouchableOpacity> : null}
                    keyExtractor={entityKey}
                    extraData={pickerExtraData}
                    renderItem={renderPickerItem}
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
      </SheetModal>

      <CategoryManageModal visible={typeModalVisible} onClose={() => setTypeModalVisible(false)} title="매입 유형 관리" noun="유형"
        removeConfirmHint="" categories={purchaseTypes.types} loading={purchaseTypes.loading}
        add={purchaseTypes.add} rename={async (oldName, newName) => {
          await purchaseTypes.rename(oldName, newName);
          if (purchaseType === oldName) setPurchaseType(newName.trim());
          await refetchPurchases();
        }} />
      <CategoryManageModal
        visible={ingredientCategoryModalVisible}
        onClose={() => { sheetHandoff.current = 'picker'; setIngredientCategoryModalVisible(false); }}
        onDismiss={() => { if (sheetHandoff.current === 'picker') { sheetHandoff.current = null; setShowPicker(true); } }}
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
  storeContext: { backgroundColor: Colors.contextBg, paddingTop: 8, paddingHorizontal: 20, paddingBottom: 12, fontSize: 14, color: Colors.gray600 },
  progressTrack: { height: 4, backgroundColor: Colors.gray100 },
  progressFill: { height: 4, backgroundColor: Colors.action },
  fieldError: { backgroundColor: Colors.fieldErrorBg, padding: 8, borderRadius: 8, color: Colors.negative, fontSize: 13, marginTop: 6, lineHeight: 19 },
  reviewText: { color: Colors.gray700, fontSize: 15, lineHeight: 23, marginTop: 10 },
  actionButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
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
  headerSpacer: { width: 48 },
  content: { padding: 20, paddingBottom: 32 },

  modeHint: { fontSize: 13, color: Colors.gray500, marginTop: 8 },

  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    paddingHorizontal: 14,
    paddingVertical: 13, minHeight: 44 },
  dateText: { fontSize: 15, color: Colors.black },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: Colors.totalBg,
    borderTopWidth: 1,
    borderTopColor: Colors.homeBorder,
  },
  bottomTotal: { flex: 1 },
  bottomTotalLabel: { fontSize: 13, color: Colors.white, marginBottom: 2 },
  bottomTotalValue: { fontFamily: Fonts.spaceGroteskBold, fontSize: 20, fontWeight: '800', color: Colors.white, letterSpacing: -0.3 },
  bottomSubmit: { backgroundColor: Colors.action, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 14, minHeight: 44, justifyContent: 'center' },
  bottomSubmitDisabled: { opacity: 0.4 },
  bottomSubmitText: { color: Colors.white, fontSize: 15, fontWeight: '700' },

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
  itemsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  addItemBtn: {
    backgroundColor: Colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.pale, minHeight: 44, justifyContent: 'center' },
  addItemText: { fontSize: 13, color: Colors.dark, fontWeight: '600' },
  emptyItems: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    padding: 24,
    alignItems: 'center',
    marginTop: 6,
  },
  emptyItemsText: { color: Colors.gray400, fontSize: 14 },
  itemCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    padding: 14,
    marginTop: 8,
  },
  itemCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  itemName: { fontSize: 15, fontWeight: '600', color: Colors.black },
  itemCategory: { fontSize: 13, color: Colors.gray500, marginTop: 2 },
  unitToggleRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  unitToggle: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    backgroundColor: Colors.gray50, minHeight: 44, justifyContent: 'center' },
  unitToggleActive: { backgroundColor: Colors.action, borderColor: Colors.primary },
  unitToggleText: { fontSize: 13, color: Colors.gray500, fontWeight: '600' },
  unitToggleTextActive: { color: Colors.white },
  itemInputs: { flexDirection: 'row', gap: 12 },
  inputGroup: { flex: 1 },
  inputLabel: { fontSize: 13, color: Colors.gray500, marginBottom: 4 },
  smallInput: {
    backgroundColor: Colors.gray50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.black,
    textAlign: 'right', minHeight: 44 },

  amountLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    backgroundColor: Colors.white, minHeight: 44, justifyContent: 'center' },
  chipActive: { backgroundColor: Colors.action, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.gray600, fontWeight: '600' },
  chipTextActive: { color: Colors.white },

  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.homeCanvas, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.homeBorder,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.black },
  modalClose: { fontSize: 15, color: Colors.action, fontWeight: '700' },
  modalCancel: { fontSize: 15, color: Colors.gray500, fontWeight: '500' },
  searchContainer: { paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  searchInput: {
    backgroundColor: Colors.gray50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.black, minHeight: 44 },
  filterTabsContainer: { flexGrow: 0, flexShrink: 0, minHeight: 60, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  filterTabsContent: { paddingHorizontal: 20, paddingVertical: 8, alignItems: 'center', gap: 6 },
  filterTab: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    backgroundColor: Colors.white,
    flexShrink: 0,
  },
  filterTabActive: { backgroundColor: Colors.action, borderColor: Colors.primary },
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
  quickAddTriggerText: { fontSize: 14, color: Colors.action, fontWeight: '700' },
  bulkAddBtn: {
    margin: 20,
    marginTop: 0,
    backgroundColor: Colors.action,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  bulkAddText: { fontSize: 15, color: Colors.white, fontWeight: '700' },
  quickAddForm: { padding: 20, paddingBottom: 40 },
  quickAddTitle: { fontSize: 16, fontWeight: '700', color: Colors.black, marginBottom: 16 },
  quickLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 8, marginTop: 14 },
  quickInput: {
    backgroundColor: Colors.gray50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: Colors.black, minHeight: 44 },
  quickActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  quickCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.gray200,
    alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  quickCancelText: { fontSize: 14, color: Colors.gray600, fontWeight: '600' },
  quickSubmitBtn: { flex: 2, paddingVertical: 13, borderRadius: 14, backgroundColor: Colors.action, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  quickSubmitText: { fontSize: 14, color: Colors.white, fontWeight: '700' },
  supplierRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  supplierPickerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.pale, minHeight: 44, justifyContent: 'center' },
  supplierPickerBtnText: { fontSize: 13, color: Colors.dark, fontWeight: '600' },
  supplierSheet: { backgroundColor: Colors.homeCanvas, borderTopLeftRadius: 24, borderTopRightRadius: 24},
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

import { useState, useMemo } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useRecipes } from '../../lib/hooks/useRecipes';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { useAuth } from '../../lib/contexts/AuthContext';
import { Ingredient } from '../../types';

interface RecipeIngredientForm {
  ingredient: Ingredient;
  quantity: string;
}

export default function NewRecipeScreen() {
  const { create } = useRecipes();
  const { data: ingredients, create: createIngredient } = useIngredients();
  const { store } = useAuth();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [items, setItems] = useState<RecipeIngredientForm[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  // 새 식자재 인라인 등록
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [savingNew, setSavingNew] = useState(false);

  const cost = useMemo(() => {
    return items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = item.ingredient.last_price ?? 0;
      return sum + qty * price;
    }, 0);
  }, [items]);

  const marginRate = useMemo(() => {
    const sp = parseFloat(sellingPrice) || 0;
    if (sp <= 0) return 0;
    return Math.max(0, ((sp - cost) / sp) * 100);
  }, [sellingPrice, cost]);

  function getMarginColor(): string {
    if (marginRate >= 60) return Colors.success;
    if (marginRate >= 30) return Colors.warning;
    return Colors.danger;
  }
  const marginColor = getMarginColor();

  async function handleCreateIngredient() {
    if (!newName.trim() || !newUnit.trim()) {
      Alert.alert('입력 오류', '식자재명과 단위를 입력해주세요.');
      return;
    }
    if (!store) return;
    setSavingNew(true);
    try {
      const created = await createIngredient({
        store_id: store.id,
        name: newName.trim(),
        unit: newUnit.trim(),
        last_price: parseFloat(newPrice) || 0,
        category: '기타',
        current_stock: 0,
        min_stock: 0,
        container_unit: null,
        container_size: null,
        supplier_name: null,
      });
      setItems(prev => [...prev, { ingredient: created, quantity: '1' }]);
      setNewName(''); setNewUnit(''); setNewPrice('');
      setShowNewForm(false);
      setShowPicker(false);
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setSavingNew(false);
    }
  }

  function addIngredient(ingredient: Ingredient) {
    const alreadyAdded = items.some(i => i.ingredient.id === ingredient.id);
    if (!alreadyAdded) {
      setItems(prev => [...prev, { ingredient, quantity: '1' }]);
    }
    setShowPicker(false);
  }

  function removeItem(ingredientId: string) {
    setItems(prev => prev.filter(i => i.ingredient.id !== ingredientId));
  }

  function updateQuantity(ingredientId: string, value: string) {
    setItems(prev =>
      prev.map(i => (i.ingredient.id === ingredientId ? { ...i, quantity: value } : i))
    );
  }

  async function handleSubmit() {
    if (!name.trim()) {
      Alert.alert('입력 오류', '레시피명을 입력해주세요.');
      return;
    }
    const sp = parseFloat(sellingPrice);
    if (!sp || sp <= 0) {
      Alert.alert('입력 오류', '판매가를 입력해주세요.');
      return;
    }
    if (items.length === 0) {
      Alert.alert('입력 오류', '재료를 1개 이상 추가해주세요.');
      return;
    }

    setSubmitting(true);
    try {
      await create(
        name.trim(),
        category.trim() || '기타',
        sp,
        items.map(i => ({
          ingredient_id: i.ingredient.id,
          quantity: parseFloat(i.quantity) || 0,
          unit: i.ingredient.unit,
        }))
      );
      router.back();
    } catch (e: any) {
      Alert.alert('오류', e.message ?? '레시피 등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  const sellingPriceNum = parseFloat(sellingPrice) || 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← 뒤로</Text>
        </TouchableOpacity>
        <Text style={styles.title}>새 레시피</Text>
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
          <Text style={styles.label}>레시피명</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="예) 아메리카노"
            placeholderTextColor={Colors.gray400}
          />

          <Text style={styles.label}>카테고리</Text>
          <TextInput
            style={styles.input}
            value={category}
            onChangeText={setCategory}
            placeholder="예) 음료, 디저트"
            placeholderTextColor={Colors.gray400}
          />

          <Text style={styles.label}>판매가 (원)</Text>
          <TextInput
            style={styles.input}
            value={sellingPrice}
            onChangeText={setSellingPrice}
            placeholder="0"
            placeholderTextColor={Colors.gray400}
            keyboardType="numeric"
          />

          <View style={styles.costPreview}>
            <View style={styles.costItem}>
              <Text style={styles.costLabel}>예상 원가</Text>
              <Text style={styles.costValue}>{Math.round(cost).toLocaleString('ko-KR')}원</Text>
            </View>
            <View style={styles.costDivider} />
            <View style={styles.costItem}>
              <Text style={styles.costLabel}>마진율</Text>
              <Text style={[styles.costValue, { color: marginColor }]}>
                {sellingPriceNum > 0 ? `${marginRate.toFixed(1)}%` : '-%'}
              </Text>
            </View>
          </View>

          <View style={styles.itemsHeader}>
            <Text style={styles.label}>재료</Text>
            <TouchableOpacity style={styles.addItemBtn} onPress={() => setShowPicker(true)}>
              <Text style={styles.addItemText}>+ 추가</Text>
            </TouchableOpacity>
          </View>

          {items.length === 0 ? (
            <View style={styles.emptyItems}>
              <Text style={styles.emptyItemsText}>재료를 추가해주세요</Text>
            </View>
          ) : (
            items.map(item => (
              <View key={item.ingredient.id} style={styles.recipeItem}>
                <View style={styles.recipeItemLeft}>
                  <Text style={styles.recipeItemName}>{item.ingredient.name}</Text>
                  <Text style={styles.recipeItemPrice}>
                    {item.ingredient.last_price != null
                      ? `단가 ${item.ingredient.last_price.toLocaleString('ko-KR')}원/${item.ingredient.unit}`
                      : '단가 미설정'}
                  </Text>
                </View>
                <View style={styles.recipeItemRight}>
                  <TextInput
                    style={styles.qtyInput}
                    value={item.quantity}
                    onChangeText={v => updateQuantity(item.ingredient.id, v)}
                    keyboardType="numeric"
                  />
                  <Text style={styles.unitText}>{item.ingredient.unit}</Text>
                  <TouchableOpacity onPress={() => removeItem(item.ingredient.id)}>
                    <Text style={styles.removeText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>식자재 선택</Text>
              <TouchableOpacity onPress={() => { setShowPicker(false); setShowNewForm(false); }}>
                <Text style={styles.modalClose}>닫기</Text>
              </TouchableOpacity>
            </View>

            {/* 새 식자재 인라인 폼 */}
            {showNewForm ? (
              <View style={styles.newIngredientForm}>
                <TextInput
                  style={styles.newInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="식자재명"
                  placeholderTextColor={Colors.gray300}
                />
                <View style={styles.newInputRow}>
                  <TextInput
                    style={[styles.newInput, { flex: 1 }]}
                    value={newUnit}
                    onChangeText={setNewUnit}
                    placeholder="단위 (g, ml…)"
                    placeholderTextColor={Colors.gray300}
                  />
                  <TextInput
                    style={[styles.newInput, { flex: 1 }]}
                    value={newPrice}
                    onChangeText={setNewPrice}
                    placeholder="단가 (원)"
                    placeholderTextColor={Colors.gray300}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.newInputRow}>
                  <TouchableOpacity
                    style={styles.newCancelBtn}
                    onPress={() => setShowNewForm(false)}
                  >
                    <Text style={styles.newCancelText}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.newSaveBtn, savingNew && { opacity: 0.5 }]}
                    onPress={handleCreateIngredient}
                    disabled={savingNew}
                  >
                    {savingNew
                      ? <ActivityIndicator size="small" color={Colors.white} />
                      : <Text style={styles.newSaveText}>등록 후 추가</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.newIngredientBtn}
                onPress={() => setShowNewForm(true)}
              >
                <Text style={styles.newIngredientBtnText}>+ 새 식자재 등록</Text>
              </TouchableOpacity>
            )}

            {ingredients.length === 0 ? (
              <View style={styles.emptyItems}>
                <Text style={styles.emptyItemsText}>등록된 식자재가 없습니다</Text>
              </View>
            ) : (
              <FlatList
                data={ingredients}
                keyExtractor={i => i.id}
                renderItem={({ item }) => {
                  const already = items.some(o => o.ingredient.id === item.id);
                  return (
                    <TouchableOpacity
                      style={[styles.pickerRow, already && styles.pickerRowAdded]}
                      onPress={() => addIngredient(item)}
                      disabled={already}
                    >
                      <Text style={[styles.pickerName, already && styles.pickerNameAdded]}>
                        {item.name}
                      </Text>
                      <Text style={styles.pickerUnit}>{item.unit}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
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
  costPreview: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
    marginTop: 12,
    overflow: 'hidden',
  },
  costItem: { flex: 1, padding: 14, alignItems: 'center' },
  costDivider: { width: 1, backgroundColor: Colors.gray200 },
  costLabel: { fontSize: 12, color: Colors.gray500, marginBottom: 4 },
  costValue: { fontSize: 16, fontWeight: '700', color: Colors.black },
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
  recipeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 12,
    marginTop: 8,
  },
  recipeItemLeft: { flex: 1 },
  recipeItemName: { fontSize: 15, fontWeight: '600', color: Colors.black, marginBottom: 2 },
  recipeItemPrice: { fontSize: 12, color: Colors.gray400 },
  recipeItemRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyInput: {
    backgroundColor: Colors.gray50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.gray200,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.black,
    minWidth: 56,
    textAlign: 'right',
  },
  unitText: { fontSize: 13, color: Colors.gray500 },
  removeText: { fontSize: 15, color: Colors.gray400 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
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
  pickerName: { fontSize: 15, color: Colors.black, fontWeight: '500' },
  pickerNameAdded: { color: Colors.gray400 },
  pickerUnit: { fontSize: 13, color: Colors.gray500 },
  newIngredientBtn: {
    marginHorizontal: 20, marginVertical: 10,
    paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.primary,
    alignItems: 'center',
  },
  newIngredientBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  newIngredientForm: { padding: 16, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  newInput: {
    borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 14,
    color: Colors.black, backgroundColor: Colors.gray50,
  },
  newInputRow: { flexDirection: 'row', gap: 8 },
  newCancelBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.gray200, alignItems: 'center',
  },
  newCancelText: { fontSize: 14, fontWeight: '600', color: Colors.gray500 },
  newSaveBtn: {
    flex: 2, paddingVertical: 10, borderRadius: 10,
    backgroundColor: Colors.primary, alignItems: 'center',
  },
  newSaveText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});

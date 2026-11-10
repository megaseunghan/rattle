import { getErrorMessage, UserFacingError } from '../../lib/utils/error';
import { useState, useEffect, useRef, useMemo } from 'react';
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
import { AppIcon } from '../../lib/icons/AppIcon';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { useCategories } from '../../lib/hooks/useCategories';
import { getIngredientById } from '../../lib/services/ingredients';
import { Ingredient } from '../../types';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useStorePermissions } from '../../lib/hooks/useStorePermissions';

import { STOCK_UNITS } from '../../lib/utils/unit';

export default function EditIngredientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { store } = useAuth();
  const scope = useMemo(() => ({}), [id, store?.id]);
  const active = useRef<object | null>(scope); active.current = scope;
  useEffect(() => { active.current = scope; return () => { active.current = null; }; }, [scope]);
  const { canManageStock, canAdjustStock } = useStorePermissions();
  const { update } = useIngredients();
  const { categories } = useCategories();

  const [ingredient, setIngredient] = useState<Ingredient | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState<string>(STOCK_UNITS[0]);
  const [currentStock, setCurrentStock] = useState('0');
  const [minStock, setMinStock] = useState('0');
  const [lastPrice, setLastPrice] = useState('0');
  const [reload, setReload] = useState(0);
  const [savedNeedsRefresh, setSavedNeedsRefresh] = useState(false);
  const savingLock = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { setSavedNeedsRefresh(false); }, [scope]);

  useEffect(() => {
    if (!id || !store) { setIngredient(null); setFetchError('매장과 식자재를 확인해주세요.'); setFetchLoading(false); return; }
    let cancelled = false;
    setIngredient(null);
    setFetchError(null);
    setFetchLoading(true);
    getIngredientById(id)
      .then((item) => {
        if (cancelled) return;
        if (item.store_id !== store.id) throw new UserFacingError('현재 매장의 식자재가 아니에요.');
        setSavedNeedsRefresh(false);
        setIngredient(item);
        setName(item.name);
        setCategory(item.category);
        setUnit(item.unit);
        setCurrentStock(String(item.current_stock));
        setMinStock(String(item.min_stock));
        setLastPrice(String(item.last_price));
      })
      .catch((e) => { if (!cancelled) setFetchError(getErrorMessage(e, '식자재를 불러오지 못했습니다.')); })
      .finally(() => { if (!cancelled) setFetchLoading(false); });
    return () => { cancelled = true; };
  }, [id, store?.id, reload]);

  const isDirty = !!ingredient && (
    currentStock !== String(ingredient.current_stock)
    || (canManageStock && (name !== ingredient.name
      || category !== ingredient.category
      || unit !== ingredient.unit
      || minStock !== String(ingredient.min_stock)
      || lastPrice !== String(ingredient.last_price)))
  );
  const bypassLeaveGuard = useConfirmLeave(isDirty && !savedNeedsRefresh, { blockLeave: submitting, message: '지금 나가면 수정한 재고 정보가 저장되지 않아요.' });

  if (fetchLoading) return <SafeAreaView style={styles.container}><LoadingSpinner /></SafeAreaView>;
  if (fetchError) return <SafeAreaView style={styles.container}>{savedNeedsRefresh && <Text>재고는 저장됐어요. 저장된 정보를 다시 불러와 확인해주세요.</Text>}<ErrorMessage message={fetchError} onRetry={() => setReload(n => n + 1)} /></SafeAreaView>;
  if (!ingredient) return <SafeAreaView style={styles.container}><ErrorMessage message="식자재를 찾을 수 없습니다." /></SafeAreaView>;

  async function handleSubmit() {
    if (savingLock.current || savedNeedsRefresh || !canAdjustStock || !ingredient || ingredient.store_id !== store?.id || ingredient.id !== id) return;
    if (canManageStock && !name.trim()) {
      Alert.alert('입력 오류', '식자재명을 입력해주세요.');
      return;
    }
    savingLock.current = true;
    setSubmitting(true);
    try {
      const saved = await update(id!, canManageStock ? {
        name: name.trim(),
        category: category.trim() || '기타',
        unit,
        current_stock: parseFloat(currentStock) || 0,
        min_stock: parseFloat(minStock) || 0,
        last_price: parseFloat(lastPrice) || 0,
      } : { current_stock: parseFloat(currentStock) || 0 });
      if (active.current !== scope) return;
      if (saved?.cacheRefreshFailed) {
        setSavedNeedsRefresh(true);
        Alert.alert('저장 완료 · 새로고침 필요', '재고는 저장됐어요. 저장된 정보 다시 불러오기를 눌러 확인해주세요.');
        return;
      }
      bypassLeaveGuard();
      router.back();
    } catch (e: any) {
      if (active.current !== scope) return;
      Alert.alert('오류', getErrorMessage(e, '수정에 실패했습니다.'));
    } finally {
      savingLock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="뒤로">
          <AppIcon name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>{canManageStock ? '식자재 수정' : '재고 수량 수정'}</Text>
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting || savedNeedsRefresh || !canAdjustStock}
        >
          <Text style={styles.submitText}>{submitting ? '저장 중...' : '저장'}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          {savedNeedsRefresh && <TouchableOpacity accessibilityRole="button" onPress={() => setReload(n => n + 1)}><Text style={styles.unitHelp}>저장된 재고 다시 불러오기</Text></TouchableOpacity>}
          {!canManageStock && <Text style={styles.unitHelp}>현재 재고 수량만 수정할 수 있어요.</Text>}
          <Text style={styles.label}>식자재명 *</Text>
          <TextInput
            style={styles.input}
            value={name}
            editable={canManageStock && !submitting && !savedNeedsRefresh}
            accessibilityLabel="식자재명"
            onChangeText={setName}
            placeholder="예) 원두, 우유, 설탕"
            placeholderTextColor={Colors.gray400}
          />

          <Text style={styles.label}>카테고리</Text>
          <View style={styles.categoryChips}>
            {categories.map(c => (
              <TouchableOpacity
                key={c}
                disabled={!canManageStock || submitting || savedNeedsRefresh}
                accessibilityRole="button"
                accessibilityState={{ selected: category === c }}
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
                disabled={!canManageStock || submitting || savedNeedsRefresh}
                accessibilityRole="radio"
                accessibilityState={{ checked: unit === u }}
                style={[styles.unitChip, unit === u && styles.unitChipActive]}
                onPress={() => setUnit(u)}
              >
                <Text style={[styles.unitChipText, unit === u && styles.unitChipTextActive]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.unitHelp}>레시피에서는 같은 종류의 단위로 자동 환산돼요. oz는 무게 온스(약 28.35g)예요.</Text>

          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.label}>개수 (현재 재고)</Text>
              <TextInput
                style={[styles.input, styles.numericInput]}
                value={currentStock}
                editable={canAdjustStock && !submitting && !savedNeedsRefresh}
                accessibilityLabel="현재 재고 수량"
                onChangeText={setCurrentStock}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Colors.gray400}
              />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.label}>품절 임박 기준</Text>
              <TextInput
                style={[styles.input, styles.numericInput]}
                value={minStock}
                editable={canManageStock && !submitting && !savedNeedsRefresh}
                accessibilityLabel="품절 임박 기준"
                onChangeText={setMinStock}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={Colors.gray400}
              />
            </View>
          </View>

          <Text style={styles.label}>가격 (1{unit || '개'}당, 원)</Text>
          <TextInput
            style={[styles.input, styles.numericInput]}
            value={lastPrice}
            editable={canManageStock && !submitting && !savedNeedsRefresh}
            accessibilityLabel="식자재 단가"
            onChangeText={setLastPrice}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={Colors.gray400}
          />

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
    minWidth: 44,
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    backgroundColor: Colors.white, minHeight: 44, justifyContent: 'center' },
  categoryChipActive: { borderColor: Colors.primary, backgroundColor: Colors.bg },
  categoryChipText: { fontSize: 14, fontWeight: '600', color: Colors.gray600 },
  categoryChipTextActive: { color: Colors.primary },
  unitPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  unitChip: {
    minWidth: 44,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    backgroundColor: Colors.white, minHeight: 44, justifyContent: 'center' },
  unitChipActive: { borderColor: Colors.primary, backgroundColor: Colors.bg },
  unitChipText: { fontSize: 14, fontWeight: '600', color: Colors.gray600 },
  unitChipTextActive: { color: Colors.primary },
  unitHelp: { fontSize: 13, color: Colors.gray500, marginTop: 2 },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1, minWidth: 0 },
  numericInput: { fontFamily: Fonts.geistRegular, fontVariant: ['tabular-nums'] },
});

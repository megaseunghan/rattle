import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Image, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useOrders } from '../../lib/hooks/useOrders';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { parseOcrItems } from '../../lib/services/ocr';
import { OcrLineItem } from '../../types';

type ReviewItem = OcrLineItem & { _key: string };

const UNITS = ['개', '병', '캔', '팩', '봉', '박스', 'kg', 'g', 'L', 'ml', '장', '묶음'];
const CATEGORIES = ['식자재', '주류', '비품소모품', '기타'];

export default function OcrReviewScreen() {
  const { imageUri, ocrText } = useLocalSearchParams<{ imageUri: string; ocrText: string }>();
  const { store } = useAuth();
  const orders = useOrders();
  const { create } = orders;
  const { data: ingredients, loading: ingredientsLoading, create: createIngredient } = useIngredients();

  const [supplierName, setSupplierName] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);

  const existingSuppliers = [...new Set(orders.data.map(o => o.supplier_name).filter(Boolean))];
  const [items, setItems] = useState<ReviewItem[]>(() =>
    parseOcrItems(ocrText ?? '', ingredients).map(item => ({
      ...item,
      _key: Math.random().toString(36).slice(2),
    }))
  );
  const [imageExpanded, setImageExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // 신규 등록 모달
  const [quickAddTarget, setQuickAddTarget] = useState<number | null>(null);
  const [quickName, setQuickName] = useState('');
  const [quickCategory, setQuickCategory] = useState('식자재');
  const [quickUnit, setQuickUnit] = useState('개');
  const [quickAdding, setQuickAdding] = useState(false);

  useEffect(() => {
    if (ingredientsLoading || ingredients.length === 0) return;
    setItems(prev =>
      prev.map(item => {
        const candidates = ingredients.filter(
          ing => ing.name.includes(item.name) || item.name.includes(ing.name)
        );
        const matched = candidates.length === 1 ? candidates[0] : null;
        const matchedForPrice = matched ?? candidates[0] ?? null;
        const prev_price = matchedForPrice && matchedForPrice.last_price > 0
          ? matchedForPrice.last_price : null;
        return {
          ...item,
          matched_ingredient: matched,
          match_candidates: candidates.length > 1 ? candidates : [],
          prev_price,
        };
      })
    );
  }, [ingredientsLoading, ingredients]);

  function updateItem(index: number, patch: Partial<OcrLineItem>) {
    setItems(prev =>
      prev.map((item, i) =>
        i === index ? { ...item, ...patch } : item
      )
    );
  }

  function removeItem(index: number) {
    setItems(prev => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    setItems(prev => {
      const next = [
        ...prev,
        {
          raw: '', name: '', quantity: 1, unit: '개', unit_price: 0,
          confidence: 'low' as const, matched_ingredient: null, match_candidates: [], prev_price: null,
          _key: Math.random().toString(36).slice(2),
        },
      ];
      setEditingIndex(next.length - 1);
      return next;
    });
  }

  function openQuickAdd(index: number) {
    setQuickName(items[index].name);
    setQuickUnit(items[index].unit || '개');
    setQuickCategory('식자재');
    setQuickAddTarget(index);
  }

  function closeQuickAdd() {
    setQuickAddTarget(null);
    setQuickName('');
    setQuickCategory('식자재');
    setQuickUnit('개');
  }

  async function handleQuickAdd() {
    if (!quickName.trim()) {
      Alert.alert('입력 오류', '품목명을 입력해주세요.');
      return;
    }
    if (!store || quickAddTarget === null) return;
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
        container_unit: null,
        container_size: null,
        supplier_name: null,
      });
      // ingredients가 리프레시되면 useEffect에서 자동 매칭됨
      // 이름이 완전 일치할 경우를 위해 미리 수동 매칭
      const newIngredient = ingredients.find(i => i.name === quickName.trim());
      if (newIngredient) {
        updateItem(quickAddTarget, { matched_ingredient: newIngredient, match_candidates: [] });
      }
      Alert.alert('등록 완료', `"${quickName.trim()}"이(가) 재고에 추가되었어요.`);
      closeQuickAdd();
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setQuickAdding(false);
    }
  }

  async function handleSubmit() {
    if (!supplierName.trim()) {
      Alert.alert('거래처 필요', '거래처명을 입력해주세요.');
      return;
    }
    const validItems = items.filter(item => item.name.trim() && item.matched_ingredient);
    if (validItems.length === 0) {
      Alert.alert('등록 실패', '재고와 연결된 품목이 없어요. 품목을 선택하거나 재고에 먼저 추가해주세요.');
      return;
    }
    setSaving(true);
    try {
      await create(
        supplierName,
        orderDate,
        validItems.map(item => ({
          ingredient_id: item.matched_ingredient!.id,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
        }))
      );
      router.replace('/(tabs)/orders');
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setSaving(false);
    }
  }

  const unmatchedCount = items.filter(i => !i.matched_ingredient).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>납품서 검토</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {imageUri && (
          <TouchableOpacity
            style={styles.imageToggle}
            onPress={() => setImageExpanded(prev => !prev)}
          >
            <Ionicons
              name={imageExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={Colors.gray500}
            />
            <Text style={styles.imageToggleText}>원본 이미지 {imageExpanded ? '접기' : '펼치기'}</Text>
          </TouchableOpacity>
        )}
        {imageExpanded && imageUri && (
          <Image source={{ uri: imageUri }} style={styles.receiptImage} resizeMode="contain" />
        )}

        <View style={styles.section}>
          <Text style={styles.label}>거래처</Text>
          <View style={styles.supplierRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={supplierName}
              onChangeText={setSupplierName}
              placeholder="거래처명 입력"
              placeholderTextColor={Colors.gray400}
            />
            {existingSuppliers.length > 0 && (
              <TouchableOpacity
                style={styles.supplierPickerBtn}
                onPress={() => setShowSupplierPicker(true)}
              >
                <Text style={styles.supplierPickerBtnText}>목록</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.label}>발주일</Text>
          <TextInput
            style={styles.input}
            value={orderDate}
            onChangeText={setOrderDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.gray400}
            keyboardType="numbers-and-punctuation"
          />
        </View>

        {unmatchedCount > 0 && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning-outline" size={14} color={Colors.warning} />
            <Text style={styles.warningText}>
              {unmatchedCount}개 품목이 재고와 연결되지 않았어요. 재고에서 찾거나 신규 등록하세요.
            </Text>
          </View>
        )}

        {items.map((item, index) => (
          <OcrItemRow
            key={item._key}
            item={item}
            isEditing={editingIndex === index}
            onEdit={() => setEditingIndex(index)}
            onBlur={() => setEditingIndex(null)}
            onChange={patch => updateItem(index, patch)}
            onRemove={() => removeItem(index)}
            onQuickAdd={() => openQuickAdd(index)}
          />
        ))}

        <TouchableOpacity style={styles.addButton} onPress={addItem}>
          <Text style={styles.addButtonText}>+ 항목 추가</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitButton, saving && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.submitText}>
              발주 등록 ({items.filter(i => i.matched_ingredient).length}개)
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* 거래처 선택 모달 */}
      <Modal visible={showSupplierPicker} animationType="slide" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowSupplierPicker(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>거래처 선택</Text>
              <TouchableOpacity onPress={() => setShowSupplierPicker(false)}>
                <Text style={styles.modalClose}>닫기</Text>
              </TouchableOpacity>
            </View>
            {existingSuppliers.map(name => (
              <TouchableOpacity
                key={name}
                style={styles.supplierRow2}
                onPress={() => { setSupplierName(name); setShowSupplierPicker(false); }}
              >
                <Text style={styles.supplierRowText}>{name}</Text>
                {supplierName === name && <Text style={styles.supplierRowCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 신규 재고 등록 모달 */}
      <Modal visible={quickAddTarget !== null} animationType="slide" transparent>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeQuickAdd}>
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>재고 신규 등록</Text>
              <TouchableOpacity onPress={closeQuickAdd}>
                <Text style={styles.modalClose}>닫기</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.modalLabel}>품목명</Text>
              <TextInput
                style={styles.modalInput}
                value={quickName}
                onChangeText={setQuickName}
                placeholder="품목명 입력"
                placeholderTextColor={Colors.gray400}
                autoFocus
              />

              <Text style={styles.modalLabel}>카테고리</Text>
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

              <Text style={styles.modalLabel}>단위</Text>
              <View style={styles.chipRow}>
                {UNITS.map(u => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.chip, quickUnit === u && styles.chipActive]}
                    onPress={() => setQuickUnit(u)}
                  >
                    <Text style={[styles.chipText, quickUnit === u && styles.chipTextActive]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={closeQuickAdd}>
                  <Text style={styles.cancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, quickAdding && { opacity: 0.5 }]}
                  onPress={handleQuickAdd}
                  disabled={quickAdding}
                >
                  <Text style={styles.confirmText}>{quickAdding ? '등록 중...' : '재고에 추가'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function OcrItemRow({
  item, isEditing, onEdit, onBlur, onChange, onRemove, onQuickAdd,
}: {
  item: OcrLineItem;
  isEditing: boolean;
  onEdit: () => void;
  onBlur: () => void;
  onChange: (patch: Partial<OcrLineItem>) => void;
  onRemove: () => void;
  onQuickAdd: () => void;
}) {
  const isLowConfidence = item.confidence === 'low';
  const hasPriceChange = item.prev_price !== null && item.prev_price !== item.unit_price;
  const priceChangePct = hasPriceChange
    ? (((item.unit_price - item.prev_price!) / item.prev_price!) * 100).toFixed(1)
    : null;

  return (
    <View style={[styles.itemRow, isLowConfidence && styles.itemRowLow]}>
      <View style={styles.itemNameRow}>
        {isEditing ? (
          <TextInput
            style={styles.itemInput}
            value={item.name}
            onChangeText={name => onChange({ name, confidence: 'high' })}
            onBlur={onBlur}
            autoFocus
            placeholder="품목명"
            placeholderTextColor={Colors.gray400}
          />
        ) : (
          <TouchableOpacity onPress={onEdit} style={styles.itemNameTouchable}>
            <Text style={styles.itemName}>{item.name || '(품목명 없음)'}</Text>
          </TouchableOpacity>
        )}

        {item.matched_ingredient ? (
          <View style={styles.matchBadge}>
            <Text style={styles.matchBadgeText}>✓ {item.matched_ingredient.name}</Text>
          </View>
        ) : item.match_candidates.length > 0 ? (
          <TouchableOpacity
            style={styles.candidateBadge}
            onPress={() => {
              Alert.alert(
                '재고 선택',
                '어느 재고 항목과 연결할까요?',
                [
                  ...item.match_candidates.map(c => ({
                    text: c.name,
                    onPress: () => onChange({ matched_ingredient: c, match_candidates: [] }),
                  })),
                  { text: '취소', style: 'cancel' as const },
                ]
              );
            }}
          >
            <Text style={styles.candidateBadgeText}>후보 {item.match_candidates.length}개 ▾</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.newBadge} onPress={onQuickAdd}>
            <Text style={styles.newBadgeText}>+ 신규 등록</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={onRemove} style={styles.removeBtn}>
          <Text style={styles.removeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.itemDetails}>
        <TextInput
          style={styles.detailInput}
          value={String(item.quantity)}
          onChangeText={v => onChange({ quantity: parseFloat(v) || 0 })}
          keyboardType="numeric"
          placeholder="수량"
          placeholderTextColor={Colors.gray400}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.unitChips}>
          {UNITS.map(u => (
            <TouchableOpacity
              key={u}
              style={[styles.unitChip, item.unit === u && styles.unitChipActive]}
              onPress={() => onChange({ unit: u })}
            >
              <Text style={[styles.unitChipText, item.unit === u && styles.unitChipTextActive]}>
                {u}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TextInput
          style={styles.detailInput}
          value={String(item.unit_price)}
          onChangeText={v => onChange({ unit_price: parseInt(v.replace(/,/g, ''), 10) || 0 })}
          keyboardType="numeric"
          placeholder="단가"
          placeholderTextColor={Colors.gray400}
        />
      </View>

      {hasPriceChange && (
        <View style={styles.priceChange}>
          <Ionicons name="warning-outline" size={12} color={Colors.warning} />
          <Text style={styles.priceChangeText}>
            이전 {item.prev_price!.toLocaleString('ko-KR')}원{' '}
            {Number(priceChangePct) > 0 ? '+' : ''}{priceChangePct}%
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
  },
  title: { fontSize: 18, fontWeight: '700', color: Colors.black },
  scroll: { padding: 16, paddingBottom: 100 },
  imageToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 4,
  },
  imageToggleText: { fontSize: 14, color: Colors.gray500 },
  receiptImage: { width: '100%', height: 240, borderRadius: 12, marginBottom: 12 },
  section: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: Colors.gray100,
  },
  label: { fontSize: 12, color: Colors.gray500, marginBottom: 4, marginTop: 8 },
  input: {
    fontSize: 15, color: Colors.black, borderBottomWidth: 1,
    borderBottomColor: Colors.gray200, paddingVertical: 6,
  },
  warningBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.warning + '15', borderRadius: 10, padding: 12, marginBottom: 12,
  },
  warningText: { flex: 1, fontSize: 13, color: Colors.warning },
  itemRow: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.gray100,
  },
  itemRowLow: { borderColor: Colors.warning + '80', backgroundColor: Colors.warning + '08' },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  itemNameTouchable: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '600', color: Colors.black },
  itemInput: {
    flex: 1, fontSize: 15, fontWeight: '600', color: Colors.black,
    borderBottomWidth: 1, borderBottomColor: Colors.primary, paddingVertical: 2,
  },
  matchBadge: {
    backgroundColor: Colors.success + '20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  matchBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.success },
  candidateBadge: {
    backgroundColor: Colors.warning + '20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  candidateBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.warning },
  newBadge: {
    backgroundColor: Colors.primary + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  newBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  removeBtn: { padding: 4 },
  removeBtnText: { fontSize: 14, color: Colors.gray400 },
  itemDetails: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailInput: {
    width: 64, fontSize: 14, fontWeight: '600', color: Colors.black,
    borderBottomWidth: 1, borderBottomColor: Colors.gray200, textAlign: 'center', paddingVertical: 4,
  },
  unitChips: { flex: 1 },
  unitChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.gray200, marginRight: 6, backgroundColor: Colors.white,
  },
  unitChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  unitChipText: { fontSize: 12, fontWeight: '600', color: Colors.gray500 },
  unitChipTextActive: { color: Colors.white },
  priceChange: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  priceChangeText: { fontSize: 12, color: Colors.warning },
  addButton: {
    borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10, borderStyle: 'dashed',
    padding: 14, alignItems: 'center', marginTop: 4,
  },
  addButtonText: { fontSize: 14, color: Colors.gray500, fontWeight: '600' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, backgroundColor: Colors.white,
    borderTopWidth: 1, borderTopColor: Colors.gray100,
  },
  submitButton: {
    backgroundColor: Colors.primary, borderRadius: 12, padding: 16, alignItems: 'center',
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.black },
  modalClose: { fontSize: 15, color: Colors.primary, fontWeight: '600' },
  modalBody: { padding: 20, paddingBottom: 40 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 8, marginTop: 14 },
  modalInput: {
    backgroundColor: Colors.gray50, borderRadius: 10, borderWidth: 1, borderColor: Colors.gray200,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: Colors.black,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.gray200, backgroundColor: Colors.white,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.gray600, fontWeight: '600' },
  chipTextActive: { color: Colors.white },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.gray200, alignItems: 'center',
  },
  cancelText: { fontSize: 14, color: Colors.gray600, fontWeight: '600' },
  confirmBtn: {
    flex: 2, paddingVertical: 13, borderRadius: 10,
    backgroundColor: Colors.primary, alignItems: 'center',
  },
  confirmText: { fontSize: 14, color: Colors.white, fontWeight: '700' },
  supplierRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  supplierPickerBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.pale,
  },
  supplierPickerBtnText: { fontSize: 13, color: Colors.dark, fontWeight: '600' },
  supplierRow2: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  supplierRowText: { fontSize: 15, color: Colors.black },
  supplierRowCheck: { fontSize: 16, color: Colors.primary, fontWeight: '700' },
});

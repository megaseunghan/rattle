import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Image, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useOrders } from '../../lib/hooks/useOrders';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { clovaTextToLineItems } from '../../lib/services/ocr';
import { OcrLineItem } from '../../types';

type ReviewItem = OcrLineItem & { _key: string };

const UNITS = ['개', '병', '캔', '팩', '봉', '박스', 'kg', 'g', 'L', 'ml', '장', '묶음'];

export default function OcrReviewScreen() {
  const { imageUri, ocrText } = useLocalSearchParams<{ imageUri: string; ocrText: string }>();
  const { store } = useAuth();
  const { create } = useOrders();
  const { data: ingredients } = useIngredients();

  const [supplierName, setSupplierName] = useState('');
  const [orderDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<ReviewItem[]>(() =>
    clovaTextToLineItems(ocrText ?? '', ingredients).map(item => ({
      ...item,
      _key: Math.random().toString(36).slice(2),
    }))
  );
  const [imageExpanded, setImageExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

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

  async function handleSubmit() {
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
          <TextInput
            style={styles.input}
            value={supplierName}
            onChangeText={setSupplierName}
            placeholder="거래처명 입력"
            placeholderTextColor={Colors.gray400}
          />
          <Text style={styles.label}>발주일</Text>
          <Text style={styles.dateText}>{orderDate}</Text>
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
    </SafeAreaView>
  );
}

function OcrItemRow({
  item, isEditing, onEdit, onBlur, onChange, onRemove,
}: {
  item: OcrLineItem;
  isEditing: boolean;
  onEdit: () => void;
  onBlur: () => void;
  onChange: (patch: Partial<OcrLineItem>) => void;
  onRemove: () => void;
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
          <View style={styles.candidateBadge}>
            <Text style={styles.candidateBadgeText}>후보 {item.match_candidates.length}개</Text>
          </View>
        ) : (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>신규</Text>
          </View>
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
  dateText: { fontSize: 15, color: Colors.gray700, paddingVertical: 6 },
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
    backgroundColor: Colors.gray100, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  newBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.gray500 },
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
});

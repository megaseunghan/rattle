import { SheetModal } from '../../lib/components/ui/SheetModal';
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { getPurchaseById, getPurchaseItems, updatePurchaseItem } from '../../lib/services/purchases';
import { Purchase, PurchaseItem } from '../../types';
import { getErrorMessage } from '../../lib/utils/error';
import { animateListChange } from '../../lib/utils/layoutAnimation';

export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<PurchaseItem | null>(null);
  const [editQuantity, setEditQuantity] = useState('');
  const [editUnitPrice, setEditUnitPrice] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [p, its] = await Promise.all([getPurchaseById(id), getPurchaseItems(id)]);
      setPurchase(p);
      setItems(its);
    } catch (e: any) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  function openEdit(item: PurchaseItem) {
    setEditTarget(item);
    setEditQuantity(String(item.quantity));
    setEditUnitPrice(String(item.unit_price));
  }

  async function handleSaveEdit() {
    if (!editTarget) return;
    const qty = Number(editQuantity.replace(/,/g, ''));
    const price = Number(editUnitPrice.replace(/,/g, ''));
    if (!qty || qty <= 0) { Alert.alert('입력 오류', '수량을 올바르게 입력해주세요.'); return; }
    if (!price || price <= 0) { Alert.alert('입력 오류', '단가를 올바르게 입력해주세요.'); return; }

    setSaving(true);
    try {
      await updatePurchaseItem(editTarget.id, qty, price);
      animateListChange();
      setEditTarget(null);
      await load();
    } catch (e: unknown) {
      Alert.alert('저장 실패', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerAction} accessibilityRole="button" accessibilityLabel="뒤로">
          <Ionicons name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>매입 상세</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : purchase ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.summaryCard}>
            <Text style={styles.supplier}>{purchase.supplier || '거래처 미입력'}</Text>
            <View style={styles.pillRow}>
              <View style={styles.pill}><Text style={styles.pillText}>{purchase.category}</Text></View>
              <View style={styles.pill}><Text style={styles.pillText}>{purchase.type}</Text></View>
            </View>
            <Text style={styles.date}>{purchase.date}</Text>
            <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{purchase.amount.toLocaleString()}원</Text>
          </View>

          <Text style={styles.sectionLabel}>품목</Text>
          {items.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>금액만 입력된 매입이에요</Text>
            </View>
          ) : (
            <View style={styles.listCard}>
              {items.map((it, i) => (
                <TouchableOpacity
                  key={it.id}
                  style={[styles.itemRow, i < items.length - 1 && styles.rowBorder]}
                  onPress={() => openEdit(it)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{it.name}</Text>
                    <Text style={styles.itemSub}>
                      {it.quantity}{it.unit} × {it.unit_price.toLocaleString()}원
                      {it.ingredient_id ? '  · 재고 반영' : ''}
                    </Text>
                  </View>
                  <Text style={styles.itemSubtotal}>{it.subtotal.toLocaleString()}원</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      ) : null}

      <SheetModal visible={editTarget != null} onRequestClose={() => setEditTarget(null)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.sheetHeader}>
              <TouchableOpacity onPress={() => setEditTarget(null)} hitSlop={8} style={styles.headerAction}>
                <Text style={styles.sheetCancelText}>취소</Text>
              </TouchableOpacity>
              <Text style={styles.sheetHeaderTitle}>{editTarget?.name}</Text>
              <TouchableOpacity onPress={handleSaveEdit} disabled={saving} hitSlop={8} style={styles.headerAction}>
                {saving
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Text style={styles.sheetSaveText}>저장</Text>}
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>수량 ({editTarget?.unit})</Text>
            <TextInput
              style={styles.input}
              value={editQuantity}
              onChangeText={setEditQuantity}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={Colors.gray300}
            />

            <Text style={styles.fieldLabel}>단가 (원/{editTarget?.unit})</Text>
            <TextInput
              style={styles.input}
              value={editUnitPrice}
              onChangeText={setEditUnitPrice}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={Colors.gray300}
            />

            <Text style={styles.editSubtotal}>
              합계 {((Number(editQuantity.replace(/,/g, '')) || 0) * (Number(editUnitPrice.replace(/,/g, '')) || 0)).toLocaleString()}원
            </Text>
          </View>
        </KeyboardAvoidingView>
      </SheetModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerAction: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  container: { flex: 1, backgroundColor: Colors.homeCanvas},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16, backgroundColor: Colors.homeCanvas, borderBottomWidth: 0, borderBottomColor: Colors.homeBorder },
  title: { fontSize: 22, fontWeight: '700', color: Colors.black, flexShrink: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 14, color: Colors.gray500 },
  scroll: { padding: 20, gap: 16, paddingBottom: 40 },

  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    padding: 20,
    gap: 6,
  },
  supplier: { fontSize: 18, fontWeight: '700', color: Colors.black },
  pillRow: { flexDirection: 'row', gap: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: Colors.gray100 },
  pillText: { fontSize: 11, color: Colors.gray500 },
  date: { fontSize: 13, color: Colors.gray500, marginTop: 2 },
  amount: { fontFamily: Fonts.spaceGroteskBold, fontSize: 26, fontWeight: '800', color: Colors.black, marginTop: 4 },

  sectionLabel: { fontSize: 13, fontWeight: '500', color: Colors.gray600,  },
  listCard: { backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder},
  emptyCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: { fontSize: 14, color: Colors.gray400 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 10 },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.gray100 },
  itemName: { fontSize: 14, fontWeight: '500', color: Colors.black },
  itemSub: { fontSize: 13, color: Colors.gray500, marginTop: 2 },
  itemSubtotal: { fontSize: 14, fontWeight: '600', color: Colors.black },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlay },
  modalSheet: { backgroundColor: Colors.homeCanvas, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20},
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.gray200, alignSelf: 'center', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100 },
  sheetHeaderTitle: { fontSize: 16, fontWeight: '700', color: Colors.black, flex: 1, textAlign: 'center' },
  sheetCancelText: { fontSize: 15, fontWeight: '500', color: Colors.gray500 },
  sheetSaveText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.homeBorder,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.black, minHeight: 44 },
  editSubtotal: { fontSize: 14, fontWeight: '600', color: Colors.gray600, marginTop: 20, textAlign: 'right' },
});

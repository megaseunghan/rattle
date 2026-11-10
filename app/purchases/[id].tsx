import { SheetModal } from '../../lib/components/ui/SheetModal';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../../lib/icons/AppIcon';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { getPurchaseById, getPurchaseItems, updatePurchaseItem } from '../../lib/services/purchases';
import { Purchase, PurchaseItem } from '../../types';
import { getErrorMessage } from '../../lib/utils/error';
import { useAuth } from '../../lib/contexts/AuthContext';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { animateListChange } from '../../lib/utils/layoutAnimation';

export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { store, user } = useAuth();
  const scope = useMemo(() => ({}), [id, store?.id, user?.id]);
  const active = useRef<object | null>(scope); active.current = scope;
  const request = useRef(0), saveLock = useRef(false);
  const [result, setResult] = useState<{ scope: object; purchase: Purchase | null; items: PurchaseItem[]; error: string | null } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [savedNeedsRefresh, setSavedNeedsRefresh] = useState(false);
  const purchase = result?.scope === scope ? result.purchase : null;
  const items = result?.scope === scope ? result.items : [];
  const error = result?.scope === scope ? result.error : null;
  const loading = fetching || result?.scope !== scope;

  const [editTarget, setEditTarget] = useState<PurchaseItem | null>(null);
  const [editQuantity, setEditQuantity] = useState('');
  const [editUnitPrice, setEditUnitPrice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const call = ++request.current;
    const current = () => active.current === scope && call === request.current;
    if (!id || !store) {
      setFetching(false);
      setResult({ scope, purchase: null, items: [], error: '매장과 매입 내역을 확인해주세요.' });
      return false;
    }
    setFetching(true);
    try {
      const [p, its] = await Promise.all([getPurchaseById(id), getPurchaseItems(id)]);
      if (!current()) return false;
      if (p.store_id !== store.id) throw new Error('PURCHASE_STORE_MISMATCH');
      setResult({ scope, purchase: p, items: its, error: null });
      setSavedNeedsRefresh(false);
      return true;
    } catch (e) {
      if (current()) setResult(previous => ({ scope, purchase: previous?.scope === scope ? previous.purchase : null, items: previous?.scope === scope ? previous.items : [], error: getErrorMessage(e) }));
      return false;
    } finally { if (current()) setFetching(false); }
  }, [id, scope, store?.id]);
  useEffect(() => {
    active.current = scope; setEditTarget(null); setSavedNeedsRefresh(false);
    void load();
    return () => { active.current = null; request.current += 1; };
  }, [load, scope]);

  function openEdit(item: PurchaseItem) {
    if (savedNeedsRefresh || saving || error) return;
    setEditTarget(item);
    setEditQuantity(String(item.quantity));
    setEditUnitPrice(String(item.unit_price));
  }

  async function handleSaveEdit() {
    if (!editTarget || saveLock.current || savedNeedsRefresh) return;
    const qty = Number(editQuantity.replace(/,/g, ''));
    const price = Number(editUnitPrice.replace(/,/g, ''));
    if (!Number.isFinite(qty) || qty <= 0) { Alert.alert('입력 오류', '수량을 올바르게 입력해주세요.'); return; }
    if (!Number.isFinite(price) || price <= 0) { Alert.alert('입력 오류', '단가를 올바르게 입력해주세요.'); return; }

    saveLock.current = true;
    setSaving(true);
    try {
      await updatePurchaseItem(editTarget.id, qty, price);
      if (active.current !== scope) return;
      setSavedNeedsRefresh(true);
      animateListChange();
      setEditTarget(null);
      const refreshed = await load();
      if (!refreshed && active.current === scope) Alert.alert('저장 완료 · 새로고침 필요', '품목 수정은 저장됐어요. 다시 불러오기로 현재 내역을 확인해주세요.');
    } catch (e: unknown) {
      if (active.current !== scope) return;
      Alert.alert('저장 실패', getErrorMessage(e));
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerAction} accessibilityRole="button" accessibilityLabel="뒤로">
          <AppIcon name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>매입 상세</Text>
        <View style={{ width: 44 }} />
      </View>

      {savedNeedsRefresh && result?.scope === scope && <Text accessibilityRole="alert" style={styles.errorText}>품목 수정은 저장됐어요. 현재 내역을 다시 불러와 확인해주세요.</Text>}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <ErrorMessage message={error} onRetry={() => { void load(); }} />
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
                  accessibilityRole="button"
                  accessibilityLabel={`${it.name}, ${it.quantity}${it.unit}, 단가 ${it.unit_price.toLocaleString()}원, 소계 ${it.subtotal.toLocaleString()}원, 수정`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{it.name}</Text>
                    <Text style={styles.itemSub}>
                      {it.quantity}{it.unit} × {it.unit_price.toLocaleString()}원
                      {it.ingredient_id ? '  · 재고 반영' : ''}
                    </Text>
                  </View>
                  <Text style={styles.itemSubtotal}>{it.subtotal.toLocaleString()}원</Text>
                  <AppIcon name="chevron-forward" size={16} color={Colors.gray300} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      ) : null}

      <SheetModal visible={editTarget != null} onRequestClose={() => { if (!saving) setEditTarget(null); }}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.sheetHeader}>
              <TouchableOpacity disabled={saving} onPress={() => setEditTarget(null)} style={styles.headerAction} accessibilityRole="button">
                <Text style={styles.sheetCancelText}>취소</Text>
              </TouchableOpacity>
              <Text style={styles.sheetHeaderTitle}>{editTarget?.name}</Text>
              <TouchableOpacity onPress={handleSaveEdit} disabled={saving} style={styles.headerAction} accessibilityRole="button" accessibilityLabel="품목 수정 저장" accessibilityState={{ disabled: saving, busy: saving }}>
                {saving
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Text style={styles.sheetSaveText}>저장</Text>}
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>수량 ({editTarget?.unit})</Text>
            <TextInput
              style={styles.input}
              accessibilityLabel="매입 품목 수량"
              editable={!saving}
              value={editQuantity}
              onChangeText={setEditQuantity}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={Colors.gray300}
            />

            <Text style={styles.fieldLabel}>단가 (원/{editTarget?.unit})</Text>
            <TextInput
              style={styles.input}
              accessibilityLabel="매입 품목 단가"
              editable={!saving}
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
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: Colors.gray100 },
  pillText: { fontSize: 11, color: Colors.gray500 },
  date: { fontSize: 13, color: Colors.gray500, marginTop: 2 },
  amount: { fontFamily: Fonts.spaceGroteskBold, fontVariant: ['tabular-nums'], fontSize: 26, fontWeight: '800', color: Colors.black, marginTop: 4 },

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
  itemSub: { fontVariant: ['tabular-nums'], fontSize: 13, color: Colors.gray500, marginTop: 2 },
  itemSubtotal: { flexShrink: 1, fontFamily: Fonts.geistSemiBold, fontVariant: ['tabular-nums'], fontSize: 14, fontWeight: '600', color: Colors.black },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlay },
  modalSheet: { backgroundColor: Colors.homeCanvas, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20},
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.gray200, alignSelf: 'center', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 16, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100 },
  sheetHeaderTitle: { fontSize: 16, fontWeight: '700', color: Colors.black, flex: 1, textAlign: 'center' },
  sheetCancelText: { fontSize: 15, fontWeight: '500', color: Colors.gray500 },
  sheetSaveText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600, marginBottom: 6, marginTop: 14 },
  input: {
    fontFamily: Fonts.geistRegular, fontVariant: ['tabular-nums'],
    backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.homeBorder,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.black, minHeight: 44 },
  editSubtotal: { fontFamily: Fonts.geistSemiBold, fontVariant: ['tabular-nums'], fontSize: 14, fontWeight: '600', color: Colors.gray600, marginTop: 20, textAlign: 'right' },
});

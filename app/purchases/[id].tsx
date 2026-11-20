import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { EvidenceStagingPanel } from '../../lib/components/EvidenceStagingPanel';
import { PurchaseReceiptReview } from '../../lib/components/PurchaseReceiptReview';
import { usePurchaseReceipt } from '../../lib/hooks/usePurchaseReceipt';
import { useStorePermissions } from '../../lib/hooks/useStorePermissions';
import { disposeEvidenceCache } from '../../lib/media/evidencePicker';
import type { EvidenceSelection } from '../../lib/types/evidence';
import { usePreviewWriteGuard } from '../../lib/hooks/usePreviewWriteGuard';
import { EvidencePanel } from '../../lib/components/EvidencePanel';
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
import { getPurchaseById, getPurchaseItems, updatePurchaseItem, updatePurchaseAmounts } from '../../lib/services/purchases';
import { purchaseCategoryTaxonomy } from '../../lib/services/purchaseCategories';
import { PurchaseItem } from '../../types';
import { getErrorMessage } from '../../lib/utils/error';
import { useAuth } from '../../lib/contexts/AuthContext';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { animateListChange } from '../../lib/utils/layoutAnimation';

export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { store, user, storeRole, permissionRevision, canReadFinancials, devPreviewMode } = useAuth();
  return <PurchaseDetailContent key={[id, store?.id, user?.id, storeRole, permissionRevision, canReadFinancials, devPreviewMode].join(':')} id={id} />;
}

function PurchaseDetailContent({ id }: { id: string }) {
  const { store, user } = useAuth();
  const { canManageStock, canReadFinancials } = useStorePermissions();
  const [photos, setPhotos] = useState<EvidenceSelection[]>([]);
  const [uploadBatch, setUploadBatch] = useState<EvidenceSelection[]>([]);
  const [panelKey, setPanelKey] = useState('existing');
  const [pending, setPending] = useState(0);
  const onPending = useCallback((count: number) => {
    setPending(count);
    if (!count) setUploadBatch(previous => previous.length ? [] : previous);
  }, []);
  const [picking, setPicking] = useState(false);
  const editScroll = useRef<ScrollView>(null);
  const cache = useRef(new Set<string>());
  const receipt = usePurchaseReceipt(photos);
  useEffect(() => () => cache.current.forEach(disposeEvidenceCache), []);
  function changePhotos(next: EvidenceSelection[]) {
    for (const photo of photos) {
      if (!next.some(file => file.id === photo.id)) {
        disposeEvidenceCache(photo.uri);
        cache.current.delete(photo.uri);
      }
    }
    next.forEach(file => cache.current.add(file.uri));
    setPhotos(next);
  }
  const { canWrite } = usePreviewWriteGuard();
  const scope = useMemo(() => ({}), [id, store?.id, user?.id]);
  const active = useRef<object | null>(scope); active.current = scope;
  const request = useRef(0), saveLock = useRef(false);
  const [result, setResult] = useState<{ scope: object; purchase: Awaited<ReturnType<typeof getPurchaseById>> | null; items: PurchaseItem[]; error: string | null } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [savedNeedsRefresh, setSavedNeedsRefresh] = useState(false);
  const purchase = result?.scope === scope ? result.purchase : null;
  const items = result?.scope === scope ? result.items : [];
  const error = result?.scope === scope ? result.error : null;
  const loading = fetching || result?.scope !== scope;

  const [amountRows, setAmountRows] = useState<{ category: string; value: string; initial: string }[] | null>(null);
  const [editTarget, setEditTarget] = useState<PurchaseItem | null>(null);
  const [editQuantity, setEditQuantity] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const quantity = Number(editQuantity.replace(/,/g, ''));
  const amountText = editAmount.replace(/,/g, '').trim();
  const amount = Number(amountText);
  const validAmount = /^\d+$/.test(amountText) && Number.isSafeInteger(amount) && amount < 1e12;
  const validQuantity = Number.isFinite(quantity) && quantity > 0 && quantity < 1e9;
  const unitPrice = validAmount && validQuantity ? Math.round(amount / quantity) : null;
  const [saving, setSaving] = useState(false);

  const [editSaved, setEditSaved] = useState(false);
  const navigation = useNavigation();
  const dirtyEdit = !!amountRows?.some(row => row.initial !== row.value) || !!editTarget && (photos.length > 0 || editQuantity !== String(editTarget.quantity)
    || editAmount !== String(Math.round(editTarget.subtotal)));
  function confirmDiscard(leave: () => void, leavingScreen: boolean) {
    if (saving || saveLock.current || picking) {
      Alert.alert('처리 중이에요', '저장이나 사진 선택이 끝난 뒤 이동해 주세요.');
      return;
    }
    const pendingUpload = leavingScreen && pending > 0;
    if (!dirtyEdit && !pendingUpload) { leave(); return; }
    const details = [
      dirtyEdit && (amountRows ? '저장하지 않은 금액 수정이 사라져요.' : '저장하지 않은 품목 수정과 선택한 사진이 사라져요.'),
      pendingUpload && '올리지 못한 증빙은 사진을 다시 선택해야 해요. 이 화면에서 업로드를 마치거나 실패한 파일을 다시 올릴 수 있어요.',
    ].filter(Boolean).join(' ');
    Alert.alert('이대로 나갈까요?', details, [
      { text: '계속하기', style: 'cancel' },
      { text: '나가기', style: 'destructive', onPress: leave },
    ]);
  }
  // Native stack guards hardware back, edge swipes and navigation actions alike.
  usePreventRemove(dirtyEdit || saving || picking || pending > 0, ({ data }) =>
    confirmDiscard(() => navigation.dispatch(data.action), true));
  function cancelEdit() {
    confirmDiscard(() => {
      changePhotos([]);
      setEditTarget(null);
      setAmountRows(null);
    }, false);
  }

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
    setEditAmount(String(Math.round(item.subtotal)));
  }

  async function openAmountEdit() {
    if (!purchase?.hasAmountLines || !canWrite() || saveLock.current || savedNeedsRefresh) return;
    saveLock.current = true;
    setSaving(true);
    try {
      const categories = await purchaseCategoryTaxonomy.getCategories(purchase.store_id);
      if (active.current !== scope) return;
      const amounts = purchase.category_amounts ?? {};
      setAmountRows([...new Set([...Object.keys(amounts), ...categories])].map(category => {
        const initial = Object.prototype.hasOwnProperty.call(amounts, category) ? String(amounts[category]) : '';
        return { category, initial, value: initial };
      }));
    } catch (e) {
      if (active.current === scope) Alert.alert('분류를 불러오지 못했어요', getErrorMessage(e));
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    if (picking || receipt.busy || (!editTarget && !amountRows) || saveLock.current || savedNeedsRefresh) return;
    if (editTarget && !validQuantity) { Alert.alert('입력 오류', '수량을 올바르게 입력해주세요.'); return; }
    if (editTarget && !validAmount) { Alert.alert('입력 오류', '금액을 0원 이상의 정수로 입력해주세요.'); return; }

    saveLock.current = true;
    setSaving(true);
    try {
      if (!canWrite()) return;
      if (amountRows && purchase) {
        const rows = amountRows.map(({ category, value }) => ({ category, amount: Number(value) }));
        if (amountRows.some(row => !/^\d*$/.test(row.value)) || !rows.some(row => row.amount > 0)
          || rows.reduce((sum, row) => sum + row.amount, 0) >= 1e12) {
          Alert.alert('금액 확인', '적어도 한 분류에 원 단위 금액을 입력해주세요.');
          return;
        }
        await updatePurchaseAmounts(purchase, rows);
      } else if (editTarget) {
        await updatePurchaseItem(editTarget.id, quantity, amount === Math.round(editTarget.subtotal) ? null : amount);
      } else return;
      if (active.current !== scope) return;
      if (photos.length) {
        setPending(photos.length);
        setPanelKey(photos[0].id);
        setUploadBatch(photos);
        setPhotos([]);
      }
      setEditSaved(true);
      setSavedNeedsRefresh(true);
      animateListChange();
      setEditTarget(null);
      setAmountRows(null);
      const refreshed = await load();
      if (!refreshed && active.current === scope) Alert.alert('저장 완료 · 새로고침 필요', editLabel + '은 저장됐어요. 다시 불러오기로 현재 내역을 확인해주세요.');
    } catch (e: unknown) {
      if (active.current !== scope) return;
      if (amountRows && (e as {outcome?: string} | null)?.outcome === 'unknown') {
        setAmountRows(null);
        Alert.alert('저장 결과 확인', '현재 매입을 다시 불러와 금액을 확인해주세요.');
        await load();
      } else Alert.alert('저장 실패', getErrorMessage(e));
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  const editLabel = purchase?.hasAmountLines ? '금액 수정' : '품목 수정';
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerAction} accessibilityRole="button" accessibilityLabel="뒤로">
          <AppIcon name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>매입 상세</Text>
        <View style={{ width: 44 }} />
      </View>

      {pending > 0 && <Text accessibilityLiveRegion="polite" style={styles.errorText}>
        {editSaved ? '품목 수정을 저장했어요. ' : ''}증빙 {pending}개가 남았어요. 실패한 파일은 증빙 자료에서 다시 올려주세요.
      </Text>}
      {editSaved && !pending && !savedNeedsRefresh && <Text accessibilityLiveRegion="polite" style={styles.date}>{editLabel}을 저장했어요.</Text>}
      {savedNeedsRefresh && result?.scope === scope && <Text accessibilityRole="alert" style={styles.errorText}>{editLabel}은 저장됐어요. 현재 내역을 다시 불러와 확인해주세요.</Text>}
      {loading && !purchase ? (
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
              <View style={styles.pill}><Text style={styles.pillText}>{Object.keys(purchase.category_amounts ?? { [purchase.category]: purchase.amount }).join(' · ')}</Text></View>
              <View style={styles.pill}><Text style={styles.pillText}>{purchase.type}</Text></View>
            </View>
            <Text style={styles.date}>{purchase.date}</Text>
            <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{purchase.amount.toLocaleString()}원</Text>
          </View>

          {store && <EvidencePanel key={panelKey} initialSelections={uploadBatch} initiallyExpanded={uploadBatch.length > 0} onPendingChange={onPending} target={{ kind: 'purchase', id: purchase.id, storeId: store.id }} disabled={saving} />}
          <Text style={styles.sectionLabel}>품목</Text>
          {items.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>금액만 입력된 매입이에요</Text>
              {Object.entries(purchase.category_amounts ?? {}).map(([category, amount]) =>
                <Text key={category} style={styles.emptyText}>{category} · {amount.toLocaleString()}원</Text>)}
              {purchase.hasAmountLines && <TouchableOpacity accessibilityRole="button" disabled={saving || savedNeedsRefresh}
                onPress={openAmountEdit} style={styles.headerAction}><Text style={styles.sheetSaveText}>금액 수정</Text></TouchableOpacity>}
            </View>
          ) : (
            <View style={styles.listCard}>
              {items.map((it, i) => (
                <TouchableOpacity
                  key={it.id}
                  style={[styles.itemRow, i < items.length - 1 && styles.rowBorder]}
                  disabled={saving || !!error || savedNeedsRefresh}
                  onPress={() => openEdit(it)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${it.name}, ${it.quantity}${it.unit}, 단가 ${Math.round(it.unit_price).toLocaleString()}원, 소계 ${it.subtotal.toLocaleString()}원, 수정`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{it.name}</Text>
                    <Text style={styles.itemSub}>
                      {it.quantity}{it.unit} × {Math.round(it.unit_price).toLocaleString()}원
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

      <SheetModal visible={editTarget != null || amountRows != null} onRequestClose={cancelEdit}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView edges={['bottom']} style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.sheetHeader}>
              <TouchableOpacity disabled={saving} onPress={cancelEdit} style={styles.headerAction} accessibilityRole="button">
                <Text style={styles.sheetCancelText}>취소</Text>
              </TouchableOpacity>
              <Text style={styles.sheetHeaderTitle}>{amountRows ? '금액 수정' : editTarget?.name}</Text>
              <TouchableOpacity onPress={handleSaveEdit} disabled={saving || picking || receipt.busy} style={styles.headerAction} accessibilityRole="button" accessibilityLabel={amountRows ? '금액 수정 저장' : '품목 수정 저장'} accessibilityState={{ disabled: saving, busy: saving }}>
                {saving
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Text style={styles.sheetSaveText}>저장</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView ref={editScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
            {amountRows ? amountRows.map(({category, value}) => <View key={category}>
              <Text style={styles.fieldLabel}>{category} (원)</Text>
              <TextInput style={styles.input} accessibilityLabel={category + ' 금액'} keyboardType="number-pad"
                value={value} placeholder="0" editable={!saving} onChangeText={text => setAmountRows(previous =>
                  previous?.map(row => row.category === category ? {...row, value: text.replace(/,/g, '').trim()} : row) ?? null)} />
            </View>) : <>
            {pending > 0 && <Text>진행 중인 증빙을 올리거나 취소한 뒤 사진을 추가할 수 있어요.</Text>}
            {editTarget && canManageStock && canReadFinancials && !pending && <>
              <EvidenceStagingPanel files={photos} onChange={changePhotos} disabled={saving} onPickingChange={setPicking} edit />
              <PurchaseReceiptReview draft={receipt} editing disabled={saving} application={row => {
                if (row.name.value !== editTarget.name || (!row.quantity && !row.amount)) return;
                return { label: editTarget.name + '에 적용 (' + editTarget.unit + ')', apply: () => {
                  if (row.quantity) setEditQuantity(String(row.quantity.value));
                  if (row.amount) setEditAmount(String(row.amount.value));
                } };
              }} />
            </>}
            <Text style={styles.fieldLabel}>수량 ({editTarget?.unit})</Text>
            <TextInput
              onFocus={event => editScroll.current?.getScrollResponder()?.scrollResponderScrollNativeHandleToKeyboard(event.nativeEvent.target, 24, true)}
              style={styles.input}
              accessibilityLabel="매입 품목 수량"
              editable={!saving}
              value={editQuantity}
              onChangeText={setEditQuantity}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={Colors.gray300}
            />

            <Text style={styles.fieldLabel}>금액 (원)</Text>
            <TextInput
              onFocus={event => editScroll.current?.getScrollResponder()?.scrollResponderScrollNativeHandleToKeyboard(event.nativeEvent.target, 24, true)}
              style={styles.input}
              accessibilityLabel="매입 품목 금액"
              editable={!saving}
              value={editAmount}
              onChangeText={setEditAmount}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={Colors.gray300}
            />

            <Text style={styles.editSubtotal}>
              단가 {unitPrice == null ? '—' : unitPrice.toLocaleString() + '원'}
            </Text>
            </>}
            </ScrollView>
          </SafeAreaView>
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
  modalSheet: { height: '90%', backgroundColor: Colors.homeCanvas, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20},
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

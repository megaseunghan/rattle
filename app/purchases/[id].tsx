/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md · designed-as-app
 * 매입 상세·수정 확정 시안 purchase-edit-v2(2026-11-23): 상세에서 바로 고치기, 바꾼 뒤에만 [취소 | 변경 저장]. 서버 수정 범위는 그대로다. */
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePurchaseTypes } from '../../lib/hooks/usePurchaseTypes';
import { MAX_TOTAL, itemAmountError } from '../../lib/utils/purchaseDraft';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { useAuth } from '../../lib/contexts/AuthContext';
import { usePreviewWriteGuard } from '../../lib/hooks/usePreviewWriteGuard';
import { deletePurchase, getPurchaseById, getPurchaseItems, updatePurchaseAmounts, updatePurchaseItems } from '../../lib/services/purchases';
import { purchaseCategoryTaxonomy } from '../../lib/services/purchaseCategories';
import type { PurchaseItem } from '../../types';
import { getErrorMessage } from '../../lib/utils/error';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { AppIcon } from '../../lib/icons/AppIcon';
import { EvidencePanel, type EvidenceUploadStatus } from '../../lib/components/EvidencePanel';
import { dateLabel } from '../../lib/components/purchase/PurchaseHeaderCard';
import { AmountLine } from '../../lib/components/purchase/PurchaseEntryInputs';
import { LatestAmount, PurchaseItemEditRow, itemBase, type ItemDraft } from '../../lib/components/purchase/PurchaseItemEditRow';
import { BarButton, BlueNotice, BottomBar, CardHeader, FieldError, InlineToast, PurchaseAppBar, PurchaseCard, ui, useBarToast, useKeyboardScroll, won } from '../../lib/components/purchase/PurchaseUi';

const TOAST_MS = 2000;
const LEAVE_AFTER_DELETE_MS = 900;
const STORE_MISMATCH = 'PURCHASE_STORE_MISMATCH';
type Loaded = Awaited<ReturnType<typeof getPurchaseById>>;

export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { store, user, storeRole, canReadFinancials, devPreviewMode } = useAuth();
  return <PurchaseDetailContent key={[id, store?.id, user?.id, storeRole, canReadFinancials, devPreviewMode].join(':')} id={id} />;
}

function parseDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function PurchaseDetailContent({ id }: { id: string }) {
  const { store } = useAuth();
  const { canWrite, assertCanWrite } = usePreviewWriteGuard();
  // 매입·매장·계정이 바뀌면 부모 key로 다시 마운트되므로, 여기서는 마운트 여부와 마지막 요청만 확인한다.
  const alive = useRef(true), request = useRef(0), saveLock = useRef(false);
  const [purchase, setPurchase] = useState<Loaded | null>(null);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const purchaseTypes = usePurchaseTypes();

  const [taxonomy, setTaxonomy] = useState<string[]>([]);
  // 실제로 고친 칸만 둔다. 다른 곳에서 먼저 고친 뒤에는 손대지 않은 칸이 최신 값을 따른다.
  const [itemDrafts, setItemDrafts] = useState<Record<string, Partial<ItemDraft>>>({});
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  // 수량 패널을 연 품목. 금액은 줄에서 바로 고치므로 따로 열지 않는다.
  const [open, setOpen] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const [menu, setMenu] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [toast, setToast] = useState('');
  const [upload, setUpload] = useState<EvidenceUploadStatus>({ pending: 0, failed: 0, uploading: 0 });
  const onUploadStatus = useCallback((status: EvidenceUploadStatus) => setUpload(status), []);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  function showToast(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), TOAST_MS);
  }

  const load = useCallback(async () => {
    const call = ++request.current;
    const current = () => alive.current && call === request.current;
    if (!id || !store) {
      setLoading(false);
      setError('매입을 찾지 못했어요. 목록에서 다시 열어 주세요.');
      return false;
    }
    setLoading(true);
    try {
      // 헤더 버전을 먼저 읽는다. 사이에 변경된 품목은 저장 시 그 버전으로 거절된다.
      const p = await getPurchaseById(id);
      const its = await getPurchaseItems(id);
      if (!current()) return false;
      if (p.store_id !== store.id) throw new Error(STORE_MISMATCH);
      setPurchase(p); setItems(its); setError(null);
      setRefreshNeeded(false);
      return true;
    } catch (e) {
      if (current()) setError(e instanceof Error && e.message === STORE_MISMATCH ? '다른 매장의 매입이에요. 매장을 바꾼 뒤 다시 열어 주세요.' : getErrorMessage(e));
      return false;
    } finally { if (current()) setLoading(false); }
  }, [id, store?.id]);
  useEffect(() => {
    alive.current = true;
    void load();
    return () => { alive.current = false; request.current += 1; };
  }, [load]);

  const amountMode = !!purchase?.hasAmountLines;
  useEffect(() => {
    if (!amountMode || !purchase) return;
    let current = true;
    purchaseCategoryTaxonomy.getCategories(purchase.store_id).then(list => { if (current) setTaxonomy(list); }).catch(() => {});
    return () => { current = false; };
  }, [amountMode, purchase?.store_id]);

  const baseAmounts = purchase?.category_amounts ?? {};
  // 등록 화면과 같은 카테고리 순서를 먼저 두고, 지금 목록에 없는 옛 카테고리는 뒤에 붙인다.
  const amountCategories = [...new Set([...taxonomy, ...Object.keys(baseAmounts)])];
  const baseAmountText = (category: string) => Object.prototype.hasOwnProperty.call(baseAmounts, category) ? String(baseAmounts[category]) : '';
  const amountValue = (category: string) => amountDrafts[category] ?? baseAmountText(category);
  const effective = (item: PurchaseItem): ItemDraft => ({ ...itemBase(item), ...itemDrafts[item.id] });
  const changedItems = items.filter(item => {
    const draft = effective(item);
    const base = itemBase(item);
    return draft.quantity !== base.quantity || draft.amount !== base.amount;
  });
  const changedAmounts = amountCategories.filter(category => (Number(amountValue(category)) || 0) !== (Number(baseAmountText(category)) || 0));
  const dirty = amountMode ? changedAmounts.length > 0 : changedItems.length > 0;
  const original = purchase?.amount ?? 0;
  const draftTotal = !purchase ? 0 : amountMode
    ? amountCategories.reduce((sum, category) => sum + (Number(amountValue(category)) || 0), 0)
    : items.length ? items.reduce((sum, item) => sum + (Number(effective(item).amount) || 0), 0) : original;
  const editable = !!purchase && !saving && !refreshNeeded && !deleted;

  const navigation = useNavigation();
  usePreventRemove(!deleted && (dirty || saving || upload.pending > 0), ({ data }) => {
    if (saving) { Alert.alert('저장하고 있어요', '저장이 끝난 뒤 이동해 주세요.'); return; }
    const details = [
      dirty && '고친 내용이 저장되지 않아요.',
      upload.pending > 0 && '아직 올리지 못한 사진은 다시 골라야 해요.',
    ].filter(Boolean).join(' ');
    Alert.alert('이대로 나갈까요?', details, [
      { text: '계속하기', style: 'cancel' },
      { text: '나가기', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  function resetDrafts() {
    setItemDrafts({}); setAmountDrafts({}); setRowErrors({}); setFormError(''); setConflict(false); setOpen(null);
  }

  function validate(): boolean {
    if (amountMode) {
      const values = amountCategories.map(category => amountValue(category));
      const total = values.reduce((sum, value) => sum + (Number(value) || 0), 0);
      const message = values.some(value => !/^\d*$/.test(value)) ? '금액은 원 단위 숫자로 입력해 주세요.'
        : total <= 0 ? '적어도 한 카테고리에 금액을 입력해 주세요.' : total >= MAX_TOTAL ? '합계를 확인해 주세요.' : '';
      setFormError(message);
      return !message;
    }
    const errors: Record<string, string> = {};
    for (const item of changedItems) {
      const draft = effective(item);
      const message = itemAmountError(draft.amount, Number(draft.quantity));
      if (message) errors[item.id] = message;
    }
    setRowErrors(errors);
    return !Object.keys(errors).length;
  }

  async function handleSave() {
    if (!purchase || !dirty || saveLock.current || refreshNeeded || !canWrite()) return;
    if (!validate()) return;
    saveLock.current = true;
    setSaving(true);
    setOpen(null);
    try {
      if (amountMode) {
        await updatePurchaseAmounts(purchase, amountCategories.map(category => ({ category, amount: Number(amountValue(category)) || 0 })));
      } else {
        await updatePurchaseItems(purchase.id, changedItems.map(item => {
          const draft = effective(item);
          const amount = Number(draft.amount);
          return { itemId: item.id, quantity: Number(draft.quantity), amount: amount === Math.round(item.subtotal) ? null : amount };
        }), purchase.edit_version);
      }
      if (!alive.current) return;
      resetDrafts();
      showToast('변경한 내용을 저장했어요.');
      if (!await load() && alive.current) setRefreshNeeded(true);
    } catch (e: unknown) {
      if (!alive.current) return;
      if (e instanceof Error && e.message === 'PURCHASE_CHANGED') {
        // 고친 값은 그대로 두고 기준만 최신으로 바꾼다. 같은 값이 된 칸은 자연히 '고침'에서 빠진다.
        await load();
        setConflict(true);
        Alert.alert('다른 곳에서 먼저 고쳤어요', '고친 내용은 그대로 두고, 지금 저장된 값을 아래에 함께 보여드릴게요. 비교한 뒤 다시 저장해 주세요.', [{ text: '확인' }]);
      } else {
        // 품목 여러 개 중 앞쪽만 저장된 경우를 위해 현재 값을 다시 읽는다(실패해도 고친 값은 유지).
        // 다시 읽기 전에는 옛 버전으로 다시 보내 거짓 충돌이 나므로, 끝날 때까지 기다리고 실패하면 다시 불러오기를 먼저 하게 한다.
        if (!amountMode && changedItems.length > 1 && !await load() && alive.current) setRefreshNeeded(true);
        if (!alive.current) return;
        Alert.alert('저장하지 못했어요', '고친 내용은 그대로 있어요. 다시 저장해 주세요.', [
          { text: '닫기', style: 'cancel' },
          { text: '다시 저장', onPress: () => { void saveRef.current(); } },
        ]);
      }
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;

  function confirmDelete() {
    setMenu(false);
    Alert.alert('이 매입을 삭제할까요?', '증빙 사진도 함께 지워지고 되돌릴 수 없어요. 재고에 반영한 수량도 빠져요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => { void removePurchase(); } },
    ]);
  }
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); }, []);
  async function removePurchase() {
    if (!purchase || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    try {
      assertCanWrite();
      await deletePurchase(purchase.id);
      if (!alive.current) return;
      resetDrafts();
      setDeleted(true);
      showToast('매입을 삭제했어요. 목록으로 돌아가요.');
      leaveTimer.current = setTimeout(() => {
        leaveTimer.current = null;
        if (!alive.current) return;
        if (router.canGoBack()) router.back(); else router.replace('/(tabs)');
      }, LEAVE_AFTER_DELETE_MS);
    } catch (e) {
      if (alive.current) Alert.alert('삭제하지 못했어요', getErrorMessage(e));
    } finally { saveLock.current = false; setSaving(false); }
  }

  const showLocked = () => showToast('매입일·거래처는 고칠 수 없어요. ⋯ 에서 삭제한 뒤 다시 등록해 주세요.');
  const { scrollRef, focusInput, onScroll } = useKeyboardScroll();
  const { onBarLayout, toastBottom } = useBarToast();
  // 유형이 하나뿐인 매장에서는 늘 같은 값이라 보여주지 않는다(등록 화면과 같은 기준).
  const showType = !!purchase?.type && purchaseTypes.types.length > 1;
  const diff = draftTotal - original;

  return <SafeAreaView edges={['top']} style={styles.container}>
    <PurchaseAppBar title="매입 상세" storeName={store?.name} onBack={() => router.back()}
      right={purchase && !deleted ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="더보기" accessibilityState={{ expanded: menu }} disabled={saving}
        style={styles.more} onPress={() => setMenu(value => !value)}><AppIcon name="ellipsis-horizontal" size={22} color={Colors.black} /></TouchableOpacity> : undefined} />
    <View style={styles.flex}>
    {loading && !purchase ? <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      : !purchase ? <View style={styles.center}><ErrorMessage message={error ?? '매입을 불러오지 못했어요.'} onRetry={() => { void load(); }} /></View>
      : <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={ui.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <View style={styles.summary}>
            <Pressable accessibilityRole="button" accessibilityLabel={`거래처 ${purchase.supplier || '없음'}, 고칠 수 없어요`} onPress={showLocked}>
              <Text style={styles.supplier}>{purchase.supplier || '거래처 없음'}</Text>
              <Text style={styles.meta}>{dateLabel(parseDate(purchase.date))} 매입{showType ? ` · ${purchase.type}` : ''}</Text>
            </Pressable>
            <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{won(draftTotal)}<Text style={styles.totalUnit}>원</Text></Text>
            {dirty && diff !== 0 && <Text style={styles.diff}>처음 {won(original)}원에서 {diff > 0 ? '+' : '−'}{won(Math.abs(diff))}원</Text>}
          </View>
          {store && <EvidencePanel variant="purchase" target={{ kind: 'purchase', id: purchase.id, storeId: store.id }} disabled={saving || deleted} onStatusChange={onUploadStatus} />}
          {amountMode ? <PurchaseCard padded label="카테고리별 금액">
            <CardHeader title="카테고리별 금액" />
            {amountCategories.map(category => <View key={category}>
              <AmountLine label={category} value={amountValue(category)} changed={changedAmounts.includes(category)} editable={editable} onFocus={focusInput}
                onChange={value => { setFormError(''); setAmountDrafts(previous => ({ ...previous, [category]: value })); }} />
              {conflict && changedAmounts.includes(category) && <View style={styles.latestRight}><LatestAmount amount={Number(baseAmountText(category)) || 0} /></View>}
            </View>)}
            <FieldError message={formError} />
          </PurchaseCard>
          : items.length ? <PurchaseCard padded label="매입 품목">
            <CardHeader title="매입 품목" meta={`${items.length}개`} />
            {items.map((item, index) => {
              const draft = effective(item);
              const changed = changedItems.includes(item);
              return <PurchaseItemEditRow key={item.id} item={item} draft={draft} first={index === 0} disabled={!editable} onFocus={focusInput}
                open={open === item.id} error={rowErrors[item.id]}
                latestAmount={conflict && changed ? Math.round(item.subtotal) : undefined}
                onToggle={() => setOpen(current => current === item.id ? null : item.id)}
                onChange={next => {
                  const base = itemBase(item);
                  const partial: Partial<ItemDraft> = {
                    ...(next.quantity !== base.quantity && { quantity: next.quantity }),
                    ...(next.amount !== base.amount && { amount: next.amount }),
                  };
                  setRowErrors(({ [item.id]: _, ...rest }) => rest);
                  setItemDrafts(previous => ({ ...previous, [item.id]: partial }));
                }} />;
            })}
          </PurchaseCard>
          : <PurchaseCard padded label="매입 금액">
            <CardHeader title="금액만 입력된 매입이에요" />
            {Object.entries(baseAmounts).map(([category, amount]) => <Text key={category} style={styles.legacy}>{category} · {won(amount)}원</Text>)}
          </PurchaseCard>}
        </ScrollView>
        {!!error && <BlueNotice message="최신 내용을 불러오지 못했어요." action="다시 불러오기" onAction={() => { void load(); }} />}
        {refreshNeeded && !error && <BlueNotice message="저장했어요. 최신 내용을 다시 불러와 주세요." action="다시 불러오기" onAction={() => { void load(); }} />}
        {dirty && <BottomBar total={draftTotal} onLayout={onBarLayout}>
          <BarButton secondary label="취소" disabled={saving} onPress={resetDrafts} />
          <BarButton label={saving ? '저장 중…' : '변경 저장'} disabled={saving} onPress={() => { void handleSave(); }} />
        </BottomBar>}
      </KeyboardAvoidingView>}
    {menu && <>
      <Pressable accessibilityRole="button" accessibilityLabel="메뉴 닫기" style={StyleSheet.absoluteFill} onPress={() => setMenu(false)} />
      <View accessibilityRole="menu" style={styles.menu}>
        <TouchableOpacity accessibilityRole="menuitem" style={styles.menuItem} onPress={confirmDelete}>
          <AppIcon name="trash-outline" size={18} color={Colors.negative} /><Text style={styles.menuText}>매입 삭제</Text>
        </TouchableOpacity>
      </View>
    </>}
    </View>
    <InlineToast message={toast} bottom={toastBottom(dirty)} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas },
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  more: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  summary: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.homeBorder, borderRadius: 20, padding: 16, marginBottom: 16 },
  supplier: { fontFamily: Fonts.wantedBold, fontSize: 17, color: Colors.black },
  meta: { fontFamily: Fonts.wantedMedium, fontSize: 13, color: Colors.gray600, marginTop: 2 },
  total: { fontFamily: Fonts.geistBold, fontVariant: ['tabular-nums'], fontSize: 30, color: Colors.black, marginTop: 10, letterSpacing: -0.5 },
  totalUnit: { fontFamily: Fonts.wantedSemiBold, fontSize: 17 },
  diff: { marginTop: 4, fontFamily: Fonts.wantedSemiBold, fontSize: 13, color: Colors.action },
  latestRight: { alignItems: 'flex-end', marginTop: -4, marginBottom: 8 },
  legacy: { fontFamily: Fonts.wantedMedium, fontSize: 14, color: Colors.gray600, paddingVertical: 6 },
  menu: { position: 'absolute', top: 0, right: 12, backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.homeBorder, paddingVertical: 4,
    shadowColor: Colors.black, shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  menuItem: { minHeight: 48, minWidth: 160, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuText: { fontFamily: Fonts.wantedSemiBold, fontSize: 15, color: Colors.negative },
});

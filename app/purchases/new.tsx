/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md · designed-as-app
 * 매입 등록 확정 시안 purchase-new-v4(2026-11-21): 매입일·거래처 → 증빙 사진 → 입력 카드 · 하단 고정 합계·저장 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { useAuth } from '../../lib/contexts/AuthContext';
import { usePurchases } from '../../lib/hooks/usePurchases';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { usePurchaseCategories } from '../../lib/hooks/usePurchaseCategories';
import { usePurchaseTypes } from '../../lib/hooks/usePurchaseTypes';
import { useCategories } from '../../lib/hooks/useCategories';
import { useStorePermissions } from '../../lib/hooks/useStorePermissions';
import { usePreviewWriteGuard } from '../../lib/hooks/usePreviewWriteGuard';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';
import { PurchaseWriteError } from '../../lib/services/purchases';
import { getErrorMessage } from '../../lib/utils/error';
import { disposeEvidenceCache } from '../../lib/media/evidencePicker';
import type { EvidenceSelection } from '../../lib/types/evidence';
import { EvidenceStagingPanel } from '../../lib/components/EvidenceStagingPanel';
import { EvidencePanel, type EvidenceUploadStatus } from '../../lib/components/EvidencePanel';
import { PurchaseReceiptRows, type ReceiptDraftRow } from '../../lib/components/PurchaseReceiptRows';
import { PurchaseHeaderCard, dateLabel } from '../../lib/components/purchase/PurchaseHeaderCard';
import { AmountLine, EntryModeSegment, type EntryMode } from '../../lib/components/purchase/PurchaseEntryInputs';
import { PurchaseMonthCheck } from '../../lib/components/purchase/PurchaseMonthCheck';
import { QuickIngredientSheet } from '../../lib/components/purchase/QuickIngredientSheet';
import { BarButton, BlueNotice, BottomBar, CardHeader, FieldError, InlineToast, PurchaseAppBar, PurchaseCard, UndoToast, ui, useBarToast, useKeyboardScroll, won } from '../../lib/components/purchase/PurchaseUi';
import { validatePurchaseDraft, type DraftErrors } from '../../lib/utils/purchaseDraft';

/** 저장 완료 알림을 보여준 뒤 목록으로 돌아가기까지의 시간 */
const SAVED_TOAST_MS = 900;
/** 품목을 뺀 뒤 '되돌리기'를 보여주는 시간 */
const UNDO_MS = 4000;

// 로컬 시간대 기준 YYYY-MM-DD
function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseInitialDate(value?: string): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date();
}

/**
 * idle: 입력 중 · saving: 매입 저장 요청 중 · uploading: 매입 저장 후 사진 올리는 중
 * locked: 저장 결과를 알 수 없어 내역 확인 전까지 잠금 · retry: 없었다고 확인해 다시 저장 가능 · done: 끝(목록으로 이동 중)
 */
type SaveState = 'idle' | 'saving' | 'uploading' | 'locked' | 'retry' | 'done';

export default function NewPurchaseScreen() {
  const { user, store, storeRole, canReadFinancials, devPreviewMode } = useAuth();
  return <NewPurchaseContent key={`${user?.id}:${store?.id}:${storeRole}:${canReadFinancials}:${devPreviewMode}`} />;
}

function NewPurchaseContent() {
  const { user, store, canReadFinancials, devPreviewMode } = useAuth();
  const { canManageStock } = useStorePermissions();
  const canAttach = canManageStock && canReadFinancials && devPreviewMode === 'self';
  const { canWrite } = usePreviewWriteGuard();
  const purchaseTypes = usePurchaseTypes();
  const purchaseCategories = usePurchaseCategories();
  const params = useLocalSearchParams<{ date?: string }>();
  // 처음 날짜는 한 번만 정한다. 렌더마다 다시 계산하면 자정이 지난 뒤 손대지 않아도 초안으로 판단한다.
  const [initialDate] = useState(() => formatDate(parseInitialDate(params.date)));
  const [date, setDate] = useState(() => parseInitialDate(params.date));
  const month = formatDate(date).slice(0, 7);
  const inventory = useIngredients();
  const ingredientCategories = useCategories();

  const preferenceKey = 'purchase-entry-mode:' + user?.id;
  const [mode, setMode] = useState<EntryMode>('items');
  const interacted = useRef(false);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(preferenceKey).then(value => {
      if (active && !interacted.current && value === 'amounts') setMode(value);
    }).catch(() => {});
    return () => { active = false; };
  }, [preferenceKey]);

  const [supplier, setSupplier] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [chosenType, setChosenType] = useState('');
  const category = purchaseCategories.categories.includes('식자재') ? '식자재' : purchaseCategories.categories[0];
  const type = purchaseTypes.types.includes('수기') ? '수기'
    : purchaseTypes.types.includes(chosenType) ? chosenType : purchaseTypes.types.length === 1 ? purchaseTypes.types[0] : '';

  const [manual, setManual] = useState<ReceiptDraftRow[]>([{ id: 'initial', name: '', amount: '', quantity: '' }]);
  const [edits, setEdits] = useState<Record<string, Partial<ReceiptDraftRow>>>({});
  const counter = useRef(0);
  const rows = useMemo(() => manual.map(row => ({ ...row, ...edits[row.id] })).filter(row => !row.removed), [manual, edits]);
  const amountRows = purchaseCategories.categories.map(name => ({ category: name, value: amounts[name] ?? '' }));
  const total = mode === 'amounts' ? amountRows.reduce((sum, row) => sum + (Number(row.value) || 0), 0)
    : rows.reduce((sum, row) => sum + (/^\d+$/.test(row.amount) ? Number(row.amount) : 0), 0);

  const [errors, setErrors] = useState<DraftErrors>({ rows: {} });
  const clearErrors = () => setErrors(previous => previous.supplier || previous.form || Object.keys(previous.rows).length ? { rows: {} } : previous);
  function changeRow(id: string, patch: Partial<ReceiptDraftRow>) {
    clearErrors();
    setEdits(previous => ({ ...previous, [id]: { ...previous[id], ...patch } }));
  }
  // 밀어서 뺀 품목은 잠깐 되돌릴 수 있다. 확인 창 대신 되돌리기로 실수를 막는다.
  const [undo, setUndo] = useState<{ id: string; message: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);
  function removeRow(row: ReceiptDraftRow) {
    const name = (row.ingredient?.name ?? row.inputName ?? row.name).trim();
    changeRow(row.id, { removed: true });
    setUndo({ id: row.id, message: name ? `'${name}' 품목을 뺐어요` : '빈 품목을 뺐어요' });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  }
  function undoRemove() {
    if (!undo) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    changeRow(undo.id, { removed: false });
    setUndo(null);
  }
  function appendItem() {
    setManual(previous => [...previous, { id: 'manual-' + ++counter.current, name: '', quantity: '', amount: '' }]);
  }

  // 증빙: 저장 전에는 기기 캐시에만 둔다. 이 화면이 캐시 수명을 소유한다.
  const [stagedEvidence, setStagedEvidence] = useState<EvidenceSelection[]>([]);
  const [pickingEvidence, setPickingEvidence] = useState(false);
  const ownedEvidence = useRef(new Set<string>());
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; ownedEvidence.current.forEach(disposeEvidenceCache); }; }, []);
  function updateStagedEvidence(next: EvidenceSelection[]) {
    const uris = new Set(next.map(file => file.uri));
    for (const file of stagedEvidence) if (!uris.has(file.uri)) { disposeEvidenceCache(file.uri); ownedEvidence.current.delete(file.uri); }
    next.forEach(file => ownedEvidence.current.add(file.uri));
    setStagedEvidence(next);
  }

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedPurchaseId, setSavedPurchaseId] = useState<string>();
  const [upload, setUpload] = useState<EvidenceUploadStatus>({ pending: 0, failed: 0, uploading: 0 });
  const [retrySignal, setRetrySignal] = useState(0);
  const [toast, setToast] = useState('');
  const [monthCheck, setMonthCheck] = useState(false);
  // 월 확인 창을 열 때만 이 달 목록을 받는다(openMonthCheck가 최신으로 다시 받는다).
  const ledger = usePurchases(month, monthCheck);
  const writeLock = useRef(false);
  const formLocked = saveState !== 'idle' && saveState !== 'retry';

  const hasDraft = !!supplier || stagedEvidence.length > 0 || Object.keys(edits).length > 0 || manual.length > 1 ||
    Object.values(amounts).some(Boolean) || !!chosenType || formatDate(date) !== initialDate;
  const bypassLeaveGuard = useConfirmLeave((hasDraft && saveState !== 'done') || pickingEvidence, {
    blockLeave: saveState === 'saving' || pickingEvidence,
    message: saveState === 'uploading' ? '매입은 저장했어요. 지금 나가면 아직 못 올린 사진은 다시 골라야 해요.' : '지금 나가면 입력한 매입 내용과 고른 사진이 사라져요.',
  });

  const leaving = useRef(false);
  const navigateSaved = useCallback(() => {
    if (!alive.current || leaving.current) return;
    leaving.current = true;
    bypassLeaveGuard();
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/(tabs)', params: { targetTab: 'purchases', month, homeScope: 'store' } });
  }, [bypassLeaveGuard, month]);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); }, []);
  const finish = useCallback((message: string) => {
    setSaveState('done');
    setToast(message);
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(navigateSaved, SAVED_TOAST_MS);
  }, [navigateSaved]);

  // 사진 업로드가 모두 끝나면 완료, 남은 사진이 모두 실패면 [나가기 | 다시 올리기]
  const failureAsked = useRef(false);
  const onUploadStatus = useCallback((status: EvidenceUploadStatus) => setUpload(status), []);
  useEffect(() => {
    if (saveState !== 'uploading') return;
    if (upload.pending === 0) { finish('매입을 저장했어요.'); return; }
    const stuck = upload.failed === upload.pending || (!!upload.blocked && upload.uploading === 0);
    if (!stuck || failureAsked.current) return;
    failureAsked.current = true;
    Alert.alert('매입은 저장했어요', `사진 ${upload.pending}장을 올리지 못했어요. 지금 나가면 이 사진은 다시 골라야 해요.`, [
      { text: '나가기', style: 'cancel', onPress: navigateSaved },
      { text: '다시 올리기', onPress: () => { failureAsked.current = false; setRetrySignal(n => n + 1); } },
    ]);
  }, [saveState, upload, finish, navigateSaved]);

  async function handleSubmit() {
    if (formLocked || writeLock.current || pickingEvidence || !store || !canWrite()) return;
    const checked = validatePurchaseDraft({
      supplier, mode, rows, amountRows, total, type, category,
      categories: purchaseCategories.categories,
      taxonomyReady: !purchaseCategories.loading && !purchaseTypes.loading && !purchaseTypes.error && !purchaseCategories.error,
    });
    if (!checked.ok) { setErrors(checked.errors); return; }
    Keyboard.dismiss();
    writeLock.current = true; setSaveState('saving'); setErrors({ rows: {} });
    try {
      const result = await ledger.addWithItems({ date: formatDate(date), supplier: supplier.trim(), type, ...checked.payload, returnId: true });
      if (!alive.current) return;
      void AsyncStorage.setItem(preferenceKey, mode).catch(() => {});
      if (!stagedEvidence.length) { finish('매입을 저장했어요.'); return; }
      if (!result.purchaseId) {
        setSaveState('done');
        Alert.alert('매입은 저장했어요', '사진은 올리지 못했어요. 매입 상세에서 다시 붙여 주세요.', [{ text: '확인', onPress: navigateSaved }]);
        return;
      }
      setSavedPurchaseId(result.purchaseId);
      setUpload({ pending: stagedEvidence.length, failed: 0, uploading: 0 });
      setSaveState('uploading');
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof PurchaseWriteError && error.outcome === 'unknown') {
        setSaveState('locked');
        Alert.alert('저장됐는지 확인이 필요해요', '응답이 끊겨 저장 여부를 알 수 없어요. 같은 매입이 두 번 들어가지 않게 매입 내역을 먼저 확인해 주세요.', [
          { text: '닫기', style: 'cancel' },
          { text: '내역 확인', onPress: openMonthCheck },
        ]);
      } else {
        setSaveState(previous => previous === 'saving' ? 'idle' : previous);
        Alert.alert('저장하지 못했어요', error instanceof PurchaseWriteError ? '입력한 내용과 사진은 그대로 있어요. 다시 저장해 주세요.' : getErrorMessage(error), [
          { text: '닫기', style: 'cancel' },
          { text: '다시 저장', onPress: () => { void handleSubmitRef.current(); } },
        ]);
      }
    } finally { writeLock.current = false; }
  }
  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;

  function openMonthCheck() {
    void ledger.refetch();
    setMonthCheck(true);
  }
  function askFound() {
    Alert.alert('방금 매입이 목록에 있었나요?', `${dateLabel(date)} · ${supplier.trim()} · ${won(total)}원`, [
      { text: '있었어요', onPress: () => finish(stagedEvidence.length
        ? '이미 저장된 매입이에요. 사진은 매입 상세에서 다시 붙여 주세요.'
        : '이미 저장된 매입이에요. 목록으로 돌아가요.') },
      { text: '없었어요', onPress: () => setSaveState('retry') },
    ]);
  }
  function closeMonthCheck() {
    setMonthCheck(false);
    if (Platform.OS !== 'ios') askFound();
  }

  const [linkRow, setLinkRow] = useState<{ id: string; name: string; unit?: string } | null>(null);
  const [quickAdding, setQuickAdding] = useState(false);
  async function handleQuickAdd(input: { name: string; category: string; unit: string }) {
    if (!input.name.trim()) { Alert.alert('품목 이름을 입력해 주세요'); return; }
    if (!store || !linkRow || quickAdding || !canWrite()) return;
    setQuickAdding(true);
    try {
      const created = await inventory.create({ store_id: store.id, name: input.name.trim(), category: input.category, unit: input.unit, current_stock: 0, min_stock: 0, last_price: 0 });
      if (!alive.current) return;
      changeRow(linkRow.id, { ingredient: created, inputName: created.name });
      setLinkRow(null);
    } catch (error) {
      Alert.alert('품목을 등록하지 못했어요', getErrorMessage(error));
    } finally { if (alive.current) setQuickAdding(false); }
  }

  const { scrollRef, focusInput, onScroll } = useKeyboardScroll();
  const { onBarLayout, toastBottom } = useBarToast();
  const uploaded = upload.pending ? stagedEvidence.length - upload.pending : stagedEvidence.length;
  const saveLabel = saveState === 'saving' ? '저장 중…'
    : saveState === 'uploading' ? `사진 올리는 중 ${Math.min(uploaded + 1, stagedEvidence.length)}/${stagedEvidence.length}`
    : saveState === 'retry' ? '다시 저장' : '저장';
  const taxonomyFailed = !!(purchaseCategories.error || purchaseTypes.error);
  const showTypes = !purchaseTypes.types.includes('수기') && purchaseTypes.types.length > 1;

  return <SafeAreaView edges={['top']} style={styles.container}>
    <PurchaseAppBar title="매입 등록" storeName={store?.name} backDisabled={saveState === 'saving' || pickingEvidence} onBack={() => router.back()} />
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={ui.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <View pointerEvents={formLocked ? 'none' : 'auto'} onTouchStart={() => { interacted.current = true; }}>
          <PurchaseHeaderCard date={date} onDateChange={next => { clearErrors(); setDate(next); }} supplier={supplier}
            onSupplierChange={name => { clearErrors(); setSupplier(name); }} storeId={store?.id} supplierError={errors.supplier} disabled={formLocked} />
          {showTypes && <PurchaseCard padded>
            <CardHeader title="매입 유형" />
            <View style={styles.typeRow}>{purchaseTypes.types.map(name => <TouchableOpacity key={name} accessibilityRole="radio"
              accessibilityState={{ checked: name === type }} onPress={() => { clearErrors(); setChosenType(name); }} style={[styles.typeChip, type === name && styles.typeChipOn]}>
              <Text style={[styles.typeText, type === name && styles.typeTextOn]}>{name}</Text></TouchableOpacity>)}</View>
          </PurchaseCard>}
        </View>
        {canAttach && (saveState === 'uploading' && savedPurchaseId && store
          ? <EvidencePanel variant="purchase" target={{ kind: 'purchase', id: savedPurchaseId, storeId: store.id }} initialSelections={stagedEvidence}
            onStatusChange={onUploadStatus} retrySignal={retrySignal} />
          : <EvidenceStagingPanel files={stagedEvidence} onChange={updateStagedEvidence} disabled={formLocked} onPickingChange={setPickingEvidence} />)}
        <View pointerEvents={formLocked ? 'none' : 'auto'}>
          <PurchaseCard padded label="매입 입력">
            <EntryModeSegment mode={mode} onChange={next => { interacted.current = true; clearErrors(); setMode(next); }} />
            {taxonomyFailed && <TouchableOpacity accessibilityRole="button" style={styles.reload} onPress={() => { void purchaseCategories.refetch(); void purchaseTypes.refetch(); }}>
              <Text style={styles.reloadText}>분류를 불러오지 못했어요 · 다시 불러오기</Text></TouchableOpacity>}
            {mode === 'amounts'
              ? amountRows.map(row => <AmountLine key={row.category} label={row.category} value={row.value} onFocus={focusInput}
                onChange={value => { clearErrors(); setAmounts(previous => ({ ...previous, [row.category]: value })); }} />)
              : <>
                <PurchaseReceiptRows categories={purchaseCategories.categories} defaultCategory={category} rows={rows} change={changeRow} remove={removeRow} errors={errors.rows}
                  inventory={inventory.data} complete={!inventory.loading && !inventory.hasMore && !inventory.error} storeId={store?.id ?? ''}
                  used={(id, rowId) => rows.some(row => row.id !== rowId && row.ingredient?.id === id)} focus={focusInput}
                  create={(row, name) => setLinkRow({ id: row.id, name, unit: row.unit })} />
                <TouchableOpacity accessibilityRole="button" style={styles.addItem} onPress={appendItem}><Text style={styles.addItemText}>+ 품목 추가</Text></TouchableOpacity>
              </>}
            <FieldError message={errors.form} />
          </PurchaseCard>
        </View>
      </ScrollView>
      {saveState === 'locked' && <BlueNotice message="저장됐는지 먼저 확인해 주세요." action="내역 확인" onAction={openMonthCheck} />}
      <BottomBar total={total} onLayout={onBarLayout}>
        <BarButton label={saveLabel} accessibilityLabel={saveState === 'retry' ? '매입 다시 저장' : saveState === 'saving' || saveState === 'uploading' ? saveLabel : '매입 저장'}
          disabled={formLocked || pickingEvidence} onPress={() => { void handleSubmit(); }} />
      </BottomBar>
    </KeyboardAvoidingView>
    <InlineToast message={toast} bottom={toastBottom(true)} />
    {!toast && <UndoToast message={undo?.message ?? ''} bottom={toastBottom(true)} onUndo={undoRemove} />}
    <PurchaseMonthCheck visible={monthCheck} monthLabel={`${date.getMonth() + 1}월`} purchases={ledger.purchases} loading={ledger.loading} error={ledger.error}
      onRetry={() => { void ledger.refetch(); }} onClose={closeMonthCheck} onClosed={askFound} />
    <QuickIngredientSheet visible={!!linkRow} initialName={linkRow?.name ?? ''} initialUnit={linkRow?.unit} categories={ingredientCategories.categories} adding={quickAdding}
      onCancel={() => setLinkRow(null)} onSubmit={input => { void handleQuickAdd(input); }} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas },
  flex: { flex: 1 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.homeBorder, justifyContent: 'center' },
  typeChipOn: { borderColor: Colors.primary, backgroundColor: Colors.tinted },
  typeText: { fontFamily: Fonts.wantedSemiBold, fontSize: 14, color: Colors.gray600 },
  typeTextOn: { color: Colors.action },
  reload: { minHeight: 44, justifyContent: 'center' },
  reloadText: { fontFamily: Fonts.wantedSemiBold, fontSize: 14, color: Colors.action },
  addItem: { minHeight: 48, marginTop: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.pale, borderRadius: 14, backgroundColor: Colors.tinted, alignItems: 'center', justifyContent: 'center' },
  addItemText: { fontFamily: Fonts.wantedSemiBold, fontSize: 14, color: Colors.action },
});

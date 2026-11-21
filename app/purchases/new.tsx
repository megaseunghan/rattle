import { PurchaseReceiptRows, ReceiptDraftRow } from '../../lib/components/PurchaseReceiptRows';
import { useStorePermissions } from '../../lib/hooks/useStorePermissions';
import { usePreviewWriteGuard } from '../../lib/hooks/usePreviewWriteGuard';
import { EvidenceStagingPanel } from '../../lib/components/EvidenceStagingPanel';
import { EvidenceSelection } from '../../lib/types/evidence';
import { disposeEvidenceCache } from '../../lib/media/evidencePicker';
import { EvidencePanel } from '../../lib/components/EvidencePanel';
import { SheetModal } from '../../lib/components/ui/SheetModal';
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md · designed-as-app */
import { getErrorMessage } from '../../lib/utils/error';
import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
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
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../../lib/icons/AppIcon';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { useAuth } from '../../lib/contexts/AuthContext';
import { usePurchases } from '../../lib/hooks/usePurchases';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { usePurchaseCategories } from '../../lib/hooks/usePurchaseCategories';
import { usePurchaseTypes } from '../../lib/hooks/usePurchaseTypes';
import { useCategories } from '../../lib/hooks/useCategories';
import { PurchaseWriteError, getPurchaseSuppliers } from '../../lib/services/purchases';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';

const COMMON_UNITS = ['g', 'kg', 'ml', 'L', '개', '병', '봉', '박스'];

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
  const { addWithItems } = usePurchases(formatDate(parseInitialDate(params.date)).slice(0, 7));
  const inventory = useIngredients();
  const ingredientCategories = useCategories();
  const preferenceKey = 'purchase-entry-mode:' + user?.id;
  const [mode, setMode] = useState<'items' | 'amounts'>('items');
  const interacted = useRef(false);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(preferenceKey).then(value => {
      if (active && !interacted.current && value === 'amounts') setMode(value);
    }).catch(() => {});
    return () => { active = false; };
  }, [preferenceKey]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const category = purchaseCategories.categories.includes('식자재') ? '식자재' : purchaseCategories.categories[0];
  const [chosenType, setChosenType] = useState('');
  const type = purchaseTypes.types.includes('수기') ? '수기'
    : purchaseTypes.types.includes(chosenType) ? chosenType : purchaseTypes.types.length === 1 ? purchaseTypes.types[0] : '';
  const [error, setError] = useState('');
  const supplierRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [writeState, setWriteState] = useState<'idle' | 'rejected' | 'unknown' | 'saved' | 'saved-refresh'>('idle');
  const [supplier, setSupplier] = useState('');
  const [date, setDate] = useState(parseInitialDate(params.date));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const writeLock = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedPurchaseId, setSavedPurchaseId] = useState<string>();
  const [stagedEvidence, setStagedEvidence] = useState<EvidenceSelection[]>([]);
  const [pickingEvidence, setPickingEvidence] = useState(false);
  const [pendingEvidence, setPendingEvidence] = useState(0);
  const ownedEvidence = useRef(new Set<string>());
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; ownedEvidence.current.forEach(disposeEvidenceCache); }; }, []);
  function updateStagedEvidence(next: EvidenceSelection[]) {
    const uris = new Set(next.map(file => file.uri));
    for (const file of stagedEvidence) if (!uris.has(file.uri)) { disposeEvidenceCache(file.uri); ownedEvidence.current.delete(file.uri); }
    next.forEach(file => ownedEvidence.current.add(file.uri));
    setStagedEvidence(next);
  }

  const [knownSuppliers, setKnownSuppliers] = useState<string[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplierError, setSupplierError] = useState(false);
  const [supplierAttempt, setSupplierAttempt] = useState(0);
  useEffect(() => {
    if (!store || !showSupplierPicker) return;
    const controller = new AbortController();
    setSupplierError(false); setSupplierLoading(true);
    getPurchaseSuppliers(store.id, controller.signal).then(names => {
      if (!controller.signal.aborted) setKnownSuppliers(names);
    }).catch(() => { if (!controller.signal.aborted) setSupplierError(true); }).finally(() => { if (!controller.signal.aborted) setSupplierLoading(false); });
    return () => controller.abort();
  }, [store?.id, showSupplierPicker, supplierAttempt]);

  const [manual, setManual] = useState<ReceiptDraftRow[]>([{ id: 'initial', name: '', amount: '', quantity: '' }]);
  const counter = useRef(0);
  function appendItem() {
    const row = { id: 'manual-' + ++counter.current, name: '', quantity: '', amount: '' };
    setManual(previous => [...previous, row]);
  }
  const [edits, setEdits] = useState<Record<string, Partial<ReceiptDraftRow>>>({});
  function changeRow(id: string, patch: Partial<ReceiptDraftRow>) {
    setError('');
    setEdits(previous => ({ ...previous, [id]: { ...previous[id], ...patch } }));
  }
  const rows = useMemo(() => manual.map(row => ({ ...row, ...edits[row.id] })).filter(row => !row.removed), [manual, edits]);
  const amountRows = purchaseCategories.categories.map(category => ({ category, value: amounts[category] ?? '' }));
  const total = mode === 'amounts' ? amountRows.reduce((sum, row) => sum + (/^\d+$/.test(row.value) ? Number(row.value) : 0), 0) : rows.reduce((sum, row) => sum + (/^\d+$/.test(row.amount) ? Number(row.amount) : 0), 0);
  const saved = writeState.startsWith('saved');
  const locked = submitting || writeState === 'unknown';
  const hasDraft = !!supplier || stagedEvidence.length > 0 || Object.keys(edits).length > 0 ||
    manual.length > 1 || Object.values(amounts).some(Boolean) || !!chosenType ||
    formatDate(date) !== formatDate(parseInitialDate(params.date));
  const bypassLeaveGuard = useConfirmLeave((hasDraft && !saved) || pickingEvidence || pendingEvidence > 0, {
    blockLeave: submitting || pickingEvidence,
    message: pendingEvidence ? '매입은 저장됐어요. 지금 나가면 남은 증빙을 다시 선택해야 해요.' : '지금 나가면 입력한 매입 내용과 선택한 증빙이 사라져요.',
  });
  const [linkRow, setLinkRow] = useState<string | null>(null);
  const [quickName, setQuickName] = useState('');
  const [quickCategory, setQuickCategory] = useState('식자재');
  const [quickUnit, setQuickUnit] = useState('g');
  const [quickAdding, setQuickAdding] = useState(false);

  async function handleQuickAdd() {
    if (!quickName.trim()) {
      Alert.alert('입력 오류', '품목명을 입력해주세요.');
      return;
    }
    if (!store || !linkRow || quickAdding) return;
    setQuickAdding(true);
    try {
      if (!canWrite()) return;
      const created = await inventory.create({
        store_id: store.id,
        name: quickName.trim(),
        category: quickCategory,
        unit: quickUnit,
        current_stock: 0,
        min_stock: 0,
        last_price: 0,
      });
      if (!alive.current) return;
      changeRow(linkRow, { ingredient: created, inputName: created.name });
      setQuickName('');
      setQuickCategory('식자재');
      setQuickUnit('g');
      setLinkRow(null);
    } catch (e: any) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setQuickAdding(false);
    }
  }


  async function handleSubmit() {
    if (locked || saved || writeLock.current || pickingEvidence || !store || !canWrite()) return;
    if (!supplier.trim()) return setError('거래처를 선택하거나 이름을 입력해 주세요.');
    if (purchaseCategories.loading || purchaseTypes.loading || !category || !purchaseCategories.categories.includes(category) || purchaseTypes.error || purchaseCategories.error)
      return setError('매입 카테고리와 유형을 다시 불러와 주세요.');
    if (mode === 'items' && rows.length > 300) return setError('품목은 한 번에 300개까지 저장할 수 있어요.');
    if (total >= 1e12) return setError('매입 합계를 확인해 주세요.');
    if (!type) return setError('매입 유형을 선택해 주세요.');
    if (mode === 'items' && !rows.length) return setError('품목을 한 개 이상 추가해 주세요.');
    const items = (mode === 'items' ? rows : []).map(row => ({
      ingredient_id: row.ingredient?.id ?? null, name: (row.ingredient?.name ?? row.inputName ?? row.name).trim(),
      quantity: Number(row.quantity.trim() || 1), category: row.category ?? category, unit: row.ingredient?.unit ?? row.unit?.trim() ?? '', amount: Number(row.amount),
    }));
    if (items.some((item, index) => !purchaseCategories.categories.includes(item.category) || !item.name || item.name.length > 200 || !/^\d+$/.test(rows[index].amount) ||
      !Number.isSafeInteger(item.amount) || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity >= 1e9 || item.amount / item.quantity >= 1e9))
      return setError('품목명과 원 단위 금액을 입력하고 수량을 확인해 주세요.');
    const categoryAmounts = amountRows.filter(row => Number(row.value) > 0).map(row => ({ category: row.category, amount: Number(row.value) }));
    if (categoryAmounts.length > 300 && mode === 'amounts') return setError('카테고리는 한 번에 300개까지 저장할 수 있어요.');
    if (mode === 'amounts' && (!categoryAmounts.length || amountRows.some(row => row.value && !/^\d+$/.test(row.value))))
      return setError('카테고리에 원 단위 금액을 입력해 주세요.');
    Keyboard.dismiss();
    writeLock.current = true; setSubmitting(true); setError('');
    try {
      const result = await addWithItems({ date: formatDate(date), supplier: supplier.trim(), type, ...(mode === 'items' ? { mode, rows: items } : { mode, rows: categoryAmounts }), returnId: true });
      if (!alive.current) return;
      void AsyncStorage.setItem(preferenceKey, mode).catch(() => {});
      setSavedPurchaseId(result.purchaseId);
      setPendingEvidence(result.purchaseId ? stagedEvidence.length : 0);
      setWriteState(result.refreshFailed ? 'saved-refresh' : 'saved');
      Keyboard.dismiss();
    } catch (error) {
      if (!alive.current) return;
      setWriteState(error instanceof PurchaseWriteError && error.outcome === 'rejected' ? 'rejected' : 'unknown');
    } finally { writeLock.current = false; if (alive.current) setSubmitting(false); }
  }

  function leaveSaved() {
    if (pendingEvidence > 0) {
      Alert.alert('증빙 업로드가 남아 있어요', '매입은 저장됐어요. 지금 나가면 미완료 파일을 다시 선택해야 해요.', [{ text: '계속 업로드', style: 'cancel' }, { text: '나가기', style: 'destructive', onPress: navigateSaved }]);
    } else navigateSaved();
  }
  const returning = useRef(false);
  const navigateSaved = useCallback(() => {
    if (!alive.current || returning.current) return;
    returning.current = true;
    bypassLeaveGuard();
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/(tabs)', params: { targetTab: 'purchases', month: formatDate(date).slice(0, 7), homeScope: 'store' } });
  }, [bypassLeaveGuard, date]);

  useEffect(() => {
    if (writeState === 'saved' && pendingEvidence === 0 && (!stagedEvidence.length || savedPurchaseId)) {
      navigateSaved();
    }
  }, [writeState, pendingEvidence, stagedEvidence.length, savedPurchaseId, navigateSaved]);


  return <SafeAreaView style={styles.container}>
    <View style={styles.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="뒤로" disabled={submitting || pickingEvidence} style={styles.backButton}
        onPress={() => saved ? leaveSaved() : router.back()}><AppIcon name="chevron-back" size={24} color={Colors.black} /></TouchableOpacity>
      <View style={{ alignItems: 'center' }}><Text style={styles.title}>매입 등록</Text><Text>{store?.name}</Text></View><View style={styles.headerSpacer} />
    </View>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        {!saved && <View pointerEvents={locked ? 'none' : 'auto'} onTouchStart={() => { interacted.current = true; }}>
          <View style={styles.chipRow}>{(['items', 'amounts'] as const).map(value =>
            <TouchableOpacity key={value} accessibilityRole="radio" accessibilityState={{ checked: mode === value }}
              style={[styles.chip, mode === value && styles.chipActive]} onPress={() => { interacted.current = true; setMode(value); setError(''); }}>
              <Text style={[styles.chipText, mode === value && styles.chipTextActive]}>{value === 'items' ? '품목별' : '금액별'}</Text>
            </TouchableOpacity>)}</View>
          <Text style={styles.label}>매입일</Text>
          <TouchableOpacity style={styles.dateInput} onPress={() => setShowDatePicker(p => !p)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`매입일 ${formatDate(date)}, 변경`} accessibilityState={{ expanded: showDatePicker }}>
            <Text style={styles.dateText}>{formatDate(date)}</Text>
            <AppIcon name="calendar-outline" size={18} color={Colors.gray500} />
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
          <Text style={styles.label}>거래처</Text>
          <View style={styles.supplierRow}>
            <TextInput ref={supplierRef} style={[styles.input, { flex: 1 }]} accessibilityLabel="거래처명" placeholder="거래처 이름 입력" value={supplier}
              onChangeText={setSupplier} editable={!locked} />
            <TouchableOpacity style={styles.supplierPickerBtn} accessibilityRole="button" accessibilityState={{ expanded: showSupplierPicker }}
              onPress={() => setShowSupplierPicker(!showSupplierPicker)}><Text style={styles.modalClose}>거래처 목록</Text></TouchableOpacity>
          </View>
          {showSupplierPicker && <View>
            {supplierLoading && <Text>거래처를 불러오고 있어요…</Text>}
            {!supplierLoading && !supplierError && !knownSuppliers.length && <Text>등록된 거래처가 없어요.</Text>}
            {supplierError && <TouchableOpacity onPress={() => setSupplierAttempt(n => n + 1)}><Text>목록 다시 불러오기</Text></TouchableOpacity>}
            {knownSuppliers.filter(name => name.includes(supplier.trim())).map(name => <TouchableOpacity key={name} style={styles.actionButton}
              onPress={() => { setSupplier(name); setShowSupplierPicker(false); }}><Text>{name}</Text></TouchableOpacity>)}
            <TouchableOpacity style={styles.actionButton} onPress={() => { setSupplier(''); setShowSupplierPicker(false); supplierRef.current?.focus(); }}><Text style={styles.modalClose}>새 거래처 입력</Text></TouchableOpacity>
          </View>}
          {!purchaseTypes.types.includes('수기') && purchaseTypes.types.length > 1 && <>
            <Text style={styles.label}>매입 유형</Text>
            <View style={styles.chipRow}>{purchaseTypes.types.map(name => <TouchableOpacity key={name} accessibilityRole="radio"
              accessibilityState={{ checked: name === type }} onPress={() => setChosenType(name)} style={[styles.chip, type === name && styles.chipActive]}>
              <Text style={[styles.chipText, type === name && styles.chipTextActive]}>{name}</Text></TouchableOpacity>)}</View>
          </>}
          {canAttach && <EvidenceStagingPanel files={stagedEvidence} onChange={updateStagedEvidence} disabled={locked} onPickingChange={setPickingEvidence} />}
          {(purchaseCategories.error || purchaseTypes.error) && <TouchableOpacity onPress={() => { void purchaseCategories.refetch(); void purchaseTypes.refetch(); }}><Text>분류 다시 불러오기</Text></TouchableOpacity>}
          {mode === 'amounts' ? <View>
            <Text style={styles.label}>카테고리별 금액</Text>
            {amountRows.map(row => <View key={row.category}><Text style={styles.label}>{row.category}</Text>
              <TextInput style={styles.input} accessibilityLabel={row.category + ' 금액'} placeholder="0원" keyboardType="number-pad"
                value={row.value} onChangeText={value => { setError(''); setAmounts(previous => ({ ...previous, [row.category]: value })); }} /></View>)}
          </View> : <>
          <View style={styles.itemsHeader}><Text style={styles.label}>매입 품목</Text>
            <TouchableOpacity style={styles.actionButton} onPress={appendItem}><Text style={styles.modalClose}>품목 추가</Text></TouchableOpacity></View>
          <PurchaseReceiptRows categories={purchaseCategories.categories} defaultCategory={category} rows={rows} change={changeRow} inventory={inventory.data} complete={!inventory.loading && !inventory.hasMore && !inventory.error}
            storeId={store?.id ?? ''} used={(id, rowId) => rows.some(row => row.id !== rowId && row.ingredient?.id === id)}
            focus={target => scrollRef.current?.getScrollResponder()?.scrollResponderScrollNativeHandleToKeyboard(target, 156, true)}
            create={(row, name) => { setLinkRow(row.id); setQuickName(name); }} />
          </>}
        </View>}
          {saved && !savedPurchaseId && canAttach && stagedEvidence.length > 0 &&
            <EvidenceStagingPanel files={stagedEvidence} onChange={updateStagedEvidence} disabled />}
          {saved && savedPurchaseId && stagedEvidence.length > 0 && store && <EvidencePanel target={{ kind: 'purchase', id: savedPurchaseId, storeId: store.id }} initiallyExpanded initialSelections={stagedEvidence} onPendingChange={setPendingEvidence} />}
          {writeState === 'rejected' && <Text style={styles.fieldError}>등록되지 않았어요. 입력 내용을 확인한 뒤 다시 등록해주세요.</Text>}
          {writeState === 'unknown' && <View style={styles.itemCard}><Text style={styles.itemName}>등록 결과를 확인해주세요</Text><Text style={styles.reviewText}>응답을 받지 못해 등록 여부가 확실하지 않아요. 중복 등록을 막기 위해 매입 내역을 먼저 확인해주세요. 입력과 선택한 증빙은 이 화면에 유지돼요. 등록 여부를 확인하기 전에는 증빙을 업로드하지 않아요.</Text><TouchableOpacity style={styles.actionButton} onPress={() => router.push({ pathname: '/(tabs)', params: { targetTab: 'purchases', month: formatDate(date).slice(0, 7), homeScope: 'store' } })}><Text style={styles.modalClose}>등록 내역 확인</Text></TouchableOpacity></View>}
          {saved && !savedPurchaseId && stagedEvidence.length > 0 && <Text style={styles.fieldError}>매입은 저장됐지만 거래 번호를 확인하지 못해 증빙을 업로드하지 않았어요. 선택한 파일은 이 화면에 유지돼요.</Text>}
          {saved && <View style={styles.itemCard}><Text style={styles.itemName}>매입이 등록됐어요</Text><Text style={styles.reviewText}>{store?.name} · {formatDate(date)} · {supplier}</Text><Text style={styles.reviewText}>{writeState === 'saved-refresh' ? '등록은 완료됐어요. 목록에서 합계를 다시 불러와 주세요.' : '목록에서 등록 내역을 확인할 수 있어요.'}</Text></View>}

      </ScrollView>
      {!!error && <Text accessibilityRole="alert" style={styles.fieldError}>{error}</Text>}
      <View style={styles.bottomBar}>
        <View><Text style={styles.bottomTotalLabel}>합계</Text><Text style={styles.bottomTotalValue}>{total.toLocaleString()}원</Text></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={saved ? '돌아가기' : '매입 저장'} disabled={locked || pickingEvidence}
          style={styles.bottomSubmit} onPress={saved ? leaveSaved : handleSubmit}>
          <Text style={styles.bottomSubmitText}>{saved ? '돌아가기' : submitting ? '저장 중…' : writeState === 'rejected' ? '다시 등록' : '매입 저장'}</Text></TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
    <SheetModal visible={!!linkRow} onRequestClose={() => { if (!quickAdding) setLinkRow(null); }}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView edges={['bottom']} style={styles.modalSheet}>
          <View style={styles.modalHeader}><TouchableOpacity disabled={quickAdding} onPress={() => setLinkRow(null)}><Text>취소</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>새 품목 등록</Text><TouchableOpacity disabled={quickAdding} onPress={handleQuickAdd}><Text style={styles.modalClose}>추가</Text></TouchableOpacity></View>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.quickAddForm}>
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
                      accessibilityRole="radio"
                      accessibilityState={{ checked: quickCategory === c }}
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
                      accessibilityRole="radio"
                      accessibilityState={{ checked: quickUnit === u }}
                    >
                      <Text style={[styles.chipText, quickUnit === u && styles.chipTextActive]}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

              </ScrollView>

        </SafeAreaView>
      </KeyboardAvoidingView>
    </SheetModal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
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
  bottomTotalLabel: { fontSize: 13, color: Colors.white, marginBottom: 2 },
  bottomTotalValue: { fontFamily: Fonts.spaceGroteskBold, fontVariant: ['tabular-nums'], fontSize: 20, fontWeight: '800', color: Colors.white, letterSpacing: -0.3 },
  bottomSubmit: { backgroundColor: Colors.action, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 14, minHeight: 44, justifyContent: 'center' },
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
  itemCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    padding: 14,
    marginTop: 8,
  },
  itemName: { fontSize: 15, fontWeight: '600', color: Colors.black },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minWidth: 44,
    maxWidth: '100%',
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
  quickAddForm: { padding: 20, paddingBottom: 40 },
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
  supplierRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  supplierPickerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.pale, minHeight: 44, justifyContent: 'center' },
});

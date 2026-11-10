import { SheetModal } from './ui/SheetModal';
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md · designed-as-app */
import { NumericText } from './ui/NumericText';
import { useEffect, useState, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { AppIcon } from '../icons/AppIcon';
import { Colors } from '../../constants/colors';
import { useAuth } from '../contexts/AuthContext';
import { useRecurringFixedExpenses } from '../hooks/useRecurringFixedExpenses';
import { useExpenses } from '../hooks/useExpenses';
import { useExpenseCategoryExpansion } from '../hooks/useExpenseCategoryExpansion';
import { ExpenseCategory } from '../../types';
import { DatedExpense as Expense } from '../types/expenses';
import { validateExpenseDate } from '../utils/expenseDate';
import { animateListChange } from '../utils/layoutAnimation';
import { getErrorMessage, UserFacingError } from '../utils/error';
import { GlassCard } from './GlassCard';
import { LedgerHeader } from './LedgerHeader';
import { LedgerFilters } from './LedgerFilters';
import { Field } from './ui';
import { RecurringFixedExpensesPanel, type FixedExpenseEditorHandle } from './RecurringFixedExpensesPanel';

// 카테고리 아이콘/합계는 중립색으로 통일하고, "항목 추가" 액션에만 primary를 남겨서
// 색이 너무 많이 쓰이지 않게 한다.
const CATEGORIES: {
  key: ExpenseCategory;
  icon: keyof typeof AppIcon.glyphMap;
  color: string;
  bg: string;
}[] = [
  { key: '마케팅',  icon: 'megaphone-outline', color: Colors.gray600, bg: Colors.gray100 },
  { key: '고정비',  icon: 'receipt-outline',   color: Colors.gray600, bg: Colors.gray100 },
  { key: '시설보수', icon: 'build-outline',     color: Colors.gray600, bg: Colors.gray100 },
  { key: '공과금',  icon: 'flash-outline',     color: Colors.gray600, bg: Colors.gray100 },
];

function toYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** 비용(고정비/마케팅/시설보수/공과금) 관리 패널 — /expenses 라우트와 매입 탭의 '비용' 세그먼트가 공유한다 */
export function ExpensesPanel({ selectedMonth, onMonthChange }: { selectedMonth?: string; onMonthChange?: (month: string) => void } = {}) {
  const { currentRole, store, user, devPreviewMode } = useAuth();
  const isAdmin = currentRole === 'admin';
  const { expanded, toggle } = useExpenseCategoryExpansion(user?.id, store?.id);
  const today = new Date();
  const [localYear, setYear] = useState(today.getFullYear());
  const [localMonth, setMonth] = useState(today.getMonth() + 1); // 1-based
  const year = selectedMonth ? Number(selectedMonth.slice(0, 4)) : localYear;
  const month = selectedMonth ? Number(selectedMonth.slice(5, 7)) : localMonth;

  const [categoryFilter, setCategoryFilter] = useState('전체');
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<ExpenseCategory | null>(null);
  const [editingItem, setEditingItem] = useState<Expense | null>(null);
  const [inputName, setInputName] = useState('');
  const [inputAmount, setInputAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const fixedEditor = useRef<FixedExpenseEditorHandle>(null);
  const [inputDate, setInputDate] = useState('');
  const [copyDates, setCopyDates] = useState<Record<string, string> | null>(null);
  const [dateError, setDateError] = useState('');

  const yearMonth = toYearMonth(year, month);
  const recurring = useRecurringFixedExpenses(yearMonth);
  const { expenses, carriedFixedExpenses, loading: queryLoading, error, refetch, add, update, remove, copyCarriedFixedExpenses } = useExpenses(yearMonth);


  const identity = `${user?.id ?? ''}:${store?.id ?? ''}:${currentRole}:${devPreviewMode}:${yearMonth}`;
  const scopeRef = useRef(identity);
  scopeRef.current = identity;
  useEffect(() => { setModalVisible(false); }, [identity]);
  const [readyIdentity, setReadyIdentity] = useState('');
  const loading = queryLoading || readyIdentity !== identity;
  useEffect(() => { let current = true; void refetch().finally(() => { if (current) setReadyIdentity(identity); }); return () => { current = false; }; }, [refetch, identity]);

  const [refreshing, setRefreshing] = useState(false);
  async function onRefresh() {
    setRefreshing(true);
    try { await Promise.all([refetch(), ...(isAdmin ? [recurring.refetch()] : [])]); } finally { setRefreshing(false); }
  }

  const visibleExpenses = useMemo(() => expenses.filter(item => !isAdmin || !recurring.data?.adoptedSourceIds.includes(item.id)), [expenses, isAdmin, recurring.data]);
  const legacyCarried = useMemo(() => carriedFixedExpenses.filter(item => !item.id.startsWith('recurring:') && !recurring.data?.adoptedSourceIds.includes(item.id)), [carriedFixedExpenses, recurring.data]);
  const recurringTotal = isAdmin ? recurring.data?.occurrences.reduce((sum, item) => sum + item.amount, 0) ?? 0 : 0;
  const totalAmount = visibleExpenses.reduce((sum, item) => sum + item.amount, 0) + recurringTotal
    + (visibleExpenses.some(item => item.category === '고정비') ? 0 : legacyCarried.reduce((sum, item) => sum + item.amount, 0));
  const categoryItems = useMemo(() => {
    const grouped = new Map<ExpenseCategory, Expense[]>();
    for (const item of visibleExpenses) {
      const rows = grouped.get(item.category) ?? [];
      rows.push(item);
      grouped.set(item.category, rows);
    }
    return grouped;
  }, [visibleExpenses]);

  function prevMonth() {
    if (onMonthChange) { onMonthChange(toYearMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1)); return; }
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (onMonthChange) { onMonthChange(toYearMonth(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1)); return; }
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  function openAddModal(category: ExpenseCategory) {
    if (category === '고정비' && isAdmin) { fixedEditor.current?.openNew(); return; }
    setCopyDates(null);
    setEditTarget(category);
    setEditingItem(null);
    setInputName('');
    setInputAmount('');
    setInputDate('');
    setDateError('');
    setModalVisible(true);
  }

  function openEditModal(item: Expense) {
    if (item.category === '고정비' && isAdmin) { fixedEditor.current?.openSource(item); return; }
    setCopyDates(null);
    setEditTarget(item.category);
    setEditingItem(item);
    setInputName(item.name);
    setInputAmount(String(item.amount));
    setInputDate(item.occurred_on ?? '');
    setDateError('');
    setModalVisible(true);
  }

  async function handleSave() {
    if (!editTarget || savingRef.current) return;
    const savedIdentity = identity;
    if (copyDates) {
      try {
        const dates = legacyCarried.map(e => ({ id: e.id, occurred_on: validateExpenseDate(copyDates[e.id] ?? '') }));
        if (dates.some(e => !e.occurred_on.startsWith(yearMonth + '-'))) throw new UserFacingError('모든 발생일을 현재 선택 월로 지정해주세요.');
        savingRef.current = true; setSaving(true);
        await copyCarriedFixedExpenses(dates);
        if (scopeRef.current === savedIdentity) setModalVisible(false);
      } catch (e) { if (scopeRef.current === savedIdentity) setDateError(getErrorMessage(e)); }
      finally { savingRef.current = false; setSaving(false); }
      return;
    }
    const name = inputName.trim();
    const amount = Number(inputAmount.replace(/,/g, ''));
    if (!name) { Alert.alert('입력 오류', '항목명을 입력해주세요.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { Alert.alert('입력 오류', '금액을 올바르게 입력해주세요.'); return; }

    try {
      if (inputDate || !editingItem || editingItem.occurred_on) validateExpenseDate(inputDate);
      setDateError('');
    } catch (e) { setDateError(getErrorMessage(e)); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      if (editingItem) {
        await update(editingItem.id, { name, amount, ...(inputDate ? { occurred_on: inputDate } : {}) });
      } else {
        await add({ category: editTarget, name, amount, occurred_on: inputDate });
      }
      if (scopeRef.current === savedIdentity) setModalVisible(false);
    } catch (e: unknown) {
      if (scopeRef.current === savedIdentity) Alert.alert('저장 실패', getErrorMessage(e));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function scheduledChange(sourceId: string): string | null {
    const next = recurring.data?.rules.find(rule => rule.source_expense_id === sourceId && rule.latest.effective_month > yearMonth)?.latest;
    if (!next) return null;
    return next.active ? `${next.effective_month}부터 ${next.amount.toLocaleString()}원 · 매월 ${next.payment_day}일${next.end_month ? ` · ${next.end_month}까지` : ''}` : `${next.effective_month}부터 발생 중단`;
  }

  async function handleDelete(id: string, onDeleted?: () => void) {
    const deleteIdentity = identity;
    Alert.alert('삭제', '이 항목을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: async () => {
          if (scopeRef.current !== deleteIdentity || savingRef.current) return;
          try { animateListChange(); await remove(id); if (scopeRef.current === deleteIdentity) onDeleted?.(); }
          catch (e: unknown) { Alert.alert('삭제 실패', getErrorMessage(e)); }
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >

        <LedgerHeader year={year} month={month} onPrev={prevMonth} onNext={nextMonth} label="이번 달 비용" amount={loading || (isAdmin && recurring.loading) ? '불러오는 중' : error || (isAdmin && recurring.error) ? '조회 필요' : `${totalAmount.toLocaleString()}원`} />
        <LedgerFilters label="비용 카테고리" options={['전체', ...CATEGORIES.map(cat => cat.key)]} selected={categoryFilter} onSelect={setCategoryFilter} />

        {CATEGORIES.filter(cat => categoryFilter === '전체' || cat.key === categoryFilter).map(cat => {
          const catItems = categoryItems.get(cat.key) ?? [];
          const carriedItems = cat.key === '고정비' ? legacyCarried : [];
          const catTotal = (catItems.length > 0 ? catItems.reduce((s, e) => s + e.amount, 0) : carriedItems.reduce((s, e) => s + e.amount, 0)) + (cat.key === '고정비' ? recurringTotal : 0);
          const locked = cat.key === '고정비' && !isAdmin; // 고정비는 관리자만 수정

          const rules = cat.key === '고정비' && isAdmin ? recurring.data?.rules.filter(rule => !expenses.some(source => source.id === rule.source_expense_id && source.year_month === yearMonth)) ?? [] : [];
          const count = (catItems.length || carriedItems.length) + rules.length;
          const categoryPending = loading || (cat.key === '고정비' && isAdmin && recurring.loading);
          const categoryError = !!error || (cat.key === '고정비' && isAdmin && !!recurring.error);
          const isExpanded = expanded[cat.key] === true;
          return (
            <View key={cat.key} style={styles.section}>
              <GlassCard contentStyle={{ padding: 0 }}>
                <TouchableOpacity style={styles.categoryHeader} accessibilityRole="button" accessibilityLabel={`${cat.key} ${isExpanded ? '접기' : '펼치기'}`} accessibilityState={{ expanded: isExpanded }} accessibilityValue={{ text: categoryPending ? '불러오는 중' : categoryError ? '조회 필요' : `${catTotal.toLocaleString()}원, ${count}개 항목` }} onPress={() => { animateListChange(); toggle(cat.key); }} activeOpacity={0.7}>
                  <View style={styles.categorySummary}>
                    <View style={styles.categoryTitleRow}><Text style={styles.catLabel}>{cat.key}</Text>{locked && <AppIcon name="lock-closed" size={12} color={Colors.gray500} />}</View>
                    <NumericText style={styles.catTotal}>{categoryPending ? '불러오는 중' : categoryError ? '조회 필요' : `${catTotal.toLocaleString()}원`}</NumericText>
                  </View>
                  <Text style={styles.categoryCount}>{categoryPending || categoryError ? '—' : `${count}개 항목`}</Text>
                  <AppIcon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.gray500} />
                </TouchableOpacity>
                {isExpanded && <View style={styles.categoryBody}>
                {cat.key === '고정비' && isAdmin && (recurring.error ? <View style={styles.emptyRow}><Text accessibilityRole="alert" style={styles.emptyText}>고정비 조회 실패</Text><TouchableOpacity accessibilityRole="button" onPress={() => { void recurring.refetch(); }} style={styles.addRow}><Text style={styles.addRowText}>고정비 다시 불러오기</Text></TouchableOpacity></View> : !loading && !error && !recurring.loading && rules.map(rule => {
                  const occurrence = recurring.data?.occurrences.find(item => item.rule_id === rule.id);
                  return <TouchableOpacity key={rule.id} accessibilityRole="button" accessibilityLabel={`${rule.latest.name} 고정비 항목 수정`} onPress={() => fixedEditor.current?.openRule(rule)} style={[styles.itemRow, styles.rowBorder]}>
                    <Text style={styles.itemName}>{occurrence?.name ?? rule.latest.name}</Text>{occurrence ? <NumericText style={styles.itemAmount}>{occurrence.amount.toLocaleString()}원</NumericText> : <Text style={styles.noOccurrence}>이번 달 발생 없음</Text>}<AppIcon name="chevron-forward" size={16} color={Colors.gray400} />
                  </TouchableOpacity>;
                }))}
                {categoryPending ? (
                  <View style={styles.emptyRow}>
                    <ActivityIndicator size="small" color={Colors.gray300} />
                  </View>
                ) : error ? <View style={styles.emptyRow}><Text style={styles.emptyText}>비용을 불러오지 못했어요. 화면을 내려 다시 불러와 주세요.</Text></View> : catItems.length === 0 && carriedItems.length === 0 ? (cat.key === '고정비' && isAdmin && (recurring.error || recurring.data?.rules.length) ? null : (
                  <View style={styles.emptyRow}>
                    <Text style={styles.emptyText}>등록된 항목이 없어요</Text>
                  </View>
                )) : catItems.length > 0 ? (
                  catItems.map((item, idx) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.itemRow, idx < catItems.length - 1 && styles.rowBorder]}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: locked }}
                      onPress={locked ? undefined : () => openEditModal(item)}
                      onLongPress={locked ? undefined : () => handleDelete(item.id)}
                      activeOpacity={locked ? 1 : 0.7}
                    >
                      <Text style={styles.itemName}>{item.name}</Text>
                      <NumericText style={styles.itemAmount}>{item.amount.toLocaleString()}원</NumericText>
                      {!locked && <AppIcon name="chevron-forward" size={16} color={Colors.gray400} />}
                    </TouchableOpacity>
                  ))
                ) : (
                  <>
                    <View style={styles.carriedBanner}>
                      <AppIcon name="repeat-outline" size={13} color={Colors.gray500} />
                      <Text style={styles.carriedBannerText}>{isAdmin ? '지난달과 동일(자동 적용)' : '이전 등록 고정비(참고)'}</Text>
                    </View>
                    {carriedItems.map((item, idx) => (
                      <TouchableOpacity disabled={locked} accessibilityRole="button" onPress={() => openEditModal(item)}
                        key={item.id}
                        style={[styles.itemRow, idx < carriedItems.length - 1 && styles.rowBorder]}
                      >
                        <Text style={[styles.itemName, styles.carriedText]}>{item.name}</Text>
                        <NumericText style={[styles.itemAmount, styles.carriedText]}>{item.amount.toLocaleString()}원</NumericText>
                        {!locked && <AppIcon name="chevron-forward" size={16} color={Colors.gray400} />}
                      </TouchableOpacity>
                    ))}
                    <Text style={styles.carriedBannerText}>{isAdmin ? '월 손익에는 유지되며 일별 귀속일은 미정입니다.' : '반복 일정을 포함한 월 적용금액은 관리자에게 확인해주세요.'}</Text>
                    {!locked && <TouchableOpacity style={styles.addRow} accessibilityRole="button" onPress={() => {
                      setEditTarget('고정비'); setEditingItem(null); setDateError('');
                      setCopyDates(Object.fromEntries(carriedItems.map(e => [e.id, '']))); setModalVisible(true);
                    }}><Text style={styles.addRowText}>발생일 확인 후 이번 달로 전체 복사</Text></TouchableOpacity>}
                  </>
                )}

                {locked ? (
                  <View style={[styles.addRow, (catItems.length > 0 || carriedItems.length > 0) && styles.addRowBorder]}>
                    <AppIcon name="lock-closed-outline" size={14} color={Colors.gray400} />
                    <Text style={[styles.addRowText, { color: Colors.gray400 }]}>관리자만 수정할 수 있어요</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.addRow, (catItems.length > 0 || carriedItems.length > 0) && styles.addRowBorder]}
                    disabled={loading || !!error || (cat.key === '고정비' && isAdmin && (recurring.loading || !!recurring.error))}
                    onPress={() => openAddModal(cat.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`${cat.key} 항목 추가`}
                    activeOpacity={0.7}
                  >
                    <AppIcon name="add-circle-outline" size={16} color={Colors.primary} />
                    <Text style={[styles.addRowText, { color: Colors.action }]}>항목 추가</Text>
                  </TouchableOpacity>
                )}
                </View>}
              </GlassCard>
            </View>
          );
        })}

      </ScrollView>

      {isAdmin && <RecurringFixedExpensesPanel ref={fixedEditor} rowsVisible={false} recurring={recurring} yearMonth={yearMonth} legacyExpenses={[...expenses, ...carriedFixedExpenses]} onChanged={refetch} onDeleteSource={(id, onDeleted) => { void handleDelete(id, onDeleted); }} />}
      <SheetModal visible={modalVisible} onRequestClose={() => { if (!savingRef.current) setModalVisible(false); }}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.sheetHeader}>
              <TouchableOpacity onPress={() => { if (!savingRef.current) setModalVisible(false); }} disabled={saving} accessibilityRole="button" style={styles.sheetAction} hitSlop={8}>
                <Text style={styles.sheetCancelText}>취소</Text>
              </TouchableOpacity>
              <Text style={styles.sheetHeaderTitle}>{editTarget} 항목 {editingItem ? '수정' : '추가'}</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving} accessibilityRole="button" accessibilityLabel="비용 저장" accessibilityState={{ disabled: saving, busy: saving }} style={styles.sheetAction}>
                {saving
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Text style={styles.sheetSaveText}>저장</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: '70%' }} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalFieldGroup}>
              {copyDates ? <>
                <Text>전체 고정비의 실제 발생일을 확인해주세요. 금액은 그대로 복사하며 일부만 저장하지 않습니다.</Text>
                {legacyCarried.map(e => <Field key={e.id} label={`${e.name} · ${e.amount.toLocaleString()}원`} value={copyDates[e.id] ?? ''} editable={!saving}
                  placeholder="YYYY-MM-DD" onChangeText={value => setCopyDates(prev => ({ ...prev, [e.id]: value }))} />)}
                {!!dateError && <Text accessibilityRole="alert">{dateError}</Text>}
              </> : <>

              {!!editingItem && !!scheduledChange(editingItem.id) && <Text style={styles.carriedBannerText}>{scheduledChange(editingItem.id)}</Text>}
              <Field label="발생일" value={inputDate} onChangeText={setInputDate}
                editable={!saving} placeholder="YYYY-MM-DD" accessibilityLabel="비용 발생일"
                helpText={dateError || (editingItem && !editingItem.occurred_on ? '기존 자료는 날짜 미상입니다. 확인한 날짜만 지정해주세요. 비워두면 기존 월에 유지됩니다.' : '실제로 비용이 발생한 한국 날짜를 입력해주세요. 해당 월로 저장됩니다.')} />
              <Field
                editable={!saving}
                label="항목명"
                value={inputName}
                onChangeText={setInputName}
                placeholder="예: 임대료, 인스타그램 광고"
              />
              <Field
                editable={!saving}
                label="금액"
                value={inputAmount}
                onChangeText={setInputAmount}
                placeholder="0"
                keyboardType="numeric"
              />
              {!!editingItem && <TouchableOpacity disabled={saving} accessibilityRole="button" accessibilityLabel={`${editingItem.name} 삭제`} style={styles.addRow} onPress={() => { void handleDelete(editingItem.id, () => setModalVisible(false)); }}><Text style={{ color: Colors.danger }}>항목 삭제</Text></TouchableOpacity>}
              </>}
            </ScrollView>

          </View>
        </KeyboardAvoidingView>
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
    backgroundColor: Colors.homeCanvas,
  },
  title: { fontSize: 17, fontWeight: '600', color: Colors.black },
  totalAmount: { fontSize: 15, fontWeight: '600', color: Colors.black },
  scroll: { padding: 20, gap: 18, paddingBottom: 48 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: {
    width: 44, height: 44, justifyContent: 'center', alignItems: 'center',
    borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.homeBorder,
  },
  monthLabel: { fontSize: 15, fontWeight: '600', color: Colors.black },
  section: { gap: 8 },
  categoryHeader: { minHeight: 100, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  categorySummary: { flex: 1, gap: 8 },
  categoryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryCount: { fontSize: 12, color: Colors.gray600 },
  categoryBody: { borderTopWidth: 0.5, borderTopColor: Colors.homeBorder },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catIconBg: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  catLabel: { fontSize: 14, fontWeight: '600', color: Colors.gray600 },
  catTotal: { fontSize: 23, fontWeight: '600', color: Colors.black },
  carriedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6,
  },
  carriedBannerText: { fontSize: 12, color: Colors.gray500 },
  carriedText: { color: Colors.gray500 },
  card: { backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder },
  emptyRow: { paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center' },
  emptyText: { fontSize: 13, color: Colors.gray500 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 44, paddingHorizontal: 16, paddingVertical: 13,
  },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.gray100 },
  itemName: { fontSize: 14, color: Colors.black, flex: 1 },
  noOccurrence: { fontSize: 12, color: Colors.gray600, marginRight: 10 },
  itemAmount: { fontSize: 14, fontWeight: '600', color: Colors.black, marginRight: 10 },
  deleteIconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  addRowBorder: { borderTopWidth: 0.5, borderTopColor: Colors.gray100 },
  addRowText: { fontSize: 13, fontWeight: '500' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlay },
  modalSheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.gray200,
    alignSelf: 'center', marginBottom: 20,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100 },
  sheetHeaderTitle: { fontSize: 16, fontWeight: '700', color: Colors.black },
  sheetAction: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  sheetCancelText: { fontSize: 15, fontWeight: '500', color: Colors.gray500 },
  sheetSaveText: { fontSize: 15, fontWeight: '700', color: Colors.action },
  modalFieldGroup: { gap: 14 },
});

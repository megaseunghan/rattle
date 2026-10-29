import { SheetModal } from './ui/SheetModal';
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md · designed-as-app */
import { NumericText } from './ui/NumericText';
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useAuth } from '../contexts/AuthContext';
import { useExpenses } from '../hooks/useExpenses';
import { Expense, ExpenseCategory } from '../../types';
import { animateListChange } from '../utils/layoutAnimation';
import { getErrorMessage } from '../utils/error';
import { GlassCard } from './GlassCard';
import { LedgerHeader } from './LedgerHeader';
import { LedgerFilters } from './LedgerFilters';
import { Field } from './ui';

// 카테고리 아이콘/합계는 중립색으로 통일하고, "항목 추가" 액션에만 primary를 남겨서
// 색이 너무 많이 쓰이지 않게 한다.
const CATEGORIES: {
  key: ExpenseCategory;
  icon: keyof typeof Ionicons.glyphMap;
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
  const { currentRole, store } = useAuth();
  const isAdmin = currentRole === 'admin';
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

  const yearMonth = toYearMonth(year, month);
  const { expenses, carriedFixedExpenses, loading: queryLoading, error, refetch, add, update, remove, copyCarriedFixedExpenses } = useExpenses(yearMonth);
  const [copying, setCopying] = useState(false);

  const identity = `${store?.id ?? ''}:${yearMonth}`;
  const [readyIdentity, setReadyIdentity] = useState('');
  const loading = queryLoading || readyIdentity !== identity;
  useEffect(() => { let current = true; void refetch().finally(() => { if (current) setReadyIdentity(identity); }); return () => { current = false; }; }, [refetch, identity]);

  const [refreshing, setRefreshing] = useState(false);
  async function onRefresh() {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }

  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);

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
    setEditTarget(category);
    setEditingItem(null);
    setInputName('');
    setInputAmount('');
    setModalVisible(true);
  }

  function openEditModal(item: Expense) {
    setEditTarget(item.category);
    setEditingItem(item);
    setInputName(item.name);
    setInputAmount(String(item.amount));
    setModalVisible(true);
  }

  async function handleSave() {
    if (!editTarget) return;
    const name = inputName.trim();
    const amount = Number(inputAmount.replace(/,/g, ''));
    if (!name) { Alert.alert('입력 오류', '항목명을 입력해주세요.'); return; }
    if (!amount || amount <= 0) { Alert.alert('입력 오류', '금액을 올바르게 입력해주세요.'); return; }

    setSaving(true);
    try {
      if (editingItem) {
        await update(editingItem.id, { name, amount });
      } else {
        await add({ category: editTarget, name, amount });
      }
      setModalVisible(false);
    } catch (e: unknown) {
      Alert.alert('저장 실패', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyCarried() {
    setCopying(true);
    try {
      await copyCarriedFixedExpenses();
    } catch (e: unknown) {
      Alert.alert('적용 실패', getErrorMessage(e));
    } finally {
      setCopying(false);
    }
  }

  async function handleDelete(id: string) {
    Alert.alert('삭제', '이 항목을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: async () => {
          try { animateListChange(); await remove(id); }
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

        <LedgerHeader year={year} month={month} onPrev={prevMonth} onNext={nextMonth} label="이번 달 등록 비용" amount={loading ? '불러오는 중' : error ? '조회 필요' : `${totalAmount.toLocaleString()}원`} />
        <LedgerFilters label="비용 카테고리" options={['전체', ...CATEGORIES.map(cat => cat.key)]} selected={categoryFilter} onSelect={setCategoryFilter} />

        {CATEGORIES.filter(cat => categoryFilter === '전체' || cat.key === categoryFilter).map(cat => {
          const catItems = expenses.filter(e => e.category === cat.key);
          const carriedItems = cat.key === '고정비' ? carriedFixedExpenses : [];
          const catTotal = catItems.length > 0
            ? catItems.reduce((s, e) => s + e.amount, 0)
            : carriedItems.reduce((s, e) => s + e.amount, 0);
          const locked = cat.key === '고정비' && !isAdmin; // 고정비는 관리자만 수정

          return (
            <View key={cat.key} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.catIconBg, { backgroundColor: cat.bg }]} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Ionicons name={cat.icon} size={16} color={cat.color} />
                </View>
                <Text style={styles.catLabel}>{cat.key}</Text>
                {locked && <Ionicons name="lock-closed" size={12} color={Colors.gray400} style={{ marginLeft: 4 }} />}
                {!loading && !error && catTotal > 0 && (
                  <NumericText style={[styles.catTotal, { color: cat.color }]}>
                    {catTotal.toLocaleString()}원
                  </NumericText>
                )}
              </View>

              <GlassCard contentStyle={{ padding: 0 }}>
                {loading ? (
                  <View style={styles.emptyRow}>
                    <ActivityIndicator size="small" color={Colors.gray300} />
                  </View>
                ) : error ? <View style={styles.emptyRow}><Text style={styles.emptyText}>비용을 불러오지 못했어요. 화면을 내려 다시 불러와 주세요.</Text></View> : catItems.length === 0 && carriedItems.length === 0 ? (
                  <View style={styles.emptyRow}>
                    <Text style={styles.emptyText}>등록된 항목이 없어요</Text>
                  </View>
                ) : catItems.length > 0 ? (
                  catItems.map((item, idx) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.itemRow, idx < catItems.length - 1 && styles.rowBorder]}
                      onPress={locked ? undefined : () => openEditModal(item)}
                      onLongPress={locked ? undefined : () => handleDelete(item.id)}
                      activeOpacity={locked ? 1 : 0.7}
                    >
                      <Text style={styles.itemName}>{item.name}</Text>
                      <NumericText style={styles.itemAmount}>{item.amount.toLocaleString()}원</NumericText>
                      {!locked && (
                        <TouchableOpacity
                          onPress={() => handleDelete(item.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`${item.name} 삭제`}
                          hitSlop={8}
                          style={styles.deleteIconBtn}
                        >
                          <Ionicons name="trash-outline" size={16} color={Colors.gray500} />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  ))
                ) : (
                  <>
                    <View style={styles.carriedBanner}>
                      <Ionicons name="repeat-outline" size={13} color={Colors.gray500} />
                      <Text style={styles.carriedBannerText}>지난달과 동일(자동 적용)</Text>
                    </View>
                    {carriedItems.map((item, idx) => (
                      <View
                        key={item.id}
                        style={[styles.itemRow, idx < carriedItems.length - 1 && styles.rowBorder]}
                      >
                        <Text style={[styles.itemName, styles.carriedText]}>{item.name}</Text>
                        <NumericText style={[styles.itemAmount, styles.carriedText]}>{item.amount.toLocaleString()}원</NumericText>
                      </View>
                    ))}
                    {!locked && (
                      <TouchableOpacity
                        style={[styles.addRow, styles.addRowBorder]}
                        onPress={handleCopyCarried}
                        accessibilityRole="button"
                        disabled={copying}
                        activeOpacity={0.7}
                      >
                        {copying
                          ? <ActivityIndicator size="small" color={cat.color} />
                          : (
                            <>
                              <Ionicons name="create-outline" size={16} color={cat.color} />
                              <Text style={[styles.addRowText, { color: cat.color }]}>이번 달로 복사해서 수정</Text>
                            </>
                          )}
                      </TouchableOpacity>
                    )}
                  </>
                )}

                {locked ? (
                  <View style={[styles.addRow, (catItems.length > 0 || carriedItems.length > 0) && styles.addRowBorder]}>
                    <Ionicons name="lock-closed-outline" size={14} color={Colors.gray400} />
                    <Text style={[styles.addRowText, { color: Colors.gray400 }]}>관리자만 수정할 수 있어요</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.addRow, (catItems.length > 0 || carriedItems.length > 0) && styles.addRowBorder]}
                    onPress={() => openAddModal(cat.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`${cat.key} 항목 추가`}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add-circle-outline" size={16} color={Colors.primary} />
                    <Text style={[styles.addRowText, { color: Colors.action }]}>항목 추가</Text>
                  </TouchableOpacity>
                )}
              </GlassCard>
            </View>
          );
        })}

      </ScrollView>

      <SheetModal visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.sheetHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)} accessibilityRole="button" style={styles.sheetAction} hitSlop={8}>
                <Text style={styles.sheetCancelText}>취소</Text>
              </TouchableOpacity>
              <Text style={styles.sheetHeaderTitle}>{editTarget} 항목 {editingItem ? '수정' : '추가'}</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving} accessibilityRole="button" style={styles.sheetAction} hitSlop={8}>
                {saving
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Text style={styles.sheetSaveText}>저장</Text>}
              </TouchableOpacity>
            </View>

            <View style={styles.modalFieldGroup}>
              <Field
                label="항목명"
                value={inputName}
                onChangeText={setInputName}
                placeholder="예: 임대료, 인스타그램 광고"
              />
              <Field
                label="금액"
                value={inputAmount}
                onChangeText={setInputAmount}
                placeholder="0"
                keyboardType="numeric"
              />
            </View>

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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catIconBg: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  catLabel: { fontSize: 14, fontWeight: '600', color: Colors.black, flex: 1 },
  catTotal: { fontSize: 14, fontWeight: '700' },
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
    paddingHorizontal: 16, paddingVertical: 13,
  },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.gray100 },
  itemName: { fontSize: 14, color: Colors.black, flex: 1 },
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

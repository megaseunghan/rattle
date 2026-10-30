/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md · designed-as-app */
import { NumericText } from '../../lib/components/ui/NumericText';
import { getErrorMessage } from '../../lib/utils/error';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useTabPager } from '../../lib/contexts/TabPagerContext';
import { useAuth } from '../../lib/contexts/AuthContext';
import { usePurchases } from '../../lib/hooks/usePurchases';
import { useExpenses } from '../../lib/hooks/useExpenses';
import { getPurchaseItemCounts } from '../../lib/services/purchases';
import { animateListChange } from '../../lib/utils/layoutAnimation';
import { ExpensesPanel } from '../../lib/components/ExpensesPanel';
import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
import { GlassCard } from '../../lib/components/GlassCard';
import { LedgerHeader } from '../../lib/components/LedgerHeader';
import { LedgerFilters } from '../../lib/components/LedgerFilters';
import { CategoryManageModal } from '../../lib/components/CategoryManageModal';
import { usePurchaseCategories } from '../../lib/hooks/usePurchaseCategories';
import { Badge, SummaryCard } from '../../lib/components/ui';

// ─── 공통 ──────────────────────────────────────────────────
type PurchaseTab = string;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function getCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = Array(firstDay).fill(null);
  for (let i = 1; i <= lastDate; i++) days.push(i);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toYearMonth(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function MonthNav({ year, month, onPrev, onNext }: { year: number; month: number; onPrev: () => void; onNext: () => void }) {
  return (
    <View style={styles.monthNav}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="이전 달" onPress={onPrev} style={styles.navBtn} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={20} color={Colors.gray600} />
      </TouchableOpacity>
      <Text style={styles.monthLabel}>{year}년 {month + 1}월</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="다음 달" onPress={onNext} style={styles.navBtn} activeOpacity={0.7}>
        <Ionicons name="chevron-forward" size={20} color={Colors.gray600} />
      </TouchableOpacity>
    </View>
  );
}

// ─── 매입 뷰 ───────────────────────────────────────────────
function PurchasesView({ active }: { active: boolean }) {
  const today = new Date();
  const { selectedMonth, setSelectedMonth, viewState, setViewState } = useTabPager();
  const year = Number(selectedMonth.slice(0, 4));
  const month = Number(selectedMonth.slice(5, 7)) - 1;
  useEffect(() => { setSelectedDay(null); }, [selectedMonth]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [calendarOpen, setCalendarOpenLocal] = useState(viewState?.['purchase.calendar'] === 'open');
  function setCalendarOpen(value: boolean) { setCalendarOpenLocal(value); setViewState?.('purchase.calendar', value ? 'open' : 'closed'); }
  const [activeTab, setActiveTabLocal] = useState<PurchaseTab>(viewState?.['purchase.supplier'] ?? '전체');
  function setActiveTab(value: string) { setActiveTabLocal(value); setViewState?.('purchase.supplier', value); }
  const [filterNotice, setFilterNotice] = useState(false);

  const category = usePurchaseCategories();
  const { currentRole } = useAuth();
  const [categoryModal, setCategoryModal] = useState(false);
  const [activeCategory, setActiveCategory] = useState('전체');
  const categoryOptions = ['전체', ...new Set(category.categories)];
  const yearMonth = toYearMonth(year, month);
  const { purchases, loaded, loading, error, refetch, remove } = usePurchases(yearMonth);

  useFocusEffect(useCallback(() => {
    if (active) { void refetch(); void category.refetch(); }
  }, [active, refetch, category.refetch]));

  const [refreshing, setRefreshing] = useState(false);
  async function onRefresh() {
    setRefreshing(true);
    try { await Promise.all([refetch(), category.refetch()]); } finally { setRefreshing(false); }
  }

  const purchaseTabs = ['전체', ...new Set(purchases.map(p => p.supplier).filter(name => name?.trim()))];
  useEffect(() => {
    if (loaded && !loading && !error && activeTab !== '전체' && !purchaseTabs.includes(activeTab)) {
      setActiveTab('전체'); setFilterNotice(true);
    }
  }, [loaded, loading, error, purchaseTabs.join('|'), activeTab]);
  const days = useMemo(() => getCalendarDays(year, month), [year, month]);
  const availableCategories = [...new Set([...categoryOptions, ...purchases.map(p => p.category)])];
  useEffect(() => { if (!category.loading && !category.error && loaded && !loading && !error && !availableCategories.includes(activeCategory)) setActiveCategory('전체'); }, [category.loading, category.error, loaded, loading, error, availableCategories.join('|'), activeCategory]);
  const filtered = useMemo(() => purchases.filter(p => (activeTab === '전체' || p.supplier === activeTab) && (activeCategory === '전체' || p.category === activeCategory)), [purchases, activeTab, activeCategory]);
  const purchaseByDay = useMemo(() => {
    const grouped = new Map<string, typeof filtered>();
    filtered.forEach(p => {
      const list = grouped.get(p.date) ?? [];
      list.push(p);
      grouped.set(p.date, list);
    });
    return grouped;
  }, [filtered]);
  const selectedKey = selectedDay ? toDateKey(year, month, selectedDay) : null;
  const selectedPurchases = selectedKey ? (purchaseByDay.get(selectedKey) ?? []) : filtered;
  const monthTotal = filtered.reduce((s, p) => s + p.amount, 0);

  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (selectedPurchases.length === 0) return;
    getPurchaseItemCounts(selectedPurchases.map(p => p.id)).then(setItemCounts).catch(() => {});
  }, [selectedKey, purchases]);
  const isToday = (day: number) => year === today.getFullYear() && month === today.getMonth() && day === today.getDate();

  function confirmDeletePurchase(id: string) {
    Alert.alert('삭제', '이 매입 내역을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => { animateListChange(); remove(id).catch(e => Alert.alert('삭제 실패', getErrorMessage(e))); } },
    ]);
  }

  function prevMonth() {
    setSelectedMonth(toYearMonth(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1));
    setSelectedDay(null);
  }
  function nextMonth() {
    setSelectedMonth(toYearMonth(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1));
    setSelectedDay(null);
  }

  function goNewPurchase() {
    const dateParam = selectedDay ? toDateKey(year, month, selectedDay) : toDateKey(year, month, year === today.getFullYear() && month === today.getMonth() ? today.getDate() : 1);
    router.push({ pathname: '/purchases/new', params: dateParam ? { date: dateParam } : {} });
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {filterNotice && <Text style={styles.emptyHint}>선택한 달에 내역이 없는 거래처 필터를 해제했어요.</Text>}
        <LedgerHeader year={year} month={month + 1} onPrev={prevMonth} onNext={nextMonth} label={activeTab === '전체' && activeCategory === '전체' ? '이번 달 매입' : '선택한 조건의 매입'} amount={loading ? '불러오는 중' : error ? '조회 필요' : `${monthTotal.toLocaleString()}원`} />
        <LedgerFilters label="매입 카테고리" options={availableCategories} selected={activeCategory} onSelect={setActiveCategory} onManage={currentRole === 'admin' ? () => setCategoryModal(true) : undefined} />
        {category.error && <Text style={styles.emptyHint}>{category.error}</Text>}
        {purchaseTabs.length > 1 && <LedgerFilters label="거래처" options={purchaseTabs} selected={activeTab} onSelect={setActiveTab} />}

        <TouchableOpacity style={[styles.addBtn, { backgroundColor: Colors.contextBg }]} onPress={() => setCalendarOpen(!calendarOpen)} accessibilityRole="button" accessibilityState={{ expanded: calendarOpen }}>
          <Text style={[styles.addBtnText, { color: Colors.deeper }]}>{calendarOpen ? '달력 접기' : '날짜로 찾기 · 달력 펼치기'}</Text>
        </TouchableOpacity>
        {calendarOpen && <View style={styles.calendarCard}>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={w} style={[styles.weekDay, i === 0 && styles.sundayText, i === 6 && styles.saturdayText]}>{w}</Text>
            ))}
          </View>
          {Array.from({ length: Math.ceil(days.length / 7) }, (_, rowIdx) => (
            <View key={rowIdx} style={styles.calendarRow}>
              {days.slice(rowIdx * 7, (rowIdx + 1) * 7).map((day, colIdx) => {
                if (!day) return <View key={`e-${rowIdx}-${colIdx}`} style={styles.dayCell} />;
                const key = toDateKey(year, month, day);
                const isSelected = selectedDay === day;
                const todayFlag = isToday(day);
                return (
                  <TouchableOpacity key={day} style={styles.dayCell} accessibilityRole="button" accessibilityLabel={`${year}년 ${month + 1}월 ${day}일`} accessibilityState={{ selected: isSelected }} onPress={() => setSelectedDay(isSelected ? null : day)} activeOpacity={0.7}>
                    <View style={[styles.dayInner, isSelected && styles.daySelected, !isSelected && todayFlag && styles.dayToday]}>
                      <Text style={[styles.dayText, colIdx === 0 && !isSelected && styles.sundayText, colIdx === 6 && !isSelected && styles.saturdayText, isSelected && styles.dayTextSelected, !isSelected && todayFlag && styles.dayTextToday]}>{day}</Text>
                    </View>
                    {purchaseByDay.has(key) && <View style={[styles.dot, isSelected && styles.dotSelected]} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>}

        {error && <Text style={styles.emptyHint}>매입을 불러오지 못했어요. 화면을 내려 다시 불러와 주세요.</Text>}
        {!error && (
          <>
            <Text style={styles.sectionLabel}>{month + 1}월 {selectedDay === null ? '전체 매입' : `${selectedDay}일 매입`}</Text>
            <GlassCard contentStyle={{ padding: 0 }}>
              {loading ? <View style={styles.emptyInCard}><ActivityIndicator size="small" color={Colors.gray300} /></View>
                : selectedPurchases.length === 0 ? (
                  <View style={styles.emptyInCard}>
                    <Text style={styles.emptyInCardText}>등록된 매입이 없어요</Text>
                    <Text style={styles.emptyHint}>매입 추가를 눌러 품목·수량·단가를 입력해주세요.</Text>
                  </View>
                )
                : selectedPurchases.map((p, i) => (
                  <TouchableOpacity key={p.id} style={[styles.purchaseRow, i < selectedPurchases.length - 1 && styles.rowBorder]} onPress={() => router.push(`/purchases/${p.id}`)} onLongPress={() => confirmDeletePurchase(p.id)} activeOpacity={0.7} accessibilityRole="button">
                    <View style={styles.purchaseLeft}>
                      <Text style={styles.purchaseSupplier} numberOfLines={2}>{p.supplier}</Text>
                      {itemCounts[p.id] > 0 && (
                        <Text style={styles.purchaseItemCount}>{itemCounts[p.id]}개 품목</Text>
                      )}
                      <Badge label={p.category} variant="neutral" />
                    </View>
                    <NumericText style={styles.purchaseAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{p.amount.toLocaleString()}원</NumericText>
                    <TouchableOpacity onPress={() => confirmDeletePurchase(p.id)} accessibilityRole="button" accessibilityLabel={`${p.supplier} 매입 삭제`} hitSlop={8} style={styles.deleteIconBtn}>
                      <Ionicons name="trash-outline" size={16} color={Colors.gray300} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))
              }
            </GlassCard>
          </>
        )}


      </ScrollView>
        <View style={[styles.actionRow, { padding: 16, backgroundColor: Colors.glass.background, borderTopWidth: 1, borderTopColor: Colors.homeBorder }]}>
          <TouchableOpacity style={styles.addBtn} accessibilityRole="button" onPress={goNewPurchase} activeOpacity={0.95}>
            <Text style={styles.addBtnText}>+ 매입 추가</Text>
          </TouchableOpacity>
        </View>
      <CategoryManageModal visible={categoryModal} onClose={() => setCategoryModal(false)} title="매입 카테고리 관리" removeConfirmHint="이 분류의 기존 매입은 기타로 이동해요." categories={category.categories} loading={category.loading} add={category.add}
        rename={async (oldName, newName) => { await category.rename(oldName, newName); if (activeCategory === oldName) setActiveCategory(newName); await refetch(); }}
        remove={async name => { await category.remove(name); if (activeCategory === name) setActiveCategory('전체'); await refetch(); }} />
    </>
  );
}

// ─── 비용 뷰 ───────────────────────────────────────────────
// ─── 메인 화면 ─────────────────────────────────────────────
const INNER_TABS = ['매입', '비용'] as const;
type InnerTab = (typeof INNER_TABS)[number];

export function PurchasesScreen({ active = true }: { active?: boolean }) {
  const { store } = useAuth();
  const { selectedMonth, setSelectedMonth, viewState, setViewState } = useTabPager();
  const [innerTab, setInnerTabLocal] = useState<InnerTab>(viewState?.['purchase.section'] === '비용' ? '비용' : '매입');
  function setInnerTab(value: InnerTab) { setInnerTabLocal(value); setViewState?.('purchase.section', value); }

  const { purchases, loading: purchasesLoading, error: purchasesError, refetch: refetchPurchases } = usePurchases(selectedMonth);
  const { expenses, loading: expensesLoading, error: expensesError, refetch: refetchExpenses } = useExpenses(selectedMonth);
  const expenseScope = `${store?.id}:${selectedMonth}`;

  const [expenseReadyStore, setExpenseReadyStore] = useState<string | undefined>();
  useEffect(() => {
    if (!active) return;
    let current = true;
    void refetchPurchases();
    void refetchExpenses().finally(() => { if (current) setExpenseReadyStore(expenseScope); });
    return () => { current = false; };
  }, [active, expenseScope, refetchPurchases, refetchExpenses]);

  const monthPurchaseCount = purchases.length;
  const monthExpenseCount = expenses.length;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}><GlassBackdrop />
      <View style={styles.topBar}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>매입 및 비용</Text>
          <Text style={styles.titleSummary}>{selectedMonth} 매입 {purchasesLoading ? '불러오는 중' : purchasesError ? '조회 필요' : `${monthPurchaseCount}건`} · 비용 {expenseReadyStore !== expenseScope || expensesLoading ? '불러오는 중' : expensesError ? '조회 필요' : `${monthExpenseCount}건`}</Text>
        </View>
        <View style={styles.innerTabRow}>
          {INNER_TABS.map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.innerTab, innerTab === tab && styles.innerTabActive]}
              onPress={() => setInnerTab(tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected: innerTab === tab }}
              activeOpacity={0.7}
            >
              <Text style={[styles.innerTabText, innerTab === tab && styles.innerTabTextActive]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {innerTab === '매입' ? <PurchasesView active={active} /> : <View style={{ flex: 1 }}><ExpensesPanel selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} /><View style={styles.fabShelf} /></View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas },
  fabShelf: { height: 68, backgroundColor: 'transparent' },
  topBar: {
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12,
    backgroundColor: 'transparent',
  },
  titleRow: { marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.black },
  titleSummary: { fontSize: 13, lineHeight: 19, color: Colors.gray500, marginTop: 6 },
  innerTabRow: { flexDirection: 'row', gap: 4, backgroundColor: Colors.gray100, borderRadius: 12, padding: 3 },
  innerTab: { flex: 1, minHeight: 44, justifyContent: 'center', paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  innerTabActive: { backgroundColor: Colors.white, shadowColor: Colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  innerTabText: { fontSize: 14, fontWeight: '500', color: Colors.gray500 },
  innerTabTextActive: { color: Colors.action, fontWeight: '700' },

  subTabContent: { gap: 6 },
  subTabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: Colors.homeCanvas, alignItems: 'center' },
  subTab: { paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: Colors.homeBorder, backgroundColor: Colors.white },
  subTabActive: { backgroundColor: Colors.action, borderColor: Colors.primary },
  subTabText: { fontSize: 13, color: Colors.gray500 },
  subTabTextActive: { color: Colors.white, fontWeight: '500' },
  monthTotalRight: { marginLeft: 'auto', fontSize: 13, fontWeight: '600', color: Colors.black },

  scroll: { padding: 20, gap: 16, paddingBottom: 48 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.homeBorder },
  monthLabel: { fontSize: 15, fontWeight: '600', color: Colors.black },

  calendarCard: { backgroundColor: Colors.white, borderRadius: 24, borderWidth: 1, borderColor: Colors.homeBorder, paddingHorizontal: 8, paddingVertical: 16 },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '500', color: Colors.gray400, paddingVertical: 4 },
  sundayText: { color: Colors.negative },
  saturdayText: { color: Colors.action },
  calendarRow: { flexDirection: 'row' },
  dayCell: { flex: 1, minHeight: 44, alignItems: 'center', paddingVertical: 4, gap: 3 },
  dayInner: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  daySelected: { backgroundColor: Colors.action },
  dayToday: { borderWidth: 1.5, borderColor: Colors.primary },
  dayText: { fontSize: 14, color: Colors.black },
  dayTextSelected: { color: Colors.white, fontWeight: '600' },
  dayTextToday: { color: Colors.action, fontWeight: '600' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.action },
  dotSelected: { backgroundColor: Colors.action },

  sectionLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600 },
  listCard: { backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder, overflow: 'hidden' },
  listCardEmpty: { backgroundColor: 'transparent', borderWidth: 0 },
  emptyInCard: { paddingVertical: 16, gap: 8 },
  emptyInCardText: { fontSize: 15, fontWeight: '600', color: Colors.black },
  emptyHint: { fontSize: 13, color: Colors.gray500 },
  purchaseRow: { gap: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, justifyContent: 'space-between' },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.gray100 },
  purchaseLeft: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, flex: 1 },
  purchaseSupplier: { flexShrink: 1, fontSize: 14, fontWeight: '500', color: Colors.black },
  purchaseItemCount: { fontSize: 13, color: Colors.gray500 },
  purchaseAmount: { maxWidth: '48%', fontSize: 15, fontWeight: '600', color: Colors.black },
  deleteIconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  actionRow: { flexDirection: 'row', gap: 10 },
  addBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.action, borderRadius: 14, minHeight: 48, paddingVertical: 14 },
  addBtnText: { fontSize: 14, fontWeight: '600', color: Colors.white },

});

export default PurchasesScreen;

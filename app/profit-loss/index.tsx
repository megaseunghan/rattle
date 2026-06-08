import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
  Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { getYearlyProfitLoss } from '../../lib/services/profitLoss';
import { ProfitLoss, PurchaseCategory } from '../../types';

function fmt(v: number | null | undefined) {
  if (v == null) return '—';
  return `${v.toLocaleString()}원`;
}

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const CAT_ORDER: PurchaseCategory[] = ['식자재','비품','소모품','주류','기타'];

function PnLDetailSheet({ pnl, month, onClose }: { pnl: ProfitLoss; month: number; onClose: () => void }) {
  const cats = pnl.purchaseByCategory ?? {};
  return (
    <View style={sheet.container}>
      <View style={sheet.handle} />
      <View style={sheet.titleRow}>
        <Text style={sheet.title}>{pnl.yearMonth.slice(0,4)}년 {month}월 손익계산서</Text>
        <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.gray500} /></TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* 1. 매출 */}
        <Group label="1. 매출" value={fmt(pnl.revenue)}>
          <Sub label="카드" value={fmt(pnl.cardRevenue)} />
          <Sub label="현금·계좌이체" value={fmt(pnl.cashRevenue)} />
        </Group>

        <Sep />

        {/* 2. 매입 */}
        <Group label="2. 매입" value={fmt(pnl.purchaseCost)}>
          {CAT_ORDER.map(c => (cats[c] ?? 0) > 0 && <Sub key={c} label={c} value={fmt(cats[c])} />)}
        </Group>
        <TotalRow label="= 매출이익" value={fmt(pnl.grossProfit)} />

        <Sep />

        {/* 3. 인건비 */}
        <Group label="3. 인건비" value={fmt(pnl.laborCost)}>
          {pnl.regularGross > 0 && <>
            <Sub label="직원 인건비" value={fmt(pnl.regularGross)} />
            <Sub label="직원 원천징수" value={fmt(pnl.regularWithholding)} />
          </>}
          {pnl.partTimeGross > 0 && <>
            <Sub label="파트타이머 인건비" value={fmt(pnl.partTimeGross)} />
            <Sub label="파트타이머 원천징수" value={fmt(pnl.partTimeWithholding)} />
          </>}
        </Group>

        <Sep />

        {/* 4. 비용 */}
        <Group label="4. 비용" value={fmt(pnl.fixedExpense + pnl.variableExpense)}>
          {pnl.fixedExpense > 0 && <Sub label="고정비" value={fmt(pnl.fixedExpense)} />}
          {pnl.marketingExpense > 0 && <Sub label="마케팅" value={fmt(pnl.marketingExpense)} />}
          {pnl.maintenanceExpense > 0 && <Sub label="시설보수" value={fmt(pnl.maintenanceExpense)} />}
          {pnl.utilitiesExpense > 0 && <Sub label="공과금" value={fmt(pnl.utilitiesExpense)} />}
        </Group>

        {/* 5. 영업이익 */}
        <View style={sheet.profitRow}>
          <Text style={sheet.profitLabel}>5. 영업이익</Text>
          <Text style={[sheet.profitValue, pnl.operatingProfit < 0 && sheet.profitNeg]}>
            {fmt(pnl.operatingProfit)}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Group({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <View style={sheet.group}>
      <View style={sheet.groupRow}>
        <Text style={sheet.groupLabel}>{label}</Text>
        <Text style={sheet.groupValue}>{value}</Text>
      </View>
      {children && <View style={sheet.subs}>{children}</View>}
    </View>
  );
}

function Sub({ label, value }: { label: string; value: string }) {
  return (
    <View style={sheet.subRow}>
      <Text style={sheet.subLabel}>{label}</Text>
      <Text style={sheet.subValue}>{value}</Text>
    </View>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={sheet.totalRow}>
      <Text style={sheet.totalLabel}>{label}</Text>
      <Text style={sheet.totalValue}>{value}</Text>
    </View>
  );
}

function Sep() {
  return <View style={sheet.sep} />;
}

export default function ProfitLossScreen() {
  const { store } = useAuth();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [loading, setLoading] = useState(false);
  const [monthlyData, setMonthlyData] = useState<{ month: number; data: ProfitLoss }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<{ month: number; data: ProfitLoss } | null>(null);

  const load = useCallback(async (y: number) => {
    if (!store) return;
    setLoading(true);
    setLoaded(false);
    try {
      const ct = (store.closing_time as string | null)?.slice(0, 5) ?? '23:00';
      const results = await getYearlyProfitLoss(store.id, y, ct);
      setMonthlyData(results);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [store]);

  function prevYear() { const y = year - 1; setYear(y); load(y); }
  function nextYear() {
    if (year >= today.getFullYear()) return;
    const y = year + 1; setYear(y); load(y);
  }

  const yearTotal = monthlyData.reduce(
    (acc, { data }) => ({
      revenue: acc.revenue + data.revenue,
      operatingProfit: acc.operatingProfit + data.operatingProfit,
      laborCost: acc.laborCost + data.laborCost,
      purchaseCost: acc.purchaseCost + data.purchaseCost,
    }),
    { revenue: 0, operatingProfit: 0, laborCost: 0, purchaseCost: 0 },
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>손익계산서</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* 연도 선택 */}
        <View style={styles.yearRow}>
          <TouchableOpacity onPress={prevYear} style={styles.yearBtn}>
            <Ionicons name="chevron-back" size={18} color={Colors.gray600} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => load(year)} style={styles.yearLabel} activeOpacity={0.7}>
            <Text style={styles.yearText}>{year}년</Text>
            <Ionicons name="refresh-outline" size={14} color={Colors.gray400} style={{ marginLeft: 6 }} />
          </TouchableOpacity>
          <TouchableOpacity onPress={nextYear} style={styles.yearBtn}>
            <Ionicons name="chevron-forward" size={18} color={year >= today.getFullYear() ? Colors.gray200 : Colors.gray600} />
          </TouchableOpacity>
        </View>

        {loading && <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />}

        {!loading && !loaded && (
          <View style={styles.emptyHint}>
            <Ionicons name="bar-chart-outline" size={36} color={Colors.gray300} />
            <Text style={styles.emptyText}>연도를 선택하면{'\n'}해당 연도 손익을 불러옵니다</Text>
            <TouchableOpacity style={styles.loadBtn} onPress={() => load(year)}>
              <Text style={styles.loadBtnText}>{year}년 불러오기</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && loaded && (
          <>
            {/* 연간 합계 카드 */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>{year}년 연간 합계</Text>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryItemLabel}>매출</Text>
                  <Text style={styles.summaryItemValue}>{fmt(yearTotal.revenue)}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryItemLabel}>매입</Text>
                  <Text style={styles.summaryItemValue}>{fmt(yearTotal.purchaseCost)}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryItemLabel}>인건비</Text>
                  <Text style={styles.summaryItemValue}>{fmt(yearTotal.laborCost)}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryItemLabel}>영업이익</Text>
                  <Text style={[styles.summaryItemValue, yearTotal.operatingProfit >= 0 ? styles.profit : styles.loss]}>
                    {fmt(yearTotal.operatingProfit)}
                  </Text>
                </View>
              </View>
            </View>

            {/* 월별 리스트 */}
            <View style={styles.monthList}>
              {monthlyData.map(({ month, data }) => (
                <TouchableOpacity
                  key={month}
                  style={styles.monthRow}
                  onPress={() => setSelected({ month, data })}
                  activeOpacity={0.7}
                >
                  <View style={styles.monthLabel}>
                    <Text style={styles.monthText}>{month}월</Text>
                  </View>
                  <View style={styles.monthValues}>
                    <View style={styles.monthValueItem}>
                      <Text style={styles.monthValueLabel}>매출</Text>
                      <Text style={styles.monthValueNum}>{fmt(data.revenue)}</Text>
                    </View>
                    <View style={styles.monthValueItem}>
                      <Text style={styles.monthValueLabel}>영업이익</Text>
                      <Text style={[styles.monthValueNum, data.operatingProfit >= 0 ? styles.profit : styles.loss]}>
                        {fmt(data.operatingProfit)}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

      </ScrollView>

      {/* 월별 상세 모달 */}
      <Modal
        visible={selected !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelected(null)}>
          {selected && (
            <Pressable onPress={() => {}}>
              <PnLDetailSheet
                pnl={selected.data}
                month={selected.month}
                onClose={() => setSelected(null)}
              />
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.black },
  scroll: { padding: 16, paddingBottom: 48, gap: 16 },

  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  yearBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: Colors.white, borderWidth: 0.5, borderColor: Colors.gray100 },
  yearLabel: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 12, backgroundColor: Colors.white, borderWidth: 0.5, borderColor: Colors.gray100 },
  yearText: { fontSize: 17, fontWeight: '700', color: Colors.black },

  emptyHint: { alignItems: 'center', paddingTop: 48, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.gray400, textAlign: 'center', lineHeight: 22 },
  loadBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.black },
  loadBtnText: { fontSize: 14, fontWeight: '600', color: Colors.white },

  summaryCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 0.5, borderColor: Colors.gray100, padding: 16,
  },
  summaryTitle: { fontSize: 13, fontWeight: '600', color: Colors.gray500, marginBottom: 12 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryItem: { width: '47%' },
  summaryItemLabel: { fontSize: 11, color: Colors.gray400, marginBottom: 2 },
  summaryItemValue: { fontSize: 16, fontWeight: '600', color: Colors.black },

  monthList: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.gray100, overflow: 'hidden' },
  monthRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
  },
  monthLabel: { width: 36 },
  monthText: { fontSize: 14, fontWeight: '600', color: Colors.black },
  monthValues: { flex: 1, flexDirection: 'row', gap: 16 },
  monthValueItem: {},
  monthValueLabel: { fontSize: 11, color: Colors.gray400 },
  monthValueNum: { fontSize: 13, fontWeight: '500', color: Colors.black },

  profit: { color: Colors.primary },
  loss: { color: '#D94040' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
});

const sheet = StyleSheet.create({
  container: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '88%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.gray200, alignSelf: 'center', marginBottom: 16 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.black },

  group: { paddingVertical: 10 },
  groupRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  groupLabel: { fontSize: 13, fontWeight: '600', color: Colors.black },
  groupValue: { fontSize: 13, fontWeight: '600', color: Colors.black },
  subs: { paddingLeft: 12, marginTop: 6, gap: 4 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between' },
  subLabel: { fontSize: 12, color: Colors.gray500 },
  subValue: { fontSize: 12, color: Colors.gray600 },

  sep: { height: 0.5, backgroundColor: Colors.gray100, marginVertical: 4 },

  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: Colors.gray50, borderRadius: 8, marginVertical: 4,
  },
  totalLabel: { fontSize: 12, fontWeight: '600', color: Colors.gray600 },
  totalValue: { fontSize: 13, fontWeight: '600', color: Colors.black },

  profitRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 12,
    backgroundColor: Colors.tinted, borderRadius: 12, marginTop: 8,
  },
  profitLabel: { fontSize: 14, fontWeight: '700', color: Colors.deeper },
  profitValue: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  profitNeg: { color: '#D94040' },
});

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTabPager } from '../../lib/contexts/TabPagerContext';
import { useAdminDashboard, StoreOps } from '../../lib/hooks/useAdminDashboard';
import { StorePnl } from '../../lib/services/adminDashboard';
import { Badge } from '../../lib/components/ui';

function fmt(v: number): string {
  return `${Math.round(v).toLocaleString()}원`;
}

function trendPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function TrendBadge({ pct, suffix = '%' }: { pct: number | null; suffix?: string }) {
  if (pct == null) return null;
  const isUp = pct >= 0;
  const label = `전월 대비 ${isUp ? '+' : ''}${pct.toFixed(1)}${suffix}`;
  return <Badge label={label} variant={isUp ? 'positive' : 'negative'} />;
}

/** 헤더 중앙 드롭다운 — 매장을 고르면 그 매장의 일반 홈 화면으로 전환 */
function StorePickerDropdown({
  visible, onClose, storeNames, onSelectStore,
}: {
  visible: boolean; onClose: () => void;
  storeNames: { id: string; name: string }[]; onSelectStore: (id: string) => void;
}) {
  if (!visible) return null;
  return (
    <>
      <TouchableOpacity style={styles.dropdownOverlay} onPress={onClose} activeOpacity={1} />
      <View style={styles.dropdownBox}>
        <Text style={styles.dropdownHint}>매장을 선택하면 그 매장 화면으로 이동해요</Text>
        {storeNames.map(s => (
          <TouchableOpacity
            key={s.id}
            style={[styles.dropdownItem, styles.dropdownItemBorder]}
            onPress={() => { onSelectStore(s.id); onClose(); }}
            activeOpacity={0.7}
          >
            <Text style={styles.dropdownItemText}>{s.name}</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.gray300} />
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}

function StorePnlCard({ pnl }: { pnl: StorePnl }) {
  const isPositive = pnl.profit >= 0;
  const barPct = Math.max(4, Math.min(100, Math.abs(pnl.margin)));
  return (
    <View style={styles.storeCard}>
      <View style={styles.storeCardHeader}>
        <Text style={styles.storeCardName}>{pnl.storeName}</Text>
        <Text style={[styles.storeCardProfit, isPositive ? styles.positiveText : styles.negativeText]}>
          {isPositive ? '+' : '-'}{fmt(Math.abs(pnl.profit))}
        </Text>
      </View>
      <Text style={styles.storeCardSub}>매출 {fmt(pnl.revenue)}   지출 {fmt(pnl.expense)}</Text>
      <View style={styles.storeCardBarRow}>
        <View style={styles.storeCardBarTrack}>
          <View style={[styles.storeCardBarFill, { width: `${barPct}%` }, isPositive ? styles.barPositive : styles.barNegative]} />
        </View>
        <Text style={[styles.storeCardMargin, isPositive ? styles.positiveText : styles.negativeText]}>
          마진 {pnl.margin.toFixed(1)}%
        </Text>
      </View>
    </View>
  );
}

function CleaningRow({ name, ops }: { name: string; ops: StoreOps | undefined }) {
  const checked = ops?.cleaning.checked ?? 0;
  const total = ops?.cleaning.total ?? 0;
  const pct = total > 0 ? (checked / total) * 100 : 0;
  const isBehind = total > 0 && checked < total * 0.5;
  return (
    <View style={styles.opsRow}>
      <Text style={styles.opsRowLabel}>{name}</Text>
      <View style={styles.opsBarTrack}>
        <View style={[styles.opsBarFill, { width: `${pct}%` }, isBehind ? styles.barNegative : styles.barPositiveAlt]} />
      </View>
      <Text style={[styles.opsRowValue, isBehind && styles.negativeText]}>{checked}/{total}</Text>
    </View>
  );
}

/** 화면 00 — 통합 대시보드 (사장님 홈 탭 기본 화면) */
export function AdminDashboardScreen() {
  const { realRole, switchStore } = useAuth();
  const { goToTab, setHomeMode } = useTabPager();
  const {
    ownedStores, period, setPeriod, anchorYear, anchorMonth, isCurrentMonth,
    pnl, ops, loading, refetch, goPrev, goNext,
  } = useAdminDashboard();
  const [dropdownVisible, setDropdownVisible] = useState(false);

  useEffect(() => { refetch(); }, [refetch]);

  if (realRole !== 'admin') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.empty}><Text style={styles.emptyText}>접근 권한이 없어요</Text></View>
      </SafeAreaView>
    );
  }

  async function handleSelectStore(storeId: string) {
    await switchStore(storeId);
    setHomeMode('store');
  }

  const sumRevenue = pnl.current.reduce((s, p) => s + p.revenue, 0);
  const sumExpense = pnl.current.reduce((s, p) => s + p.expense, 0);
  const sumProfit = pnl.current.reduce((s, p) => s + p.profit, 0);
  const sumMargin = sumRevenue > 0 ? (sumProfit / sumRevenue) * 100 : 0;

  const prevRevenue = pnl.previous.reduce((s, p) => s + p.revenue, 0);
  const prevExpense = pnl.previous.reduce((s, p) => s + p.expense, 0);
  const prevProfit = pnl.previous.reduce((s, p) => s + p.profit, 0);
  const prevMargin = prevRevenue > 0 ? (prevProfit / prevRevenue) * 100 : 0;

  const profitTrend = trendPct(sumProfit, prevProfit);
  const revenueTrend = trendPct(sumRevenue, prevRevenue);
  const expenseTrend = trendPct(sumExpense, prevExpense);
  const marginTrendPt = sumMargin - prevMargin;

  const compareLabel = period === 'month' ? '전월' : '전년';
  const periodLabel = period === 'month' ? `${anchorYear}년 ${anchorMonth}월` : `${anchorYear}년`;

  // 근태 현황 — 전체 합산 + 경고 배너 문구
  const totalWorking = ownedStores.reduce((s, st) => s + (ops[st.id]?.attendance.working ?? 0), 0);
  const totalLate = ownedStores.reduce((s, st) => s + (ops[st.id]?.attendance.late.length ?? 0), 0);
  const totalNoShow = ownedStores.reduce((s, st) => s + (ops[st.id]?.attendance.noShow.length ?? 0), 0);
  const alertParts: string[] = [];
  ownedStores.forEach(st => {
    const a = ops[st.id]?.attendance;
    if (!a) return;
    a.late.forEach(l => alertParts.push(`${st.name} ${l.name} ${l.time} 지각`));
    if (a.noShow.length > 0) alertParts.push(`${st.name} ${a.noShow.length}명 미출근`);
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goToTab('more')} hitSlop={8}>
          <Ionicons name="menu" size={22} color={Colors.black} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerCenter} onPress={() => setDropdownVisible(v => !v)} activeOpacity={0.7}>
          <Text style={styles.headerPeriod}>{periodLabel}</Text>
          <View style={styles.headerStoreRow}>
            <Text style={styles.headerStoreText}>전체 매장 {ownedStores.length}곳</Text>
            <Ionicons name={dropdownVisible ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.gray500} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/mypage')} hitSlop={8}>
          <Ionicons name="person-circle-outline" size={24} color={Colors.gray600} />
        </TouchableOpacity>
      </View>

      <StorePickerDropdown
        visible={dropdownVisible}
        onClose={() => setDropdownVisible(false)}
        storeNames={ownedStores.map(s => ({ id: s.id, name: s.name }))}
        onSelectStore={handleSelectStore}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.periodTabs}>
          <TouchableOpacity
            style={[styles.periodTab, period === 'month' && styles.periodTabActive]}
            onPress={() => setPeriod('month')}
            activeOpacity={0.7}
          >
            <Text style={[styles.periodTabText, period === 'month' && styles.periodTabTextActive]}>월별</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.periodTab, period === 'year' && styles.periodTabActive]}
            onPress={() => setPeriod('year')}
            activeOpacity={0.7}
          >
            <Text style={[styles.periodTabText, period === 'year' && styles.periodTabTextActive]}>연도별</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.navRow}>
          <TouchableOpacity onPress={goPrev} hitSlop={8}><Ionicons name="chevron-back" size={16} color={Colors.gray500} /></TouchableOpacity>
          <Text style={styles.navLabel}>{periodLabel}</Text>
          <TouchableOpacity onPress={goNext} hitSlop={8} disabled={period === 'month' && isCurrentMonth}>
            <Ionicons name="chevron-forward" size={16} color={period === 'month' && isCurrentMonth ? Colors.gray300 : Colors.gray500} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
        ) : ownedStores.length === 0 ? (
          <View style={styles.empty}><Text style={styles.emptyText}>소유한 매장이 없어요</Text></View>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryTop}>
                <Text style={styles.summaryTitle}>{ownedStores.length}개 매장 합산 영업이익</Text>
                <TrendBadge pct={profitTrend} />
              </View>
              <Text style={[styles.summaryValue, sumProfit < 0 && styles.negativeText]}>
                {sumProfit >= 0 ? '' : '-'}{fmt(Math.abs(sumProfit))}
              </Text>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryCols}>
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryColLabel}>매출</Text>
                  <Text style={styles.summaryColValue}>{fmt(sumRevenue)}</Text>
                  {revenueTrend != null && (
                    <Text style={[styles.summaryColTrend, revenueTrend >= 0 ? styles.positiveText : styles.negativeText]}>
                      {compareLabel} 대비 {revenueTrend >= 0 ? '+' : ''}{revenueTrend.toFixed(1)}%
                    </Text>
                  )}
                </View>
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryColLabel}>지출</Text>
                  <Text style={styles.summaryColValue}>{fmt(sumExpense)}</Text>
                  {expenseTrend != null && (
                    <Text style={[styles.summaryColTrend, expenseTrend <= 0 ? styles.positiveText : styles.negativeText]}>
                      {compareLabel} 대비 {expenseTrend >= 0 ? '+' : ''}{expenseTrend.toFixed(1)}%
                    </Text>
                  )}
                </View>
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryColLabel}>마진</Text>
                  <Text style={[styles.summaryColValue, styles.marginValue]}>{sumMargin.toFixed(1)}%</Text>
                  <Text style={[styles.summaryColTrend, marginTrendPt >= 0 ? styles.positiveText : styles.negativeText]}>
                    {compareLabel} 대비 {marginTrendPt >= 0 ? '+' : ''}{marginTrendPt.toFixed(1)}%p
                  </Text>
                </View>
              </View>

              <Text style={styles.summaryCaption}>
                {period === 'month' ? '연도별 탭에서는 전년 대비로 표시돼요' : '전년 동기 대비로 계산돼요'}
              </Text>
            </View>

            <Text style={styles.sectionTitle}>매장별 손익</Text>
            {pnl.current.map(p => <StorePnlCard key={p.storeId} pnl={p} />)}

            <Text style={styles.sectionTitle}>오늘 청소 진행률</Text>
            <View style={styles.opsCard}>
              {ownedStores.map(s => <CleaningRow key={s.id} name={s.name} ops={ops[s.id]} />)}
            </View>

            <Text style={styles.sectionTitle}>근태 현황</Text>
            <View style={styles.statRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{totalWorking}</Text>
                <Text style={styles.statLabel}>근무 중</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, totalLate > 0 && styles.negativeText]}>{totalLate}</Text>
                <Text style={styles.statLabel}>지각</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, totalNoShow > 0 && styles.negativeText]}>{totalNoShow}</Text>
                <Text style={styles.statLabel}>미출근</Text>
              </View>
            </View>
            {alertParts.length > 0 && (
              <View style={styles.alertBanner}>
                <Ionicons name="warning-outline" size={16} color={Colors.negative} />
                <Text style={styles.alertText} numberOfLines={2}>{alertParts.join(' · ')}</Text>
              </View>
            )}

            <Text style={styles.sectionTitle}>오늘 스케줄</Text>
            <View style={styles.opsCard}>
              {ownedStores.map(s => {
                const sched = ops[s.id]?.schedule;
                if (!sched || sched.headcount === 0) {
                  return (
                    <View key={s.id} style={styles.scheduleEmptyRow}>
                      <Text style={styles.opsRowLabel}>{s.name}</Text>
                      <Text style={styles.scheduleEmptyText}>오늘 등록된 스케줄이 없어요</Text>
                    </View>
                  );
                }
                return (
                  <View key={s.id} style={styles.scheduleRow}>
                    <View style={styles.scheduleHeaderRow}>
                      <Text style={styles.opsRowLabel}>{s.name}</Text>
                      <Text style={styles.scheduleMeta}>{sched.headcount}명 · {sched.totalHours}h</Text>
                    </View>
                    <View style={styles.scheduleBarTrack}>
                      <View style={styles.scheduleBarSegA} />
                      <View style={styles.scheduleBarSegB} />
                      <View style={styles.scheduleBarSegC} />
                    </View>
                    <View style={styles.scheduleTimeRow}>
                      <Text style={styles.scheduleTimeText}>{sched.earliestStart}</Text>
                      <Text style={styles.scheduleTimeText}>{sched.latestEnd}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <Text style={styles.footerCaption}>
              사장님만 보이는 화면 · 매장을 전환하면 아래 모든 카드가 그 매장 기준으로 바뀌어요
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default AdminDashboardScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
    backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
  },
  headerCenter: { alignItems: 'center', gap: 2 },
  headerPeriod: { fontSize: 12, fontWeight: '500', color: Colors.gray400 },
  headerStoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerStoreText: { fontSize: 16, fontWeight: '700', color: Colors.black },

  dropdownOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 },
  dropdownBox: {
    position: 'absolute', top: 66, alignSelf: 'center', minWidth: 220, maxWidth: 280,
    backgroundColor: Colors.white, borderRadius: 14, paddingVertical: 6, zIndex: 11,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
  },
  dropdownHint: { fontSize: 11, fontWeight: '500', color: Colors.gray400, paddingHorizontal: 16, paddingVertical: 8 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16 },
  dropdownItemBorder: { borderTopWidth: 0.5, borderTopColor: Colors.gray100 },
  dropdownItemText: { fontSize: 14, fontWeight: '600', color: Colors.black },

  scroll: { padding: 16, paddingBottom: 48, gap: 14 },

  periodTabs: { flexDirection: 'row', backgroundColor: Colors.gray100, borderRadius: 12, padding: 3 },
  periodTab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9 },
  periodTabActive: { backgroundColor: Colors.white },
  periodTabText: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  periodTabTextActive: { color: Colors.black },

  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  navLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600, minWidth: 80, textAlign: 'center' },

  summaryCard: { backgroundColor: Colors.tinted, borderRadius: 18, padding: 18, gap: 4 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryTitle: { fontSize: 13, fontWeight: '600', color: Colors.gray600 },
  summaryValue: { fontSize: 28, fontWeight: '700', color: Colors.black, letterSpacing: -0.5 },
  summaryDivider: { height: 0.5, backgroundColor: Colors.gray200, marginVertical: 10 },
  summaryCols: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryCol: { gap: 3 },
  summaryColLabel: { fontSize: 11, fontWeight: '600', color: Colors.gray400 },
  summaryColValue: { fontSize: 15, fontWeight: '700', color: Colors.black },
  marginValue: { color: Colors.primary },
  summaryColTrend: { fontSize: 10, fontWeight: '500' },
  summaryCaption: { fontSize: 11, fontWeight: '400', color: Colors.gray400, marginTop: 10 },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.gray600 },

  storeCard: {
    backgroundColor: Colors.white, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.gray100,
    padding: 14, gap: 6,
  },
  storeCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  storeCardName: { fontSize: 15, fontWeight: '700', color: Colors.black },
  storeCardProfit: { fontSize: 17, fontWeight: '700' },
  storeCardSub: { fontSize: 12, fontWeight: '500', color: Colors.gray400 },
  storeCardBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  storeCardBarTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: Colors.gray100, overflow: 'hidden' },
  storeCardBarFill: { height: '100%', borderRadius: 3 },
  storeCardMargin: { fontSize: 12, fontWeight: '700' },

  opsCard: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.gray100, padding: 14, gap: 14 },
  opsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  opsRowLabel: { width: 56, fontSize: 13, fontWeight: '700', color: Colors.black },
  opsBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: Colors.gray100, overflow: 'hidden' },
  opsBarFill: { height: '100%', borderRadius: 4 },
  opsRowValue: { width: 34, fontSize: 12, fontWeight: '700', color: Colors.gray600, textAlign: 'right' },

  barPositive: { backgroundColor: Colors.positive },
  barPositiveAlt: { backgroundColor: Colors.primary },
  barNegative: { backgroundColor: Colors.negative },
  positiveText: { color: Colors.positive },
  negativeText: { color: Colors.negative },

  statRow: { flexDirection: 'row', gap: 10 },
  statBox: {
    flex: 1, alignItems: 'center', backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.gray100, paddingVertical: 14, gap: 4,
  },
  statValue: { fontSize: 22, fontWeight: '700', color: Colors.black },
  statLabel: { fontSize: 12, fontWeight: '500', color: Colors.gray400 },

  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.negativeBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
  },
  alertText: { flex: 1, fontSize: 12, fontWeight: '600', color: Colors.negative },

  scheduleRow: { gap: 8 },
  scheduleEmptyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scheduleEmptyText: { fontSize: 12, fontWeight: '500', color: Colors.gray400 },
  scheduleHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scheduleMeta: { fontSize: 12, fontWeight: '600', color: Colors.gray500 },
  scheduleBarTrack: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  scheduleBarSegA: { flex: 1, backgroundColor: Colors.primary },
  scheduleBarSegB: { flex: 1, backgroundColor: Colors.primary, opacity: 0.6 },
  scheduleBarSegC: { flex: 1, backgroundColor: Colors.primary, opacity: 0.3 },
  scheduleTimeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  scheduleTimeText: { fontSize: 11, fontWeight: '500', color: Colors.gray400 },

  footerCaption: { fontSize: 11, fontWeight: '400', color: Colors.gray400, textAlign: 'center', lineHeight: 16 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, color: Colors.gray400 },
});

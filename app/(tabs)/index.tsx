import { scheduleIdleTask } from '../../lib/utils/scheduleIdleTask';
import { StoreAppBar } from '../../lib/components/StoreAppBar';
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md · designed-as-app */
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { DailyOperationsHome } from '../../lib/components/DailyOperationsHome';
import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
import { GlassCard } from '../../lib/components/GlassCard';
import { HomeAlertsPanel } from '../../lib/components/HomeAlertsPanel';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { useTossSync } from '../../lib/hooks/useTossSync';
import { useProfitLossTrendChart, TrendBar } from '../../lib/hooks/useProfitLossTrendChart';
import { useTabPager } from '../../lib/contexts/TabPagerContext';
import { HomeFinancialSummary } from '../../types';
import { resolveSelfEmployee } from '../../lib/utils/resolveSelfEmployee';
import { ErrorMessage } from '../../lib/components/ErrorMessage';

function fmt(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toLocaleString()}원`;
}

function pct(value: number | null | undefined, total: number | null | undefined): string | null {
  if (value == null || !total) return null;
  return `${(value / total * 100).toFixed(1)}%`;
}

function fmtTrend(v: number | null | undefined): string | null {
  if (v == null) return null;
  const arrow = v > 0 ? '▲' : v < 0 ? '▼' : '';
  return `${arrow}${Math.abs(v).toFixed(1)}%`;
}

type MetricKey = 'revenue' | 'purchase' | 'labor' | 'expense' | 'profit';
const METRIC_CHIPS: { key: MetricKey; label: string }[] = [
  { key: 'revenue', label: '매출' },
  { key: 'purchase', label: '매입' },
  { key: 'labor', label: '인건비' },
  { key: 'expense', label: '비용' },
  { key: 'profit', label: '영업이익' },
];

function metricValue(pnl: HomeFinancialSummary | null, key: MetricKey): number | null {
  if (!pnl) return null;
  switch (key) {
    case 'revenue': return pnl.revenue;
    case 'purchase': return pnl.purchaseCost;
    case 'labor': return pnl.laborCost;
    case 'expense': return (pnl.fixedExpense ?? 0) + (pnl.variableExpense ?? 0);
    case 'profit': return pnl.operatingProfit;
  }
}

/** 소수점이 딱 .0으로 떨어지면 생략 (예: "100.0%" → "100%") */
function trimTrailingZero(v: string): string {
  return v.replace(/\.0(%?)$/, '$1');
}

/** 영업이익을 먼저 읽고, 2×2 금액을 눌러 원하는 지표의 추이를 확인한다. */
function FinancialSummaryCard({ pnl, loading, selected, onSelect, periodLabel, onPrev, onNext, nextDisabled }: {
  pnl: HomeFinancialSummary | null; loading: boolean;
  selected: MetricKey; onSelect: (key: MetricKey) => void;
  periodLabel: string; onPrev: () => void; onNext: () => void; nextDisabled: boolean;
}) {
  const profit = metricValue(pnl, 'profit');
  const margin = pct(profit, pnl?.revenue);
  const metrics: { key: MetricKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'revenue', label: '매출', icon: 'trending-up-outline' },
    { key: 'purchase', label: '매입', icon: 'bag-handle-outline' },
    { key: 'labor', label: '인건비', icon: 'people-outline' },
    { key: 'expense', label: '비용', icon: 'receipt-outline' },
  ];
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryHeader}>
        <Text style={styles.summaryEyebrow}>우리 매장 손익</Text>
        <View style={styles.trendNavRow}>
          <TouchableOpacity onPress={onPrev} style={styles.trendNavBtn} accessibilityRole="button" accessibilityLabel="이전 달">
            <Ionicons name="chevron-back" size={16} color={Colors.gray600} />
          </TouchableOpacity>
          <Text style={styles.trendNavLabel}>{periodLabel}</Text>
          <TouchableOpacity onPress={onNext} style={styles.trendNavBtn} disabled={nextDisabled} accessibilityRole="button" accessibilityLabel="다음 달" accessibilityState={{ disabled: nextDisabled }}>
            <Ionicons name="chevron-forward" size={16} color={nextDisabled ? Colors.gray300 : Colors.gray600} />
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity
        style={styles.profitButton} onPress={() => onSelect('profit')} activeOpacity={0.75}
        accessibilityRole="button" accessibilityLabel={`영업이익 ${loading ? '불러오는 중' : fmt(profit)} 추이 보기`}
        accessibilityState={{ selected: selected === 'profit', busy: loading }}
      >
        <View style={styles.profitLabelRow}>
          <Text style={styles.profitLabel}>영업이익</Text>
          <Text style={styles.aggregateLabel}>현재 집계</Text>
          {selected === 'profit' && <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />}
        </View>
        {loading ? <ActivityIndicator style={styles.summaryLoading} color={Colors.primary} accessibilityLabel="손익 불러오는 중" /> : (
          <Text style={[styles.profitValue, profit != null && profit < 0 && styles.metricValueNegative]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{fmt(profit)}</Text>
        )}
        {margin && !loading && <Text style={styles.marginLabel}>매출 대비 이익률 {trimTrailingZero(margin)}</Text>}
      </TouchableOpacity>
      <View style={styles.metricGrid}>
        {metrics.map(metric => (
          <TouchableOpacity
            key={metric.key} style={[styles.metricTile, selected === metric.key && styles.metricTileActive]}
            onPress={() => onSelect(metric.key)} activeOpacity={0.75}
            accessibilityRole="button" accessibilityLabel={`${metric.label} ${loading ? '불러오는 중' : fmt(metricValue(pnl, metric.key))} 추이 보기`}
            accessibilityState={{ selected: selected === metric.key, busy: loading }}
          >
            <View style={styles.metricTileHeading}>
              <Ionicons name={metric.icon} size={16} color={selected === metric.key ? Colors.primary : Colors.gray500} />
              <Text style={[styles.metricTileLabel, selected === metric.key && styles.metricTileLabelActive]}>{metric.label}</Text>
            </View>
            {loading ? <ActivityIndicator size="small" color={Colors.gray400} /> : (
              <Text style={styles.metricTileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{fmt(metricValue(pnl, metric.key))}</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.summaryHint}>{!loading && !pnl ? '요약을 불러오면 금액을 확인할 수 있어요.' : '금액을 누르면 아래에서 월별 추이를 볼 수 있어요.'}</Text>
    </View>
  );
}

function compactAmount(value: number): string {
  const amount = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (amount >= 100_000_000) return `${sign}${(amount / 100_000_000).toFixed(1)}억`;
  if (amount >= 10_000) return `${sign}${(amount / 10_000).toFixed(amount < 100_000 ? 1 : 0)}만`;
  return `${sign}${amount.toLocaleString('ko-KR')}`;
}

/** 선택한 달까지 최근 6개월. 음수는 0선 아래, 조회 실패는 빈 값으로 표시한다. */
function TrendChartSection({
  bars, loading, metric, onSelectBar,
}: {
  bars: TrendBar[]; loading: boolean; metric: MetricKey; onSelectBar: (yearMonth: string) => void;
}) {
  const values = bars.map(b => metricValue(b.data, metric) ?? 0);
  const positive = Math.max(0, ...values);
  const negative = Math.max(0, ...values.map(value => -value));
  const range = Math.max(1, positive + negative);
  const zeroBottom = negative / range * 112;
  const anchorIndex = bars.findIndex(bar => bar.isCurrent);
  const value = anchorIndex >= 0 ? metricValue(bars[anchorIndex].data, metric) : null;
  const previous = anchorIndex > 0 ? metricValue(bars[anchorIndex - 1].data, metric) : null;
  const selectedSummary = anchorIndex >= 0 ? bars[anchorIndex].data : null;
  const share = pct(metric === 'revenue' ? selectedSummary?.operatingProfit : value, selectedSummary?.revenue);
  const shareLabel = share ? `${metric === 'revenue' ? '마진' : '매출의'} ${trimTrailingZero(share)}` : null;
  const trendLabel = fmtTrend(value != null && previous != null && previous !== 0
    ? (value - previous) / Math.abs(previous) * 100 : null);

  return (
    <View style={styles.trendSection}>
      <View style={styles.trendHeading}>
        <Text style={styles.sectionTitle}>{METRIC_CHIPS.find(chip => chip.key === metric)?.label} 추이</Text>
        <Text style={styles.trendCaption}>최근 6개월 · 원</Text>
      </View>
      {selectedSummary && selectedSummary.laborCost == null && <Text style={styles.trendCaption}>급여 명세·적용 조건 확인 전까지 인건비와 영업이익은 표시하지 않아요.</Text>}
      {shareLabel && <Text style={styles.trendShare}>{shareLabel}</Text>}
      {trendLabel && <Text style={styles.trendComparison}>선택 월 집계 · 전월 전체 대비 {trendLabel}</Text>}

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={styles.trendLoading} />
      ) : (
        <View style={styles.trendBarRow}>
          {bars.map((bar, i) => {
            const isEmpty = metricValue(bar.data, metric) == null;
            const value = values[i];
            const height = value === 0 ? 0 : Math.max(2, Math.abs(value) / range * 112);
            return (
              <TouchableOpacity
                key={bar.key}
                style={styles.trendBarCol}
                onPress={() => onSelectBar(bar.key)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: bar.isCurrent }}
                accessibilityLabel={`${bar.key} ${METRIC_CHIPS.find(chip => chip.key === metric)?.label} ${isEmpty ? bar.data ? '급여 확인 필요' : '조회 실패' : fmt(value)}`}
              >
                <Text style={[styles.trendAmount, value < 0 && styles.metricValueNegative]} numberOfLines={1}>
                  {isEmpty ? bar.data ? '확인 필요' : '—' : compactAmount(value)}
                </Text>
                <View style={styles.trendBarTrack}>
                  <View style={[styles.trendZeroLine, { bottom: zeroBottom }]} />
                  {!isEmpty && value !== 0 && (
                    <View
                      style={[
                        styles.trendBarFill,
                        { height, bottom: value > 0 ? zeroBottom : undefined, top: value < 0 ? 112 - zeroBottom : undefined },
                        bar.isCurrent ? styles.trendBarFillActive : styles.trendBarFillInactive,
                        value < 0 && styles.trendBarFillNegative,
                      ]}
                    />
                  )}
                </View>
                <Text style={[styles.trendBarLabel, bar.isCurrent && styles.trendBarLabelActive]}>{bar.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

export function HomeScreen({ active = true }: { active?: boolean }) {
  const { store, user, currentRole, devPreviewEmployeeId, devPreviewMode, canReadFinancials } = useAuth();
  const { goToTab, openStorePicker, selectedMonth, setSelectedMonth } = useTabPager();
  const { unreadCount, refetch: refetchNotifications } = useNotifications();
  const { data: ingredients, refetch } = useIngredients();
  const { employees, refetch: refetchEmp } = useEmployees();

  const today = new Date();
  const realYear = today.getFullYear();
  const realMonth = today.getMonth() + 1;

  const [showFinancial, setShowFinancial] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('profit');
  const yearMonth = selectedMonth;
  const [anchorYear, anchorMonth] = selectedMonth.split('-').map(Number);
  const { todaySales, autoSyncOnForeground, loadTodaySales } = useTossSync();
  const { bars, loading: trendLoading, selectedLoading, updating: summaryUpdating, error: trendError, refetch: fetchTrend } = useProfitLossTrendChart(anchorYear, anchorMonth, canReadFinancials && showFinancial);
  const pnl = bars.find(bar => bar.key === yearMonth)?.data ?? null;

  const isCurrentPeriod = anchorYear === realYear && anchorMonth === realMonth;

  function goPrevPeriod() {
    const previous = new Date(anchorYear, anchorMonth - 2, 1);
    setSelectedMonth(`${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`);
  }

  function goNextPeriod() {
    if (isCurrentPeriod) return;
    const next = new Date(anchorYear, anchorMonth, 1);
    setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  }

  function selectBarMonth(yearMonthKey: string) {
    const [y, m] = yearMonthKey.split('-').map(Number);
    if (y > realYear || (y === realYear && m > realMonth)) return; // 아직 오지 않은 달은 선택 불가
    setSelectedMonth(yearMonthKey);
  }

  // 로그인 본인에 연결된 직원 → 파트타이머 여부 판별 (관리자 테스트 미리보기 시엔 선택된 직원)
  const myEmployee = resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId);
  const effectiveRole: 'admin' | 'member' | 'part_time' =
    currentRole === 'admin' ? 'admin'
    : devPreviewMode === 'part_time' || myEmployee?.employment_type === 'part_time' ? 'part_time'
    : 'member';

  const [refreshing, setRefreshing] = useState(false);
  const [alertRefreshKey, setAlertRefreshKey] = useState(0);

  async function loadAll(forceFinancial = false) {
    await Promise.all([
      refetch(forceFinancial),
      refetchEmp(forceFinancial),
      ...(forceFinancial ? [refetchNotifications()] : []),
      ...(forceFinancial && showFinancial ? [fetchTrend()] : []),
      ...(currentRole === 'admin' ? [loadTodaySales()] : []),
    ]);
  }

  async function onRefresh() {
    setRefreshing(true);
    setAlertRefreshKey(value => value + 1);
    try { await loadAll(true); } finally { setRefreshing(false); }
  }

  useEffect(() => {
    if (!active) return;
    return scheduleIdleTask(() => { void loadAll(); });
  }, [active, refetch, refetchEmp, refetchNotifications, loadTodaySales, fetchTrend, currentRole]);

  useEffect(() => {
    if (!active) return;
    autoSyncOnForeground();
  }, [active, autoSyncOnForeground]);

  const monthLabel = `${anchorYear}년 ${anchorMonth}월`;

  return (
    <SafeAreaView style={styles.container}>
      <GlassBackdrop />
      <StoreAppBar name={store?.name ?? '매장 선택'} unreadCount={unreadCount}
        onMenu={() => goToTab('more')} onStore={() => openStorePicker()}
        onNotifications={() => router.push('/notifications')} onProfile={() => router.push('/mypage')} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <DailyOperationsHome active={active} refreshKey={alertRefreshKey} isAdmin={currentRole === 'admin'} isPartTime={effectiveRole === 'part_time'} canUseFinancialTabs={canReadFinancials && effectiveRole !== 'part_time'} />
        <HomeAlertsPanel active={active} refreshKey={alertRefreshKey} todaySales={todaySales} financial={currentRole === 'admin'} />
        {canReadFinancials && <GlassCard contentStyle={{ padding: 0 }}>
          <TouchableOpacity onPress={() => setShowFinancial(value => !value)} accessibilityRole="button" accessibilityLabel="월별 손익 요약" accessibilityState={{ expanded: showFinancial }} style={{ padding: 18, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons name="analytics-outline" size={22} color={Colors.action} />
            <View style={{ flex: 1, gap: 4 }}><Text style={{ fontFamily: Fonts.wantedBold, fontSize: 16, color: Colors.black }}>월별 손익 요약</Text><Text style={{ color: Colors.gray600, fontSize: 12 }}>매장 운영의 결과를 확인해요</Text></View>
            <Ionicons name={showFinancial ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.gray600} />
          </TouchableOpacity>
        </GlassCard>}
        {canReadFinancials && showFinancial && <>
        <FinancialSummaryCard
          pnl={pnl}
          loading={selectedLoading}
          periodLabel={monthLabel}
          onPrev={goPrevPeriod}
          onNext={goNextPeriod}
          nextDisabled={isCurrentPeriod}
          selected={selectedMetric}
          onSelect={setSelectedMetric}
        />

        {!selectedLoading && pnl && pnl.laborCost === null && (
          <View style={{ padding: 16, borderRadius: 18, backgroundColor: Colors.taskBg, borderWidth: 1, borderColor: Colors.taskBorder, gap: 8 }}>
            <Text style={{ color: Colors.black, fontSize: 16, fontWeight: '700' }}>{monthLabel} 인건비 확인 필요</Text>
            <Text style={{ color: Colors.gray700, lineHeight: 21 }}>
              {currentRole === 'admin' ? '급여 조건과 해당 월의 급여 내역을 확인해 주세요.' : '관리자가 인건비를 확인 중이에요.'}
            </Text>
            {currentRole === 'admin' && <TouchableOpacity onPress={() => goToTab('payroll')} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: Colors.deeper, fontWeight: '700' }}>확인할 직원 보기 →</Text>
            </TouchableOpacity>}
          </View>
        )}


        {summaryUpdating && !selectedLoading && <Text style={{ color: Colors.gray600 }}>업데이트 중이에요</Text>}
        {trendError && <ErrorMessage message={trendError} onRetry={fetchTrend} />}

        <TrendChartSection
          bars={bars}
          loading={trendLoading && bars.every(bar => !bar.data)}
          metric={selectedMetric}
          onSelectBar={selectBarMonth}
        />
        {currentRole === 'admin' && <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/profit-loss')} style={{ minHeight: 48, padding: 14 }}><Text style={{ color: Colors.action, fontFamily: Fonts.wantedSemiBold }}>손익 정산</Text></TouchableOpacity>}

        </>}
        <Text style={styles.footerCaption}>{store?.name ?? ''} · {monthLabel}</Text>
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas },

  storeDropdownOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  },
  storeDropdownBox: {
    position: 'absolute',
    top: 62,
    alignSelf: 'center',
    minWidth: 200,
    maxWidth: 280,
    backgroundColor: Colors.white,
    borderRadius: 14,
    paddingVertical: 6,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  storeDropdownHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 16,
  },
  storeDropdownTitle: { fontSize: 13, fontWeight: '700', color: Colors.gray500 },
  storeDropdownItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, paddingVertical: 12, paddingHorizontal: 16,
  },
  storeDropdownItemBorder: { borderTopWidth: 0.5, borderTopColor: Colors.gray100 },
  storeDropdownItemText: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.black },
  storeDropdownItemTextActive: { color: Colors.action },

  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 18, paddingBottom: 100 },
  welcome: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  welcomeText: { flex: 1, minWidth: 0, gap: 10 },
  wordmark: { fontSize: 18, fontFamily: Fonts.spaceGroteskBold, color: Colors.action, letterSpacing: -0.4 },
  welcomeTitle: { fontSize: 21, fontWeight: '700', color: Colors.black, lineHeight: 30, letterSpacing: -0.5 },
  welcomeImage: { width: 90, height: 100 },
  summaryCard: { backgroundColor: Colors.white, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: Colors.homeBorder },
  summaryHeader: { gap: 2 },
  summaryEyebrow: { fontSize: 12, fontWeight: '600', color: Colors.gray500 },
  profitButton: { paddingTop: 10, paddingBottom: 20, gap: 8, minHeight: 110 },
  profitLabelRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  profitLabel: { fontSize: 15, fontWeight: '600', color: Colors.black },
  aggregateLabel: { fontSize: 11, color: Colors.gray500 },
  profitValue: { fontSize: 34, fontFamily: Fonts.spaceGroteskBold, fontVariant: ['tabular-nums'], fontWeight: '700', color: Colors.positive, letterSpacing: -1 },
  marginLabel: { fontSize: 12, color: Colors.gray600 },
  summaryLoading: { minHeight: 42, alignSelf: 'flex-start' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: Colors.homeBorder, paddingTop: 10, gap: 8 },
  metricTile: { flexBasis: '46%', flexGrow: 1, minWidth: 0, paddingHorizontal: 9, paddingVertical: 12, borderRadius: 12, gap: 9, borderWidth: 1, borderColor: Colors.white },
  metricTileActive: { backgroundColor: Colors.tinted, borderColor: Colors.pale },
  metricTileHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metricTileLabel: { fontSize: 13, fontWeight: '500', color: Colors.gray600, flexShrink: 1 },
  metricTileLabelActive: { color: Colors.deeper, fontWeight: '600' },
  metricTileValue: { fontSize: 19, fontFamily: Fonts.spaceGroteskBold, fontVariant: ['tabular-nums'], fontWeight: '700', color: Colors.black, letterSpacing: -0.4 },
  summaryHint: { fontSize: 11, lineHeight: 17, color: Colors.gray500, marginTop: 12 },
  metricValueNegative: { color: Colors.negative },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: Colors.black },
  trendHeading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  trendCaption: { fontSize: 11, color: Colors.gray500 },
  trendShare: { fontSize: 13, fontWeight: '600', color: Colors.gray700 },
  trendComparison: { fontSize: 12, lineHeight: 18, color: Colors.gray600 },

  // 월별 추이 막대그래프
  trendSection: { gap: 16, backgroundColor: Colors.white, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: Colors.homeBorder },
  trendNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trendNavBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  trendNavLabel: { fontSize: 15, fontWeight: '700', color: Colors.black, minWidth: 96, textAlign: 'center' },
  trendLoading: { height: 160 },
  trendBarRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  trendBarCol: { flex: 1, minWidth: 0, alignItems: 'center', gap: 8 },
  trendAmount: { fontSize: 11, color: Colors.gray600, fontVariant: ['tabular-nums'] },
  trendBarTrack: { width: '100%', height: 112 },
  trendZeroLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: Colors.gray200 },
  trendBarFill: { position: 'absolute', left: '20%', width: '60%', borderRadius: 4 },
  trendBarFillActive: { backgroundColor: Colors.primary },
  trendBarFillInactive: { backgroundColor: Colors.gray200 },
  trendBarFillNegative: { backgroundColor: Colors.negative },
  trendBarLabel: { fontSize: 11, fontWeight: '500', color: Colors.gray400 },
  trendBarLabelActive: { color: Colors.black, fontWeight: '700' },

  // 바로가기: 아이콘 장식 대신 작업명이 먼저 읽히는 목록
  quickList: {
    backgroundColor: Colors.white, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.homeBorder,
    paddingHorizontal: 16,
  },
  quickRow: {
    minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  quickRowBorder: { borderTopWidth: 0.5, borderTopColor: Colors.gray100 },
  quickLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.black },

  footerCaption: { fontSize: 12, fontWeight: '500', color: Colors.gray400, textAlign: 'center' },
});

export default HomeScreen;

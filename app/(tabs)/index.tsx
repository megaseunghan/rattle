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
import { HomeAlertsPanel } from '../../lib/components/HomeAlertsPanel';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { useTossSync } from '../../lib/hooks/useTossSync';
import { useProfitLossTrendChart, TrendBar } from '../../lib/hooks/useProfitLossTrendChart';
import { useTabPager, TabName } from '../../lib/contexts/TabPagerContext';
import { ProfitLoss } from '../../types';
import { resolveSelfEmployee } from '../../lib/utils/resolveSelfEmployee';
import { Badge, SectionHeader } from '../../lib/components/ui';
import { ErrorMessage } from '../../lib/components/ErrorMessage';

type QuickAction = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; route?: string; tab?: TabName };

const QUICK_ACTIONS: Record<'admin' | 'member' | 'part_time', QuickAction[]> = {
  admin: [
    { key: 'employees',  label: '직원 관리',   icon: 'people-outline', tab: 'payroll' },
    { key: 'purchases',  label: '매입 관리',   icon: 'cart-outline',   tab: 'purchases' },
    { key: 'stock',      label: '재고/레시피', icon: 'cube-outline',   tab: 'stock' },
    { key: 'expenses',   label: '비용 등록',   icon: 'card-outline',   route: '/expenses' },
    { key: 'profitLoss', label: '손익 정산',   icon: 'document-text-outline', route: '/profit-loss' },
  ],
  member: [
    { key: 'parttime',   label: '파트타이머 관리', icon: 'people-outline', tab: 'payroll' },
    { key: 'purchases',  label: '매입 관리',     icon: 'cart-outline',   tab: 'purchases' },
    { key: 'stock',      label: '재고/레시피',   icon: 'cube-outline',   tab: 'stock' },
    { key: 'expenses',   label: '비용 등록',     icon: 'card-outline',   route: '/expenses' },
    { key: 'profitLoss', label: '손익 정산',     icon: 'document-text-outline', route: '/profit-loss' },
  ],
  part_time: [
    { key: 'workMinutes', label: '근무시간 제출', icon: 'time-outline', route: '/mypage/work-minutes' },
    { key: 'stock',      label: '재고 관리',   icon: 'cube-outline', tab: 'stock' },
  ],
};

function QuickActionsList({ actions, goToTab }: { actions: QuickAction[]; goToTab: (tab: TabName) => void }) {
  return (
    <View style={styles.quickList}>
      {actions.map((a, index) => (
        <TouchableOpacity
          key={a.key}
          style={[styles.quickRow, index > 0 && styles.quickRowBorder]}
          activeOpacity={0.75}
          onPress={() => a.tab ? goToTab(a.tab) : router.push(a.route as any)}
        >
          <Ionicons name={a.icon} size={19} color={Colors.gray600} />
          <Text style={styles.quickLabel} numberOfLines={1}>{a.label}</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.gray400} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function fmt(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toLocaleString()}원`;
}

function pct(value: number | null | undefined, total: number | null | undefined): string | null {
  if (!value || !total) return null;
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

function metricValue(pnl: ProfitLoss | null, key: MetricKey): number | null {
  if (!pnl) return null;
  switch (key) {
    case 'revenue': return pnl.revenue;
    case 'purchase': return pnl.purchaseCost;
    case 'labor': return pnl.laborCost;
    case 'expense': return (pnl.fixedExpense ?? 0) + (pnl.variableExpense ?? 0);
    case 'profit': return pnl.operatingProfit;
  }
}

/** 홈 상단 매장명 탭 시 위에서 아래로 열리는 매장 전환 드롭다운 */
function StoreSwitcherDropdown({
  visible, onClose, stores, currentStoreId, onSelect, onShowDashboard,
}: {
  visible: boolean; onClose: () => void;
  stores: { id: string; name: string }[]; currentStoreId: string | undefined;
  onSelect: (storeId: string) => void;
  /** 사장님 본인 계정일 때만 노출 — 통합 대시보드로 돌아가기 */
  onShowDashboard?: () => void;
}) {
  if (!visible) return null;
  return (
    <>
      <TouchableOpacity style={styles.storeDropdownOverlay} onPress={onClose} activeOpacity={1} />
      <View style={styles.storeDropdownBox}>
        <View style={styles.storeDropdownHeader}>
          <Text style={styles.storeDropdownTitle}>매장 관리</Text>
          <TouchableOpacity
            onPress={() => { onClose(); router.push('/(auth)/select-store'); }}
            hitSlop={8}
          >
            <Ionicons name="add" size={18} color={Colors.primary} />
          </TouchableOpacity>
        </View>
        {onShowDashboard && (
          <TouchableOpacity
            style={styles.storeDropdownItem}
            onPress={() => { onShowDashboard(); onClose(); }}
            activeOpacity={0.7}
          >
            <Ionicons name="grid-outline" size={15} color={Colors.primary} />
            <Text style={[styles.storeDropdownItemText, { marginLeft: 8 }]}>통합 대시보드</Text>
          </TouchableOpacity>
        )}
        {stores.map((s) => {
          const isActive = s.id === currentStoreId;
          return (
            <TouchableOpacity
              key={s.id}
              style={[styles.storeDropdownItem, styles.storeDropdownItemBorder]}
              onPress={() => { onSelect(s.id); onClose(); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.storeDropdownItemText, isActive && styles.storeDropdownItemTextActive]} numberOfLines={1}>
                {s.name}
              </Text>
              {isActive && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

/** 소수점이 딱 .0으로 떨어지면 생략 (예: "100.0%" → "100%") */
function trimTrailingZero(v: string): string {
  return v.replace(/\.0(%?)$/, '$1');
}

/** 화면 01 — 지표 칩 행 + 대표 수치 + 마진/매출비중 뱃지 + 전월 대비 */
function MetricChipsSection({ pnl, loading, bars, selected, onSelect }: {
  pnl: ProfitLoss | null; loading: boolean; bars: TrendBar[];
  selected: MetricKey; onSelect: (key: MetricKey) => void;
}) {
  const value = metricValue(pnl, selected);
  const rev = pnl?.revenue ?? 0;
  const isProfitNegative = selected === 'profit' && (value ?? 0) < 0;

  const shareLabel = selected === 'revenue'
    ? pct(pnl?.operatingProfit, rev)
    : pct(value, rev);
  const shareText = shareLabel
    ? (selected === 'revenue' ? `마진 ${trimTrailingZero(shareLabel)}` : `매출의 ${trimTrailingZero(shareLabel)}`)
    : null;

  // 막대그래프 데이터에서 선택된 달 바로 이전 달을 찾아 전월 대비를 계산
  const anchorIndex = bars.findIndex(b => b.isCurrent);
  const prevValue = anchorIndex > 0 ? metricValue(bars[anchorIndex - 1].data, selected) : null;
  const trendPct = prevValue != null && value != null && prevValue !== 0
    ? ((value - prevValue) / Math.abs(prevValue)) * 100
    : null;
  const trendLabel = fmtTrend(trendPct);
  const trendIsNegative = (trendPct ?? 0) < 0;

  return (
    <View style={styles.metricSection}>
      <View style={styles.chipRow}>
        {METRIC_CHIPS.map(chip => (
          <TouchableOpacity
            key={chip.key}
            style={[styles.metricChip, selected === chip.key && styles.metricChipActive]}
            onPress={() => onSelect(chip.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.metricChipText, selected === chip.key && styles.metricChipTextActive]}>{chip.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.metricValueRow}>
        {loading
          ? <ActivityIndicator size="small" color={Colors.gray300} />
          : <Text style={[styles.metricValue, isProfitNegative && styles.metricValueNegative]}>{fmt(value)}</Text>
        }
      </View>
      <View style={styles.metricMetaRow}>
        {shareText && <Badge label={shareText} variant="neutral" />}
        {trendLabel && (
          <Text style={styles.metricTrendText}>
            전월 대비{' '}
            <Text style={trendIsNegative ? styles.metricTrendNegative : styles.metricTrendPositive}>{trendLabel}</Text>
          </Text>
        )}
      </View>
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
  periodLabel, onPrev, onNext, nextDisabled, bars, loading, metric, onSelectBar,
}: {
  periodLabel: string; onPrev: () => void; onNext: () => void; nextDisabled: boolean;
  bars: TrendBar[]; loading: boolean; metric: MetricKey; onSelectBar: (yearMonth: string) => void;
}) {
  const values = bars.map(b => metricValue(b.data, metric) ?? 0);
  const positive = Math.max(0, ...values);
  const negative = Math.max(0, ...values.map(value => -value));
  const range = Math.max(1, positive + negative);
  const zeroBottom = negative / range * 112;

  return (
    <View style={styles.trendSection}>
      <View style={styles.trendNavRow}>
        <TouchableOpacity onPress={onPrev} style={styles.trendNavBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={18} color={Colors.gray600} />
        </TouchableOpacity>
        <Text style={styles.trendNavLabel}>{periodLabel}</Text>
        <TouchableOpacity onPress={onNext} style={styles.trendNavBtn} hitSlop={8} disabled={nextDisabled}>
          <Ionicons name="chevron-forward" size={18} color={nextDisabled ? Colors.gray300 : Colors.gray600} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={styles.trendLoading} />
      ) : (
        <View style={styles.trendBarRow}>
          {bars.map((bar, i) => {
            const isEmpty = bar.data === null;
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
                accessibilityLabel={`${bar.key} ${METRIC_CHIPS.find(chip => chip.key === metric)?.label} ${isEmpty ? '조회 실패' : fmt(value)}`}
              >
                <Text style={[styles.trendAmount, value < 0 && styles.metricValueNegative]} numberOfLines={1}>
                  {isEmpty ? '—' : compactAmount(value)}
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
  const { store, stores, user, currentRole, realRole, devPreviewMode, switchStore, devPreviewEmployeeId } = useAuth();
  const [storeDropdownVisible, setStoreDropdownVisible] = useState(false);
  const { goToTab, setHomeMode } = useTabPager();
  const isOwnerAdminSelf = realRole === 'admin' && devPreviewMode === 'self';
  const { unreadCount, refetch: refetchNotifications } = useNotifications();
  const { data: ingredients, refetch } = useIngredients();
  const { employees, refetch: refetchEmp } = useEmployees();

  const today = new Date();
  const realYear = today.getFullYear();
  const realMonth = today.getMonth() + 1;

  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('revenue');
  const [anchorYear, setAnchorYear] = useState(realYear);
  const [anchorMonth, setAnchorMonth] = useState(realMonth);

  const yearMonth = `${anchorYear}-${String(anchorMonth).padStart(2, '0')}`;
  const { todaySales, autoSyncOnForeground, loadTodaySales } = useTossSync();
  const { bars, loading: trendLoading, error: trendError, refetch: fetchTrend } = useProfitLossTrendChart(anchorYear, anchorMonth);
  const pnl = bars.find(bar => bar.key === yearMonth)?.data ?? null;

  const isCurrentPeriod = anchorYear === realYear && anchorMonth === realMonth;

  function goPrevPeriod() {
    if (anchorMonth === 1) { setAnchorYear(y => y - 1); setAnchorMonth(12); }
    else setAnchorMonth(m => m - 1);
  }

  function goNextPeriod() {
    if (isCurrentPeriod) return;
    if (anchorMonth === 12) { setAnchorYear(y => y + 1); setAnchorMonth(1); }
    else setAnchorMonth(m => m + 1);
  }

  function selectBarMonth(yearMonthKey: string) {
    const [y, m] = yearMonthKey.split('-').map(Number);
    if (y > realYear || (y === realYear && m > realMonth)) return; // 아직 오지 않은 달은 선택 불가
    setAnchorYear(y);
    setAnchorMonth(m);
  }

  // 로그인 본인에 연결된 직원 → 파트타이머 여부 판별 (관리자 테스트 미리보기 시엔 선택된 직원)
  const myEmployee = resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId);
  const effectiveRole: 'admin' | 'member' | 'part_time' =
    currentRole === 'admin' ? 'admin'
    : myEmployee?.employment_type === 'part_time' ? 'part_time'
    : 'member';
  const isPartTime = effectiveRole === 'part_time';

  const [refreshing, setRefreshing] = useState(false);
  const [alertRefreshKey, setAlertRefreshKey] = useState(0);

  async function loadAll() {
    await Promise.all([
      refetch(),
      refetchEmp(),
      refetchNotifications(),
      ...(isPartTime ? [] : [loadTodaySales(), fetchTrend()]),
    ]);
  }

  async function onRefresh() {
    setRefreshing(true);
    setAlertRefreshKey(value => value + 1);
    try { await loadAll(); } finally { setRefreshing(false); }
  }

  useEffect(() => {
    if (!active) return;
    loadAll();
  }, [active, refetch, refetchEmp, refetchNotifications, loadTodaySales, fetchTrend, isPartTime]);

  useEffect(() => {
    if (!active) return;
    autoSyncOnForeground();
  }, [active, autoSyncOnForeground]);

  const monthLabel = today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.appBar}>
        <View style={styles.appBarSide}>
        <TouchableOpacity onPress={() => goToTab('more')} style={styles.appBarButton} accessibilityLabel="더보기" accessibilityRole="button">
          <Ionicons name="ellipsis-horizontal" size={20} color={Colors.gray600} />
        </TouchableOpacity>
        </View>
        <View style={styles.appBarCenter}>
        <TouchableOpacity style={styles.storeSwitcher} onPress={() => setStoreDropdownVisible(true)} activeOpacity={0.7} accessibilityLabel="매장 전환" accessibilityRole="button">
          <Text style={styles.storeSwitcherText} numberOfLines={1}>{store?.name ?? ''}</Text>
          <Ionicons name={storeDropdownVisible ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.gray500} style={styles.storeChevron} />
        </TouchableOpacity>
        </View>
        <View style={styles.appBarRightGroup}>
          <TouchableOpacity onPress={() => router.push('/notifications')} style={[styles.appBarButton, styles.bellBtn]} accessibilityLabel="알림" accessibilityRole="button">
            <Ionicons name="notifications-outline" size={20} color={Colors.gray600} />
            {unreadCount > 0 && <View style={styles.bellDot} />}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/mypage')} style={styles.appBarButton} accessibilityLabel="마이페이지" accessibilityRole="button">
            <Ionicons name="person-circle-outline" size={22} color={Colors.gray600} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <HomeAlertsPanel active={active} refreshKey={alertRefreshKey} todaySales={todaySales} financial={!isPartTime} />


        {!isPartTime && (
          <MetricChipsSection
            pnl={pnl}
            loading={trendLoading}
            bars={bars}
            selected={selectedMetric}
            onSelect={setSelectedMetric}
          />
        )}

        {!isPartTime && trendError && <ErrorMessage message={trendError} onRetry={fetchTrend} />}

        {!isPartTime && (
          <TrendChartSection
            periodLabel={`${anchorYear}년 ${anchorMonth}월`}
            onPrev={goPrevPeriod}
            onNext={goNextPeriod}
            nextDisabled={isCurrentPeriod}
            bars={bars}
            loading={trendLoading}
            metric={selectedMetric}
            onSelectBar={selectBarMonth}
          />
        )}

        <SectionHeader title="바로가기" insetHorizontalPadding={false} />
        <QuickActionsList actions={QUICK_ACTIONS[effectiveRole]} goToTab={goToTab} />

        <Text style={styles.footerCaption}>{store?.name ?? ''} · {monthLabel}</Text>
      </ScrollView>

      <StoreSwitcherDropdown
        visible={storeDropdownVisible}
        onClose={() => setStoreDropdownVisible(false)}
        stores={stores}
        currentStoreId={store?.id}
        onSelect={switchStore}
        onShowDashboard={isOwnerAdminSelf ? () => setHomeMode('dashboard') : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },

  appBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingTop: 8, paddingBottom: 8,
    backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
  },
  appBarSide: { width: 88 },
  appBarCenter: { flex: 1, minWidth: 0, alignItems: 'center' },
  appBarButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  storeSwitcher: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, minHeight: 44, maxWidth: '100%' },
  storeChevron: { position: 'absolute', right: 0 },
  appBarRightGroup: { width: 88, flexDirection: 'row', alignItems: 'center' },
  storeSwitcherText: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: Colors.black },
  bellBtn: { position: 'relative' },
  bellDot: {
    position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.negative, borderWidth: 1.5, borderColor: Colors.white,
  },

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
    shadowColor: '#000',
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
  storeDropdownItemTextActive: { color: Colors.primary },

  scroll: { padding: 16, gap: 14, paddingBottom: 48 },

  // 경고 배너 (고정비 미입력 / 토스 미동기화 / 월마감)
  alertList: { gap: 8 },
  alertRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.warningBg, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
  },
  alertDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.warning },
  alertText: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.black },
  alertAction: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  // 지표 칩 섹션
  metricSection: { gap: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: Colors.gray200 },
  metricChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  metricChipText: { fontSize: 13, fontWeight: '500', color: Colors.gray600 },
  metricChipTextActive: { color: Colors.white, fontWeight: '600' },
  metricValueRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metricMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  metricTrendText: { fontSize: 13, fontWeight: '500', color: Colors.gray400 },
  metricTrendPositive: { color: Colors.positive, fontWeight: '600' },
  metricTrendNegative: { color: Colors.negative, fontWeight: '600' },
  metricValue: { fontSize: 30, fontWeight: '700', fontFamily: Fonts.spaceGroteskBold, color: Colors.black, letterSpacing: -0.5 },
  metricValueNegative: { color: Colors.negative },

  // 월별 추이 막대그래프
  trendSection: { gap: 12 },
  trendNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  trendNavBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
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

  // 품절 임박 배너
  lowStockBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.gray50, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
  },
  lowStockDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.negative },
  lowStockText: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.black },
  lowStockAction: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  // 바로가기: 아이콘 장식 대신 작업명이 먼저 읽히는 목록
  quickList: {
    backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.gray100,
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

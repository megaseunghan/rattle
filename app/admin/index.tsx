import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md · designed-as-app */
import { NumericText } from '../../lib/components/ui/NumericText';
import { sumKnown } from '../../lib/utils/financialCoverage';
import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTabPager } from '../../lib/contexts/TabPagerContext';
import { useAdminDashboard } from '../../lib/hooks/useAdminDashboard';
import { WeeklyCleaningDay, WeeklyScheduleDay } from '../../lib/services/adminDashboard';
import { Badge } from '../../lib/components/ui';
import { HomeAlertsPanel } from '../../lib/components/HomeAlertsPanel';
import { getErrorMessage } from '../../lib/utils/error';

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 0=일 ~ 6=토 (DB 값) → 월~일 표시 순서

function fmt(v: number | null): string {
  if (v == null) return '확인 필요';
  return `${Math.round(v).toLocaleString()}원`;
}

function compactAmount(value: number | null): string {
  if (value == null) return '확인 필요';
  const abs = Math.abs(value);
  const prefix = value < 0 ? '-' : '';
  if (abs >= 100000000) return `${prefix}${(abs / 100000000).toFixed(1)}억`;
  if (abs >= 10000) return `${prefix}${(abs / 10000).toFixed(1)}만`;
  return `${prefix}${Math.round(abs).toLocaleString()}`;
}

function trendPct(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function TrendBadge({ pct, compareLabel }: { pct: number | null; compareLabel: string }) {
  if (pct == null) return null;
  const isUp = pct >= 0;
  const label = `${compareLabel} 대비 ${isUp ? '+' : ''}${pct.toFixed(1)}%`;
  return <Badge label={label} variant={isUp ? 'positive' : 'negative'} />;
}

/** 최근 6개월/연도 합산 영업이익 미니 바 차트 — 마지막(현재) 막대만 강조 */
function TrendBarChart({ data, onSelect }: { data: { label: string; value: number | null }[]; onSelect?: (index: number) => void }) {
  if (data.length === 0) return null;
  const maxAbs = Math.max(1, ...data.map(d => Math.abs(d.value ?? 0)));
  return (
    <View style={styles.trendChart}>
      {data.map((d, i) => {
        const isLast = i === data.length - 1;
        const barHeight = Math.round((Math.abs(d.value ?? 0) / maxAbs) * 52);
        return (
          <TouchableOpacity key={`${d.label}-${i}`} disabled={!onSelect} onPress={() => onSelect?.(i)} style={styles.trendBarCol} accessibilityLabel={`${d.label} 영업이익 ${fmt(d.value)}`}>
            <Text style={[styles.trendAmount, (d.value ?? 0) < 0 && styles.negativeText]} numberOfLines={1} adjustsFontSizeToFit>{compactAmount(d.value)}</Text>
            <View style={styles.trendBarTrack}>
              <View style={styles.trendZeroLine} />
              {d.value != null && <View style={[styles.trendBarFill, { height: barHeight, ...((d.value ?? 0) < 0 ? { top: 56 } : { bottom: 56 }) }, (d.value ?? 0) < 0 ? styles.trendBarFillNegative : isLast ? styles.trendBarFillActive : styles.trendBarFillInactive]} />}
            </View>
            <Text style={[styles.trendBarLabel, isLast && styles.trendBarLabelActive]}>{d.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function CleaningWeekCard({ weekly, error }: { weekly: { days: WeeklyCleaningDay[]; pct: number } | undefined; error?: boolean }) {
  const days = weekly?.days ?? [];
  const byWeekday = new Map(days.map(d => [d.weekday, d]));
  return (
    <View style={styles.opsCard}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>이번 주 청소 진행률</Text>
        <TouchableOpacity onPress={() => router.push('/cleaning')} hitSlop={8}>
          <Text style={styles.linkText}>기록 ›</Text>
        </TouchableOpacity>
      </View>
      {!weekly ? <Text style={styles.domainError}>{error ? '청소 기록을 불러오지 못했어요' : '청소 기록을 불러오는 중이에요'}</Text> : <>
      <Text style={styles.weeklyPct}>{weekly.pct}%</Text>
      <View style={styles.weeklyPctTrack}>
        <View style={[styles.weeklyPctFill, { width: `${weekly.pct}%` }]} />
      </View>
      </>}
      {weekly && <View style={styles.weekdayRow}>
        {WEEK_ORDER.map((weekday, i) => {
          const d = byWeekday.get(weekday);
          const hasTasks = (d?.total ?? 0) > 0;
          const isBehind = hasTasks && (d!.checked < d!.total);
          return (
            <View key={weekday} style={styles.weekdayCol}>
              <Text style={styles.weekdayLabel}>{WEEKDAY_LABELS[i]}</Text>
              <View style={[
                styles.weekdayBox,
                hasTasks ? (isBehind ? styles.weekdayBoxBehind : styles.weekdayBoxDone) : styles.weekdayBoxEmpty,
              ]}>
                {hasTasks && (
                  <Text style={[styles.weekdayBoxText, isBehind && styles.weekdayBoxTextBehind]}>{d!.checked}/{d!.total}</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>}
    </View>
  );
}

/** 겹치는 인원 수에 비례해 진해지는 프라이머리 컬러 (0명 = 투명, 1명 이상부터 단계적으로 진해짐) */
function overlapColor(overlap: number): string {
  if (overlap <= 0) return 'transparent';
  const opacity = Math.min(1, 0.3 + (overlap - 1) * 0.25);
  return `${Colors.primary}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
}

function ScheduleWeekCard({ days, error }: { days: WeeklyScheduleDay[] | undefined; error?: boolean }) {
  const byWeekday = new Map((days ?? []).map(d => [d.weekday, d]));
  return (
    <View style={styles.opsCard}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>요일별 스케줄</Text>
        <TouchableOpacity onPress={() => router.push('/mypage/schedule')} hitSlop={8}>
          <Text style={styles.linkText}>배정 ›</Text>
        </TouchableOpacity>
      </View>
      {!days ? <Text style={styles.domainError}>{error ? '스케줄을 불러오지 못했어요' : '스케줄을 불러오는 중이에요'}</Text> : WEEK_ORDER.map((weekday, i) => {
        const d = byWeekday.get(weekday);
        const isOff = !d || d.headcount === 0;
        return (
          <View key={weekday} style={styles.scheduleDayBlock}>
            <View style={styles.scheduleRow}>
              <Text style={[styles.scheduleDayLabel, weekday === 0 && styles.negativeText, weekday === 6 && styles.primaryText]}>
                {WEEKDAY_LABELS[i]}
              </Text>
              <View style={styles.scheduleBarTrack}>
                {!isOff && d!.segments.map(seg => (
                  <View
                    key={seg.startMin}
                    style={[styles.scheduleBarSeg, { flex: seg.endMin - seg.startMin, backgroundColor: overlapColor(seg.overlap) }]}
                  />
                ))}
              </View>
              <Text style={styles.scheduleMeta}>{isOff ? '휴무' : `${d!.headcount}명 ${d!.totalHours}h`}</Text>
            </View>
            {!isOff && (
              <Text style={styles.scheduleShiftList} numberOfLines={2}>
                {d!.shifts.map(s => `${s.employeeName} ${s.start}-${s.end}`).join('  ·  ')}
              </Text>
            )}
          </View>
        );
      })}
      {days && <Text style={styles.scheduleCaption}>겹치는 시간일수록 색이 진해져요</Text>}
    </View>
  );
}

/** 화면 00 — 통합 대시보드 (사장님 홈 탭 기본 화면) */
export function AdminDashboardScreen() {
  const { realRole, switchStore } = useAuth();
  const { goToTab, openStorePicker, selectStoreScope, selectedMonth, setSelectedMonth } = useTabPager();
  const {
    ownedStores, period, setPeriod, anchorYear, anchorMonth, isCurrentMonth,
    pnl, trend, weeklyCleaning, weeklySchedule, errors, financialError, loading, refetch, goPrev, goNext,
  } = useAdminDashboard(selectedMonth, setSelectedMonth);
  const [alertRefreshKey, setAlertRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  async function onRefresh() {
    setRefreshing(true);
    setAlertRefreshKey(value => value + 1);
    try { await refetch(); } finally { setRefreshing(false); }
  }
  const [trendExpanded, setTrendExpanded] = useState(false);
  const [operationsExpanded, setOperationsExpanded] = useState(false);

  if (realRole !== 'admin') return <SafeAreaView style={styles.container}><GlassBackdrop /><View style={styles.empty}><Text style={styles.emptyText}>접근 권한이 없어요</Text></View></SafeAreaView>;

  const sumRevenue = pnl?.current.reduce((sum, row) => sum + row.revenue, 0) ?? null;
  const sumProfit = pnl ? sumKnown(pnl.current.map(row => row.profit)) : null;
  const sumPurchases = pnl?.current.reduce((sum, row) => sum + row.purchaseCost, 0) ?? null;
  const sumLabor = pnl ? sumKnown(pnl.current.map(row => row.laborCost)) : null;
  const sumOther = pnl?.current.reduce((sum, row) => sum + row.otherExpense, 0) ?? null;
  const previousProfit = pnl ? sumKnown(pnl.previous.map(row => row.profit)) : null;
  const missingStores = pnl?.current.filter(row => row.laborCost == null) ?? [];
  const periodLabel = period === 'month' ? `${anchorYear}년 ${anchorMonth}월` : `${anchorYear}년`;
  const yearMonth = `${anchorYear}-${String(anchorMonth).padStart(2, '0')}`;

  async function goToDetail(storeId: string) {
    try {
      await switchStore(storeId);
      router.push({ pathname: '/profit-loss', params: { yearMonth, period } });
    } catch (error) { Alert.alert('매장 전환', getErrorMessage(error, '매장을 바꾸지 못했어요. 다시 시도해 주세요.')); }
  }
  function showMonth(index: number) {
    if (period !== 'month' || !trend) return;
    const date = new Date(anchorYear, anchorMonth - trend.length + index, 1);
    setSelectedMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }
  const metrics = [{ label: '매출', value: sumRevenue }, { label: '매입', value: sumPurchases }, { label: '인건비', value: sumLabor }, { label: '비용', value: sumOther }];
  return <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}><GlassBackdrop />
    <View style={styles.header}>
      <TouchableOpacity style={styles.headerSideButton} onPress={() => goToTab('more')} accessibilityLabel="더보기" accessibilityRole="button"><Ionicons name="ellipsis-horizontal" size={22} color={Colors.black} /></TouchableOpacity>
      <TouchableOpacity style={styles.headerCenter} onPress={() => openStorePicker()} accessibilityLabel="전체 매장, 매장 선택" accessibilityRole="button"><View style={styles.headerStoreRow}><Text style={styles.headerStoreText}>전체 매장 {ownedStores.length}곳</Text><Ionicons name="chevron-down" size={14} color={Colors.gray500} /></View></TouchableOpacity>
      <TouchableOpacity style={styles.headerSideButton} onPress={() => router.push('/mypage')} accessibilityLabel="내 정보" accessibilityRole="button"><Ionicons name="person-circle-outline" size={24} color={Colors.gray600} /></TouchableOpacity>
    </View>
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
      <View style={styles.periodControls}>
        <View style={styles.periodTabs}>
          {(['month', 'year'] as const).map(value => <TouchableOpacity key={value} style={[styles.periodTab, period === value && styles.periodTabActive]} onPress={() => setPeriod(value)} accessibilityRole="button" accessibilityState={{ selected: period === value }}><Text style={[styles.periodTabText, period === value && styles.periodTabTextActive]}>{value === 'month' ? '월별' : '연도별'}</Text></TouchableOpacity>)}
        </View>
        <View style={styles.navRow}><TouchableOpacity onPress={goPrev} style={styles.navButton} accessibilityRole="button" accessibilityLabel="이전 기간"><Ionicons name="chevron-back" size={18} color={Colors.gray600} /></TouchableOpacity><Text style={styles.navLabel}>{periodLabel}</Text><TouchableOpacity onPress={goNext} style={styles.navButton} accessibilityRole="button" accessibilityLabel="다음 기간" disabled={period === 'month' ? isCurrentMonth : anchorYear >= new Date().getFullYear()}><Ionicons name="chevron-forward" size={18} color={(period === 'month' ? isCurrentMonth : anchorYear >= new Date().getFullYear()) ? Colors.gray300 : Colors.gray600} /></TouchableOpacity></View>
      </View>
      <View style={styles.summaryCard}>
        <View style={styles.summaryTop}><Text style={styles.summaryTitle}>{periodLabel} · 영업이익</Text><TrendBadge pct={pnl ? trendPct(sumProfit, previousProfit) : null} compareLabel={period === 'month' ? '전월' : '전년'} /></View>
        <NumericText style={[styles.summaryValue, sumProfit == null && { color: Colors.gray600 }, sumProfit != null && sumProfit < 0 && styles.negativeText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{pnl ? fmt(sumProfit) : errors.pnl ? '조회 실패' : '불러오는 중'}</NumericText>
        {pnl && sumProfit == null && <Text style={styles.summaryReason}>급여 조건을 확인하면 인건비와 이익을 계산할 수 있어요.</Text>}
        {errors.pnl && <><Text style={styles.domainError}>{financialError ?? '손익을 불러오지 못했어요.'}</Text><TouchableOpacity onPress={() => void refetch()} style={styles.retryButton}><Text style={styles.linkText}>다시 불러오기</Text></TouchableOpacity></>}
        {loading && pnl && <Text style={styles.summaryCaption}>표시한 {periodLabel} 자료를 갱신 중이에요</Text>}
      </View>
      {missingStores.length > 0 && <View style={styles.taskCard}><Text style={styles.sectionTitle}>확인할 일</Text>{missingStores.map(row => <TouchableOpacity key={row.storeId} style={styles.taskRow} accessibilityRole="button" onPress={() => { if (period === 'year') { Alert.alert('확인할 기간', '월별로 바꾼 뒤 확인할 월을 선택해 주세요.'); setPeriod('month'); } else void selectStoreScope(row.storeId, 'payroll').catch(() => Alert.alert('매장 전환', '매장을 바꾸지 못했어요. 다시 시도해 주세요.')); }}><View style={styles.rowBody}><Text style={styles.taskStore}>{row.storeName} · {periodLabel}</Text><Text style={styles.taskTitle}>직원 정보 확인 필요</Text><Text style={styles.taskHint}>확인할 직원 보기</Text></View><Ionicons name="chevron-forward" size={20} color={Colors.deeper} /></TouchableOpacity>)}</View>}
      <View style={styles.metricGrid}>{metrics.map(metric => <View key={metric.label} style={[styles.metricCard, metric.label === '인건비' && pnl && metric.value == null && styles.metricPending]}><Text style={styles.summaryColLabel}>{metric.label}</Text><NumericText style={styles.metricAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{pnl ? fmt(metric.value) : errors.pnl ? '조회 실패' : '불러오는 중'}</NumericText></View>)}</View>
      <View style={styles.storeList}><Text style={styles.sectionTitle}>매장별 현황</Text>{ownedStores.length === 0 && <Text style={styles.domainError}>조회할 매장이 없어요</Text>}{ownedStores.map(store => { const row = pnl?.current.find(value => value.storeId === store.id); return <TouchableOpacity key={store.id} style={styles.storeRow} onPress={() => void goToDetail(store.id)} accessibilityRole="button" accessibilityLabel={`${store.name}, ${periodLabel} 손익 상세`}><View style={styles.rowBody}><Text style={styles.storeName}>{store.name}</Text><Text style={styles.storeMeta}>{periodLabel} · {row?.laborCost == null && row ? '직원 정보 확인 필요' : '영업이익'}</Text><NumericText style={[styles.storeAmount, row?.profit != null && row.profit < 0 && styles.negativeText]}>{row ? fmt(row.profit) : errors.pnl ? '조회 실패' : '불러오는 중'}</NumericText></View><Ionicons name="chevron-forward" size={20} color={Colors.gray500} /></TouchableOpacity>; })}</View>
      <View style={styles.opsCard}><TouchableOpacity style={styles.expandRow} onPress={() => setTrendExpanded(value => !value)} accessibilityRole="button" accessibilityState={{ expanded: trendExpanded }}><Text style={styles.sectionTitle}>영업이익 추세</Text><Text style={styles.linkText}>{trendExpanded ? '접기' : '펼쳐보기'}</Text></TouchableOpacity>{trendExpanded && <>{trend ? <TrendBarChart data={trend} onSelect={period === 'month' ? showMonth : undefined} /> : <Text style={styles.domainError}>{errors.trend ? '추세를 불러오지 못했어요' : '추세를 불러오는 중이에요'}</Text>}{period === 'month' && <Text style={styles.summaryCaption}>월을 누르면 해당 월의 현황과 확인할 일을 볼 수 있어요.</Text>}</>}</View>
      <View style={styles.opsCard}><TouchableOpacity style={styles.expandRow} onPress={() => setOperationsExpanded(value => !value)} accessibilityRole="button" accessibilityState={{ expanded: operationsExpanded }}><Text style={styles.sectionTitle}>매장 운영 현황</Text><Text style={styles.linkText}>{operationsExpanded ? '접기' : '펼쳐보기'}</Text></TouchableOpacity>{operationsExpanded && ownedStores.map(store => <View key={store.id} style={styles.operationsGroup}><Text style={styles.storeName}>{store.name} · 이번 주</Text><HomeAlertsPanel store={store} financial={false} refreshKey={alertRefreshKey} /><CleaningWeekCard weekly={weeklyCleaning[store.id]} error={errors.cleaning[store.id]} /><ScheduleWeekCard days={weeklySchedule[store.id]} error={errors.schedule[store.id]} /></View>)}</View>
    </ScrollView>
  </SafeAreaView>;
}

export default AdminDashboardScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas },
  periodControls: { gap: 2 },
  summaryReason: { fontSize: 13, color: Colors.gray600, lineHeight: 20 },
  taskCard: { padding: 16, borderRadius: 19, backgroundColor: Colors.taskBg, borderWidth: 1, borderColor: Colors.taskBorder, gap: 8 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingVertical: 8 },
  rowBody: { flex: 1, minWidth: 0, gap: 4 }, taskStore: { fontSize: 12, color: Colors.gray600 }, taskTitle: { fontSize: 16, color: Colors.black, fontWeight: '700' }, taskHint: { fontSize: 13, color: Colors.deeper },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, metricCard: { width: '48%', flexGrow: 1, padding: 15, gap: 8, borderRadius: 19, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.homeBorder }, metricPending: { backgroundColor: Colors.taskBg, borderColor: Colors.taskBorder }, metricAmount: { fontSize: 19, fontWeight: '700', color: Colors.black },
  storeList: { gap: 10 }, storeRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, minHeight: 88, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.homeBorder, borderRadius: 19 }, storeName: { fontSize: 16, fontWeight: '700', color: Colors.black }, storeMeta: { color: Colors.gray600, fontSize: 12 }, storeAmount: { fontSize: 19, color: Colors.black, fontWeight: '700' }, expandRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, operationsGroup: { gap: 12 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4,
    backgroundColor: 'transparent',
  },
  headerSideButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, minHeight: 44, alignItems: 'center', gap: 2 },
  headerPeriod: { fontSize: 12, fontWeight: '500', color: Colors.gray400 },
  headerStoreRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 },
  headerStoreText: { fontSize: 16, fontWeight: '700', color: Colors.black, textAlign: 'center' },

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

  scroll: { padding: 20, paddingTop: 4, paddingBottom: 90, gap: 14 },

  periodTabs: { flexDirection: 'row', backgroundColor: Colors.gray100, borderRadius: 12, padding: 3 },
  periodTab: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingVertical: 9, borderRadius: 9 },
  periodTabActive: { backgroundColor: Colors.white },
  periodTabText: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  periodTabTextActive: { color: Colors.action },

  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600, minWidth: 80, textAlign: 'center' },

  summaryCard: { backgroundColor: Colors.white, borderRadius: 24, borderWidth: 1, borderColor: Colors.homeBorder, padding: 18, gap: 8 },
  summaryTop: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' },
  summaryTitle: { fontSize: 13, fontWeight: '600', color: Colors.gray600 },
  summaryValue: { fontSize: 34, fontFamily: Fonts.spaceGroteskBold, fontWeight: '700', color: Colors.positive, letterSpacing: -1 },
  summaryDivider: { height: 0.5, backgroundColor: Colors.gray200, marginVertical: 10 },
  summaryCols: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  summaryCol: { gap: 5, flexGrow: 1, minWidth: 90 },
  summaryColLabel: { fontSize: 13, fontWeight: '500', color: Colors.gray600 },
  summaryColValue: { fontSize: 15, fontWeight: '700', color: Colors.black },
  marginValue: { color: Colors.action },
  summaryColTrend: { fontSize: 10, fontWeight: '500' },
  summaryCaption: { fontSize: 11, fontWeight: '400', color: Colors.gray400, marginTop: 10 },

  trendChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 14 },
  trendBarCol: { flex: 1, alignItems: 'center', gap: 5 },
  trendAmount: { fontSize: 10, fontWeight: '600', color: Colors.gray600, textAlign: 'center', width: '100%' },
  trendBarTrack: { width: '100%', height: 112, position: 'relative' },
  trendZeroLine: { position: 'absolute', top: 56, left: 0, right: 0, height: 1, backgroundColor: Colors.gray300 },
  trendBarFill: { position: 'absolute', width: '100%', borderRadius: 4 },
  trendBarFillActive: { backgroundColor: Colors.positive },
  trendBarFillInactive: { backgroundColor: Colors.gray500 },
  trendBarFillNegative: { backgroundColor: Colors.negative },
  trendBarLabel: { fontSize: 10, fontWeight: '600', color: Colors.gray400 },
  trendBarLabelActive: { color: Colors.action, fontWeight: '700' },

  sectionTitle: { fontSize: 17, fontWeight: '700', color: Colors.black },
  sectionHeaderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' },
  linkText: { fontSize: 12, fontWeight: '600', color: Colors.action },
  retryButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },

  opsCard: { backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder, padding: 16, gap: 10 },
  domainError: { fontSize: 12, color: Colors.gray500, paddingVertical: 12 },

  positiveText: { color: Colors.positive },
  negativeText: { color: Colors.negative },
  primaryText: { color: Colors.action },

  carouselNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  carouselNavCenter: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  carouselStoreName: { fontSize: 17, fontWeight: '700', color: Colors.black, textAlign: 'center' },
  carouselIndexText: { fontSize: 11, fontWeight: '500', color: Colors.gray400 },
  carouselPage: { gap: 14 },
  carousel: { flexGrow: 0, flexShrink: 0 },
  carouselContent: { alignItems: 'flex-start' },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.gray200 },
  dotActive: { backgroundColor: Colors.primary, width: 16 },

  pnlNetLabel: { fontSize: 12, fontWeight: '600', color: Colors.gray400 },
  pnlNetValue: { fontSize: 28, fontFamily: Fonts.spaceGroteskBold, fontWeight: '700' },
  pnlDivider: { height: 0.5, backgroundColor: Colors.gray100, marginVertical: 4 },
  pnlRow: { flexDirection: 'row', justifyContent: 'space-between' },
  pnlRowLabel: { fontSize: 13, fontWeight: '500', color: Colors.gray500 },
  pnlRowValue: { fontSize: 13, fontWeight: '700', color: Colors.black },

  weeklyPct: { fontSize: 26, fontWeight: '700', color: Colors.black },
  weeklyPctTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.gray100, overflow: 'hidden' },
  weeklyPctFill: { height: '100%', borderRadius: 3, backgroundColor: Colors.primary },
  weekdayRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  weekdayCol: { flex: 1, alignItems: 'center', gap: 4 },
  weekdayLabel: { fontSize: 11, fontWeight: '600', color: Colors.gray400 },
  weekdayBox: { width: '100%', height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  weekdayBoxDone: { backgroundColor: Colors.tinted },
  weekdayBoxBehind: { backgroundColor: Colors.negativeBg },
  weekdayBoxEmpty: { backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.gray100, borderStyle: 'dashed' },
  weekdayBoxText: { fontSize: 11, fontWeight: '700', color: Colors.action },
  weekdayBoxTextBehind: { color: Colors.negative },

  scheduleDayBlock: { gap: 3 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scheduleDayLabel: { width: 16, fontSize: 12, fontWeight: '700', color: Colors.black },
  scheduleBarTrack: { flex: 1, flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: Colors.gray100 },
  scheduleBarSeg: { height: '100%' },
  scheduleMeta: { width: 62, fontSize: 11, fontWeight: '600', color: Colors.gray500, textAlign: 'right' },
  scheduleShiftList: { fontSize: 11, fontWeight: '500', color: Colors.gray400, marginLeft: 26 },
  scheduleCaption: { fontSize: 11, fontWeight: '400', color: Colors.gray400, marginTop: 4 },

  footerCaption: { fontSize: 11, fontWeight: '400', color: Colors.gray400, textAlign: 'center', lineHeight: 16 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, color: Colors.gray400 },
});

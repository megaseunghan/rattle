import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, NativeSyntheticEvent, NativeScrollEvent, LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTabPager } from '../../lib/contexts/TabPagerContext';
import { useAdminDashboard } from '../../lib/hooks/useAdminDashboard';
import { StorePnl, WeeklyCleaningDay, WeeklyScheduleDay } from '../../lib/services/adminDashboard';
import { Badge } from '../../lib/components/ui';

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 0=일 ~ 6=토 (DB 값) → 월~일 표시 순서

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

/** 최근 6개월/연도 합산 영업이익 미니 바 차트 — 마지막(현재) 막대만 강조 */
function TrendBarChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length === 0) return null;
  const maxAbs = Math.max(1, ...data.map(d => Math.abs(d.value)));
  return (
    <View style={styles.trendChart}>
      {data.map((d, i) => {
        const isLast = i === data.length - 1;
        const heightPct = Math.max(8, (Math.abs(d.value) / maxAbs) * 100);
        return (
          <View key={d.label} style={styles.trendBarCol}>
            <View style={styles.trendBarTrack}>
              <View style={[styles.trendBarFill, { height: `${heightPct}%` }, isLast ? styles.trendBarFillActive : styles.trendBarFillInactive]} />
            </View>
            <Text style={[styles.trendBarLabel, isLast && styles.trendBarLabelActive]}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** 헤더 중앙 드롭다운 — 매장을 고르면 캐러셀이 그 매장 페이지로 이동한다 (화면 이동 없음) */
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
        <Text style={styles.dropdownHint}>매장을 선택하면 그 매장의 일반 홈 화면으로 전환돼요</Text>
        {storeNames.map(s => (
          <TouchableOpacity
            key={s.id}
            style={[styles.dropdownItem, styles.dropdownItemBorder]}
            onPress={() => { onSelectStore(s.id); onClose(); }}
            activeOpacity={0.7}
          >
            <Text style={styles.dropdownItemText}>{s.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}

function CleaningWeekCard({ weekly }: { weekly: { days: WeeklyCleaningDay[]; pct: number } | undefined }) {
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
      <Text style={styles.weeklyPct}>{weekly?.pct ?? 0}%</Text>
      <View style={styles.weeklyPctTrack}>
        <View style={[styles.weeklyPctFill, { width: `${weekly?.pct ?? 0}%` }]} />
      </View>
      <View style={styles.weekdayRow}>
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
      </View>
    </View>
  );
}

/** 겹치는 인원 수에 비례해 진해지는 프라이머리 컬러 (0명 = 투명, 1명 이상부터 단계적으로 진해짐) */
function overlapColor(overlap: number): string {
  if (overlap <= 0) return 'transparent';
  const opacity = Math.min(1, 0.3 + (overlap - 1) * 0.25);
  return `${Colors.primary}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
}

function ScheduleWeekCard({ days }: { days: WeeklyScheduleDay[] | undefined }) {
  const byWeekday = new Map((days ?? []).map(d => [d.weekday, d]));
  return (
    <View style={styles.opsCard}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>요일별 스케줄</Text>
        <TouchableOpacity onPress={() => router.push('/mypage/schedule')} hitSlop={8}>
          <Text style={styles.linkText}>배정 ›</Text>
        </TouchableOpacity>
      </View>
      {WEEK_ORDER.map((weekday, i) => {
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
      <Text style={styles.scheduleCaption}>겹치는 시간일수록 색이 진해져요</Text>
    </View>
  );
}

function StorePnlMiniCard({ pnl, periodLabel, onDetail }: { pnl: StorePnl; periodLabel: string; onDetail: () => void }) {
  const isPositive = pnl.profit >= 0;
  return (
    <View style={styles.opsCard}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{periodLabel} 손익</Text>
        <TouchableOpacity onPress={onDetail} hitSlop={8}>
          <Text style={styles.linkText}>상세 ›</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.pnlNetLabel}>순수익</Text>
      <Text style={[styles.pnlNetValue, isPositive ? styles.positiveText : styles.negativeText]}>
        {isPositive ? '' : '-'}{fmt(Math.abs(pnl.profit))}
      </Text>
      <View style={styles.pnlDivider} />
      <View style={styles.pnlRow}><Text style={styles.pnlRowLabel}>매출</Text><Text style={styles.pnlRowValue}>{fmt(pnl.revenue)}</Text></View>
      <View style={styles.pnlRow}><Text style={styles.pnlRowLabel}>매입</Text><Text style={styles.pnlRowValue}>{fmt(pnl.purchaseCost)}</Text></View>
      <View style={styles.pnlRow}><Text style={styles.pnlRowLabel}>비용</Text><Text style={styles.pnlRowValue}>{fmt(pnl.otherExpense)}</Text></View>
      <View style={styles.pnlRow}><Text style={styles.pnlRowLabel}>인건비</Text><Text style={styles.pnlRowValue}>{fmt(pnl.laborCost)}</Text></View>
    </View>
  );
}

/** 화면 00 — 통합 대시보드 (사장님 홈 탭 기본 화면) */
export function AdminDashboardScreen() {
  const { realRole, switchStore } = useAuth();
  const { goToTab, setHomeMode } = useTabPager();
  const {
    ownedStores, period, setPeriod, anchorYear, anchorMonth, isCurrentMonth,
    pnl, trend, ops, weeklyCleaning, weeklySchedule, loading, refetch, goPrev, goNext,
  } = useAdminDashboard();
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const carouselRef = useRef<ScrollView>(null);
  const [pageWidth, setPageWidth] = useState(0);

  function onCarouselLayout(e: LayoutChangeEvent) {
    setPageWidth(e.nativeEvent.layout.width);
  }

  useEffect(() => { refetch(); }, [refetch]);

  if (realRole !== 'admin') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.empty}><Text style={styles.emptyText}>접근 권한이 없어요</Text></View>
      </SafeAreaView>
    );
  }

  const headerStoreLabel = `전체 매장 ${ownedStores.length}곳`;
  const activeStore = ownedStores[carouselIndex];
  const activePnl = activeStore ? pnl.current.find(p => p.storeId === activeStore.id) : undefined;

  // 최상단 고정 요약 — 항상 전체 매장 합산
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
  const carouselPeriodLabel = period === 'month' ? `${anchorMonth}월` : `${anchorYear}년`;

  // 전매장 근태 현황 — 항상 소유한 모든 매장 기준
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

  function scrollToStore(id: string) {
    const idx = ownedStores.findIndex(s => s.id === id);
    if (idx < 0 || pageWidth === 0) return;
    setCarouselIndex(idx);
    carouselRef.current?.scrollTo({ x: idx * pageWidth, animated: true });
  }

  function onCarouselScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (pageWidth === 0) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
    setCarouselIndex(idx);
  }

  async function goToDetail(storeId: string) {
    await switchStore(storeId);
    router.push('/profit-loss');
  }

  /** 헤더 드롭다운에서 매장을 고르면 그 매장의 일반 홈 화면으로 전환한다 (대시보드는 사장님 전체 요약 전용) */
  async function switchToStoreHome(storeId: string) {
    await switchStore(storeId);
    setHomeMode('store');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goToTab('more')} hitSlop={8}>
          <Ionicons name="ellipsis-horizontal" size={22} color={Colors.black} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerCenter} onPress={() => setDropdownVisible(v => !v)} activeOpacity={0.7}>
          <Text style={styles.headerPeriod}>{periodLabel}</Text>
          <View style={styles.headerStoreRow}>
            <Text style={styles.headerStoreText}>{headerStoreLabel}</Text>
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
        onSelectStore={switchToStoreHome}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 최상단 고정 요약 — 통합 매출/지출/마진 + 최근 6개월(연도) 트렌드, 매장 선택과 무관하게 항상 노출 */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <Text style={styles.summaryTitle}>{ownedStores.length}개 매장 합산 영업이익</Text>
            <TrendBadge pct={profitTrend} />
          </View>
          <Text style={[styles.summaryValue, sumProfit < 0 && styles.negativeText]}>
            {sumProfit >= 0 ? '' : '-'}{fmt(Math.abs(sumProfit))}
          </Text>

          <TrendBarChart data={trend} />

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
            {period === 'month' ? '전년 동월 대비는 상세에서 확인해요 · 연도별 탭에서는 최근 6년으로 표시돼요' : '전년 동기 대비로 계산돼요'}
          </Text>
        </View>

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
            <Text style={styles.sectionTitle}>전매장 근태 현황</Text>
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
                <TouchableOpacity onPress={() => router.push('/attendance')} hitSlop={8}>
                  <Text style={styles.alertAction}>확인 ›</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 매장별 캐러셀 — 손익/청소/스케줄을 매장 하나씩 좌우로 스와이프해 확인 */}
            <View style={styles.carouselNav}>
              <TouchableOpacity
                onPress={() => scrollToStore(ownedStores[(carouselIndex - 1 + ownedStores.length) % ownedStores.length].id)}
                hitSlop={8}
                disabled={ownedStores.length <= 1}
              >
                <Ionicons name="chevron-back" size={18} color={ownedStores.length <= 1 ? Colors.gray300 : Colors.gray500} />
              </TouchableOpacity>
              <View style={styles.carouselNavCenter}>
                <Text style={styles.carouselStoreName}>{activeStore?.name ?? ''}</Text>
                <Text style={styles.carouselIndexText}>{carouselIndex + 1} / {ownedStores.length}</Text>
              </View>
              <TouchableOpacity
                onPress={() => scrollToStore(ownedStores[(carouselIndex + 1) % ownedStores.length].id)}
                hitSlop={8}
                disabled={ownedStores.length <= 1}
              >
                <Ionicons name="chevron-forward" size={18} color={ownedStores.length <= 1 ? Colors.gray300 : Colors.gray500} />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={carouselRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onCarouselScrollEnd}
              onLayout={onCarouselLayout}
            >
              {ownedStores.map(s => {
                const p = pnl.current.find(row => row.storeId === s.id);
                return (
                  <View key={s.id} style={[styles.carouselPage, { width: pageWidth || undefined }]}>
                    {p && <StorePnlMiniCard pnl={p} periodLabel={carouselPeriodLabel} onDetail={() => goToDetail(s.id)} />}
                    <CleaningWeekCard weekly={weeklyCleaning[s.id]} />
                    <ScheduleWeekCard days={weeklySchedule[s.id]} />
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.dotsRow}>
              {ownedStores.map((s, i) => (
                <View key={s.id} style={[styles.dot, i === carouselIndex && styles.dotActive]} />
              ))}
            </View>
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

  trendChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 90, marginVertical: 14 },
  trendBarCol: { flex: 1, alignItems: 'center', gap: 6 },
  trendBarTrack: { width: '100%', flex: 1, justifyContent: 'flex-end' },
  trendBarFill: { width: '100%', borderRadius: 6, minHeight: 6 },
  trendBarFillActive: { backgroundColor: Colors.primary },
  trendBarFillInactive: { backgroundColor: Colors.white, opacity: 0.7 },
  trendBarLabel: { fontSize: 10, fontWeight: '600', color: Colors.gray400 },
  trendBarLabelActive: { color: Colors.primary, fontWeight: '700' },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.gray600 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  linkText: { fontSize: 12, fontWeight: '600', color: Colors.primary },

  opsCard: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.gray100, padding: 14, gap: 10 },

  positiveText: { color: Colors.positive },
  negativeText: { color: Colors.negative },
  primaryText: { color: Colors.primary },

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
  alertAction: { fontSize: 12, fontWeight: '700', color: Colors.negative },

  carouselNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  carouselNavCenter: { alignItems: 'center', gap: 2 },
  carouselStoreName: { fontSize: 16, fontWeight: '700', color: Colors.black },
  carouselIndexText: { fontSize: 11, fontWeight: '500', color: Colors.gray400 },
  carouselPage: { gap: 14 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.gray200 },
  dotActive: { backgroundColor: Colors.primary, width: 16 },

  pnlNetLabel: { fontSize: 12, fontWeight: '600', color: Colors.gray400 },
  pnlNetValue: { fontSize: 24, fontWeight: '700' },
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
  weekdayBoxText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
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

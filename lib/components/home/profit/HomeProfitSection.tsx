/**
 * S04 홈 손익 칸(2026-11-27 확정 시안). '손익' 한 칸에 항목 탭(영업이익·매출·매입·인건비·비용)과 좌우 밀기.
 * 그래프만 움직이고 머리글·세부는 자리를 지키며 고른 항목으로 내용만 바꾼다.
 * 가로 밀기 중에는 setPagerGestureActive로 탭 페이저를 잠근다.
 */
import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Colors } from '../../../../constants/colors';
import { CardStyle, Type } from '../../../../constants/designTokens';
import { Fonts } from '../../../../constants/fonts';
import { useAuth } from '../../../contexts/AuthContext';
import { TabPagerContext } from '../../../contexts/TabPagerContext';
import { useHomeProfit, MONTH_BAR_COUNT } from '../../../hooks/useHomeProfit';
import { useHomeProfitDetail } from '../../../hooks/useHomeProfitDetail';
import { financialPeriod, type HomeMetric } from '../../../utils/homeFinancialCard';
import { HomeSectionHeader } from '../HomeSectionHeader';
import { ProfitBars, ProfitBarsSkeleton } from './ProfitBars';
import { ProfitDetail } from './ProfitDetail';
import { ProfitHead } from './ProfitHead';
import { METRIC_LABELS, PROFIT_METRICS } from './metrics';
import { buildBreakdown } from './profitBreakdown';
import { compareAmounts, comparisonLabel, yearMonths, type PeriodBar, type ProfitPeriod } from './profitPeriods';

interface Props { active: boolean; refreshKey: number; onOpenPayroll?: () => void }

function usePagerLock() {
  const pager = useContext(TabPagerContext);
  const lock = pager?.setPagerGestureActive ?? pager?.setAlertGestureActive;
  const owner = useId();
  useEffect(() => () => lock?.(owner, false, true), [lock, owner]);
  return useMemo(() => ({ on: () => lock?.(owner, true), off: () => lock?.(owner, false, true) }), [lock, owner]);
}

function detailMonths(period: ProfitPeriod, bar: PeriodBar | undefined, currentMonth: string): string[] {
  if (!bar || period === 'week') return [];
  if (period === 'month') return [bar.key];
  return yearMonths(currentMonth, Number(currentMonth.slice(0, 4)) - Number(bar.key) + 1).filter(month => month.startsWith(`${bar.key}-`));
}

export function HomeProfitSection({ active, refreshKey, onOpenPayroll }: Props) {
  const { store, user, canManageStore } = useAuth();
  const [metricIndex, setMetricIndex] = useState(0);
  const [period, setPeriod] = useState<ProfitPeriod>('month');
  const [selectedBar, setSelectedBar] = useState<number | null>(null);
  useEffect(() => { setMetricIndex(0); setPeriod('month'); setSelectedBar(null); }, [store?.id, user?.id, canManageStore]);
  const metric = PROFIT_METRICS[metricIndex];
  const data = useHomeProfit(active, period);
  const lastRefresh = useRef(refreshKey);
  useEffect(() => {
    if (lastRefresh.current === refreshKey) return;
    lastRefresh.current = refreshKey;
    if (active) void data.refetch();
  }, [active, refreshKey, data.refetch]);
  const currentMonth = financialPeriod().month;
  const index = selectedBar == null || selectedBar >= data.bars.length ? data.bars.length - 1 : selectedBar;
  const bar = data.bars[index];
  const detail = useHomeProfitDetail(active, canManageStore ? detailMonths(period, bar, currentMonth) : []);
  const pager = useRef<ScrollView>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const target = useRef<number | null>(null);
  const lock = usePagerLock();
  const periods: ProfitPeriod[] = canManageStore ? ['week', 'month', 'year'] : ['month', 'year'];

  const selectMetric = useCallback((next: number) => {
    setMetricIndex(next);
    target.current = next;
    pager.current?.scrollTo({ x: next * pageWidth, animated: true });
  }, [pageWidth]);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!pageWidth) return;
    const page = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    // 탭으로 옮기는 중에는 도착할 때까지 중간 항목으로 머리글을 바꾸지 않는다(빠른 탭에도 겹치지 않게).
    if (target.current != null) { if (page === target.current) target.current = null; return; }
    if (page !== metricIndex && page >= 0 && page < PROFIT_METRICS.length) setMetricIndex(page);
  };
  const settle = () => { target.current = null; lock.off(); };

  const value = bar?.values?.[metric] ?? null;
  const revenue = bar?.values?.revenue ?? null;
  const share = metric !== 'profit' && metric !== 'revenue' && value != null && revenue ? Math.round(value / revenue * 100) : null;
  const comparison = !bar ? null : bar.current
    ? compareAmounts(data.sameDay?.now?.[metric] ?? null, data.sameDay?.base?.[metric] ?? null, metric)
    : compareAmounts(value, data.bars[index - 1]?.values?.[metric] ?? null, metric);
  const loading = data.loading && !data.bars.some(item => item.values);
  const showPayrollLink = canManageStore && !loading && value == null && (metric === 'labor' || metric === 'profit') && !!bar?.values;

  return <View style={styles.root}>
    <HomeSectionHeader title="손익" tabsLabel="항목" selected={metric}
      tabs={PROFIT_METRICS.map(id => ({ id, label: METRIC_LABELS[id] }))}
      onSelect={id => selectMetric(PROFIT_METRICS.indexOf(id))} />
    <View style={styles.card} testID="home-profit-card">
      <ProfitHead metric={metric} periodName={bar?.name ?? ''} amount={value} share={share} loading={loading}
        comparison={comparison} comparisonLabel={comparisonLabel(period, data.bars, index, currentMonth)}
        missingComparison={period === 'year' ? '작년 같은 날과는 아직 비교할 수 없어요' : '앞 기간 같은 날 자료가 없어요'}
        comparisonState={bar?.current ? data.comparisonState : 'ready'}
        periods={periods} period={period} onPeriod={next => { setPeriod(next); setSelectedBar(null); }} />
      {data.error && data.bars.some(item => item.values) && <View style={styles.partial}>
        <Text style={styles.caption}>일부 기간을 불러오지 못했어요</Text>
        <Pressable accessibilityRole="button" onPress={() => { void data.refetch(); }} style={styles.textButton}><Text style={styles.action}>다시 불러오기</Text></Pressable>
      </View>}
      {data.error && !data.bars.some(item => item.values) ? <View style={styles.failure}>
        <Text style={styles.caption}>손익을 불러오지 못했어요</Text>
        <Pressable accessibilityRole="button" onPress={() => { void data.refetch(); }} style={styles.textButton}><Text style={styles.action}>다시 불러오기</Text></Pressable>
      </View> : <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEventThrottle={16}
        onLayout={event => setPageWidth(event.nativeEvent.layout.width)} onScroll={onScroll}
        onScrollBeginDrag={lock.on} onScrollEndDrag={lock.off} onMomentumScrollEnd={settle} onTouchEnd={lock.off} onTouchCancel={lock.off}
        style={styles.pager} accessibilityLabel={`${METRIC_LABELS[metric]} 그래프, 좌우로 밀어 항목을 바꿔요`}>
        {PROFIT_METRICS.map(id => <View key={id} style={{ width: pageWidth || undefined }}>
          {data.bars.length ? <ProfitBars bars={data.bars} metric={id} selected={index} loading={loading} onSelect={setSelectedBar} />
            : <ProfitBarsSkeleton count={period === 'month' ? MONTH_BAR_COUNT : 3} />}
        </View>)}
      </ScrollView>}
      {showPayrollLink && onOpenPayroll && <Pressable accessibilityRole="button" onPress={onOpenPayroll} style={styles.link}>
        <Text style={styles.action}>확인할 직원 보기 →</Text>
      </Pressable>}
      {canManageStore && bar && !(data.error && !data.bars.some(item => item.values)) && <ProfitDetail {...(period === 'week' ? { kind: 'unavailable' as const, message: '주별 세부는 월이나 연도에서 볼 수 있어요' }
        : detail.error ? { kind: 'error' as const, onRetry: () => { void detail.refetch(); } }
        : detail.sources && bar ? { kind: 'ready' as const, breakdown: buildBreakdown(detail.sources, metric), periodName: bar.name }
        : { kind: 'loading' as const })} />}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: 4 },
  card: { ...CardStyle, paddingBottom: 8, overflow: 'hidden' },
  pager: { marginTop: 8 },
  partial: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  failure: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 4 },
  caption: { fontFamily: Fonts.wantedRegular, fontSize: Type.sm, color: Colors.gray500 },
  textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  action: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.sm, color: Colors.action },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 20 },
});

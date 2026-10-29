import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
/* design-system: DESIGN.md · UI/UX Pro Max: independent scrim and sheet motion */
import { sumKnown } from '../../lib/utils/financialCoverage';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient, queryKeys, useQueryScope, isAccessDenied } from '../../lib/query';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
  Modal, ActivityIndicator,
  useWindowDimensions, type StyleProp, type ViewStyle, type ViewProps,
} from 'react-native';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { DetailSheetMotion } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { getYearlyProfitLoss } from '../../lib/services/profitLoss';
import { ProfitLoss } from '../../types';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { AppBar } from '../../lib/components/ui';
import { getErrorMessage } from '../../lib/utils/error';

function fmt(v: number | null | undefined) {
  if (v == null) return '확인 필요';
  return `${v.toLocaleString()}원`;
}

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

function ratioOfRevenue(value: number | null | undefined, revenue: number): string {
  if (!value || !revenue) return '';
  return `${(value / revenue * 100).toFixed(2)}%`;
}

function PnLDetailSheet({ pnl, month, onClose, motionStyle, onLayout }: {
  pnl: ProfitLoss; month: number; onClose: () => void;
  motionStyle: StyleProp<ViewStyle>; onLayout: ViewProps['onLayout'];
}) {
  const insets = useSafeAreaInsets();
  const cats = pnl.purchaseByCategory ?? {};
  const rev = pnl.revenue;
  return (
    <Animated.View style={[sheet.container, { paddingBottom: Math.max(insets.bottom, 20) }, motionStyle]} onLayout={onLayout} accessibilityViewIsModal onAccessibilityEscape={onClose}>
      <View style={sheet.handle} />
      <View style={sheet.titleRow}>
        <Text style={sheet.title}>{pnl.yearMonth.slice(0,4)}년 {month}월 손익계산서</Text>
        <TouchableOpacity style={sheet.closeButton} accessibilityRole="button" accessibilityLabel="월별 손익계산서 닫기" onPress={onClose}><Ionicons name="close" size={22} color={Colors.gray500} /></TouchableOpacity>
      </View>

      <ScrollView style={sheet.scroll} contentContainerStyle={sheet.scrollContent}>
        {/* 1. 매출 */}
        <Group label="1. 매출" value={fmt(pnl.revenue)}>
          <Sub label="카드" value={fmt(pnl.cardRevenue)} />
          <Sub label="현금·계좌이체" value={fmt(pnl.cashRevenue)} />
        </Group>

        <Sep />

        {/* 2. 매입 */}
        <Group label="2. 매입" value={fmt(pnl.purchaseCost)} ratio={ratioOfRevenue(pnl.purchaseCost, rev)}>
          {Object.keys(cats).sort().map(c => (cats[c] ?? 0) > 0 && <Sub key={c} label={c} value={fmt(cats[c])} ratio={ratioOfRevenue(cats[c], rev)} />)}
        </Group>
        <TotalRow label="= 매출이익" value={fmt(pnl.grossProfit)} />

        <Sep />

        {/* 3. 인건비 */}
        {pnl.laborCost == null && <Text style={{ color: Colors.gray600, fontSize: 13, lineHeight: 20, marginBottom: 12 }}>이 달의 급여 명세나 적용 조건이 없는 직원이 있어요. 인건비에서 해당 월을 확인해주세요. 금액을 확인하기 전까지 합계와 이익은 표시하지 않아요.</Text>}
        <Group label="3. 인건비" value={fmt(pnl.laborCost)} ratio={ratioOfRevenue(pnl.laborCost, rev)}>
          {(pnl.regularGross ?? 0) > 0 && <>
            <Sub label="직원 인건비" value={fmt(pnl.regularGross)} ratio={ratioOfRevenue(pnl.regularGross, rev)} />
            <Sub label="직원 원천징수" value={fmt(pnl.regularWithholding)} ratio={ratioOfRevenue(pnl.regularWithholding, rev)} />
          </>}
          {pnl.partTimeGross > 0 && <>
            <Sub label="파트타이머 인건비" value={fmt(pnl.partTimeGross)} ratio={ratioOfRevenue(pnl.partTimeGross, rev)} />
            <Sub label="파트타이머 원천징수" value={fmt(pnl.partTimeWithholding)} ratio={ratioOfRevenue(pnl.partTimeWithholding, rev)} />
          </>}
        </Group>

        <Sep />

        {/* 4. 비용 */}
        <Group label="4. 비용" value={fmt(pnl.fixedExpense + pnl.variableExpense)} ratio={ratioOfRevenue(pnl.fixedExpense + pnl.variableExpense, rev)}>
          {pnl.fixedExpense > 0 && <Sub label="고정비" value={fmt(pnl.fixedExpense)} ratio={ratioOfRevenue(pnl.fixedExpense, rev)} />}
          {pnl.marketingExpense > 0 && <Sub label="마케팅" value={fmt(pnl.marketingExpense)} ratio={ratioOfRevenue(pnl.marketingExpense, rev)} />}
          {pnl.maintenanceExpense > 0 && <Sub label="시설보수" value={fmt(pnl.maintenanceExpense)} ratio={ratioOfRevenue(pnl.maintenanceExpense, rev)} />}
          {pnl.utilitiesExpense > 0 && <Sub label="공과금" value={fmt(pnl.utilitiesExpense)} ratio={ratioOfRevenue(pnl.utilitiesExpense, rev)} />}
          {pnl.cardFeeExpense > 0 && <Sub label="카드 수수료" value={fmt(pnl.cardFeeExpense)} ratio={ratioOfRevenue(pnl.cardFeeExpense, rev)} />}
        </Group>

        {/* 5. 영업이익 */}
        <View style={sheet.profitRow}>
          <Text style={sheet.profitLabel}>5. 영업이익</Text>
          <Text style={[sheet.profitValue, (pnl.operatingProfit ?? 0) > 0 && sheet.profitPos, (pnl.operatingProfit ?? 0) < 0 && sheet.profitNeg]}>
            {fmt(pnl.operatingProfit)}
          </Text>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

function PnLDetailModal({ selection, onClose }: { selection: { month: number; data: ProfitLoss }; onClose: () => void }) {
  const { height } = useWindowDimensions();
  const backdrop = useSharedValue(0);
  const offset = useSharedValue(height);
  const [cardHeight, setCardHeight] = useState(0);
  const [shown, setShown] = useState(false);
  const entered = useRef(false);
  const closing = useRef(false);
  const mounted = useRef(true);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const finishClose = useCallback(() => { if (mounted.current) closeRef.current(); }, []);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  useEffect(() => {
    if (!shown || !cardHeight || entered.current || closing.current) return;
    entered.current = true;
    offset.value = cardHeight;
    backdrop.value = withTiming(1, { duration: DetailSheetMotion.backdropEnter, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System });
    offset.value = withTiming(0, { duration: DetailSheetMotion.enter, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System });
  }, [shown, cardHeight, backdrop, offset]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancelAnimation(backdrop); cancelAnimation(offset); };
  }, [backdrop, offset]);

  function close() {
    if (closing.current) return;
    closing.current = true;
    backdrop.value = withTiming(0, { duration: DetailSheetMotion.backdropExit, easing: Easing.in(Easing.quad), reduceMotion: ReduceMotion.System });
    offset.value = withTiming(cardHeight || height, { duration: DetailSheetMotion.exit, easing: Easing.in(Easing.cubic), reduceMotion: ReduceMotion.System }, finished => {
      if (finished) scheduleOnRN(finishClose);
    });
  }

  return <Modal visible animationType="none" transparent onShow={() => setShown(true)} onRequestClose={close}>
    <View style={styles.modalOverlay}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.modalBackdrop, backdropStyle]} />
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="월별 손익계산서 배경 닫기" onPress={close} />
      <PnLDetailSheet pnl={selection.data} month={selection.month} onClose={close} motionStyle={cardStyle} onLayout={event => setCardHeight(event.nativeEvent.layout.height)} />
    </View>
  </Modal>;
}

function Group({ label, value, ratio, children }: { label: string; value: string; ratio?: string; children?: React.ReactNode }) {
  return (
    <View style={sheet.group}>
      <View style={sheet.groupRow}>
        <View style={sheet.labelRow}>
          <Text style={sheet.groupLabel}>{label}</Text>
          {ratio ? <Text style={sheet.ratioTag}>{ratio}</Text> : null}
        </View>
        <Text style={sheet.groupValue}>{value}</Text>
      </View>
      {children && <View style={sheet.subs}>{children}</View>}
    </View>
  );
}

function Sub({ label, value, ratio }: { label: string; value: string; ratio?: string }) {
  return (
    <View style={sheet.subRow}>
      <View style={sheet.labelRow}>
        <Text style={sheet.subLabel}>{label}</Text>
        {ratio ? <Text style={sheet.subRatioTag}>{ratio}</Text> : null}
      </View>
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
  const { currentRole } = useAuth();
  if (currentRole !== 'admin') return (
    <SafeAreaView style={styles.container}><GlassBackdrop />
      <AppBar transparent title="손익" onBack={() => router.back()} />
      <ErrorMessage message="관리자만 확인할 수 있어요." />
    </SafeAreaView>
  );
  return <AdminProfitLossScreen />;
}

function AdminProfitLossScreen() {
  const { store } = useAuth();
  const params = useLocalSearchParams<{ yearMonth?: string }>();
  const requestedMonth = typeof params.yearMonth === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.yearMonth) ? params.yearMonth : null;
  const today = new Date();
  const [year, setYear] = useState(requestedMonth ? Number(requestedMonth.slice(0, 4)) : today.getFullYear());
  const scope = useQueryScope();
  const closingTime = store?.closing_time?.slice(0, 5) ?? '23:00';
  const key = useMemo(() => queryKeys.store(scope, store?.id ?? '', 'detailed-financial', closingTime, year), [scope, store?.id, closingTime, year]);
  const query = useQuery({ queryKey: key, queryFn: () => getYearlyProfitLoss(store!.id, year, closingTime),
    enabled: !!store, staleTime: year === today.getFullYear() ? 30_000 : 300_000 }, queryClient);
  const monthlyData = isAccessDenied(query.error) ? [] : query.data ?? [];
  const loading = query.isPending && query.isFetching;
  const loaded = !!query.data && !isAccessDenied(query.error);
  const error = query.error ? getErrorMessage(query.error, '손익을 불러오지 못했어요.') : null;
  const [selected, setSelected] = useState<{ month: number; data: ProfitLoss } | null>(null);
  const openedRequest = useRef<string | null>(null);
  useEffect(() => { setSelected(null); }, [year, store?.id, scope]);
  useEffect(() => {
    if (!requestedMonth || !loaded || year !== Number(requestedMonth.slice(0, 4))) return;
    const requestKey = `${scope}:${store?.id}:${requestedMonth}`;
    if (openedRequest.current === requestKey) return;
    const match = monthlyData.find(row => row.month === Number(requestedMonth.slice(5)));
    if (match) { openedRequest.current = requestKey; setSelected(match); }
  }, [requestedMonth, loaded, year, scope, store?.id, monthlyData]);
  const load = useCallback(async (_year: number) => {
    if (!store) return;
    await queryClient.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' });
    try { await queryClient.fetchQuery({ queryKey: key, queryFn: () => getYearlyProfitLoss(store.id, year, closingTime), staleTime: 0 }); }
    catch { /* The observer displays the error with its retry action. */ }
  }, [store?.id, key, year, closingTime]);

  function prevYear() { setYear(y => y - 1); }
  function nextYear() {
    if (year >= today.getFullYear()) return;
    setYear(y => y + 1);
  }

  const yearTotal = monthlyData.reduce<{ revenue: number; operatingProfit: number | null; laborCost: number | null; purchaseCost: number }>(
    (acc, { data }) => ({
      revenue: acc.revenue + data.revenue,
      operatingProfit: sumKnown([acc.operatingProfit, data.operatingProfit]),
      laborCost: sumKnown([acc.laborCost, data.laborCost]),
      purchaseCost: acc.purchaseCost + data.purchaseCost,
    }),
    { revenue: 0, operatingProfit: 0, laborCost: 0, purchaseCost: 0 },
  );

  return (
    <SafeAreaView style={styles.container}><GlassBackdrop />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="뒤로가기">
          <Ionicons name="chevron-back" size={22} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>손익계산서</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* 연도 선택 */}
        <View style={styles.yearRow}>
          <TouchableOpacity onPress={prevYear} style={styles.yearBtn} accessibilityRole="button" accessibilityLabel="이전 연도">
            <Ionicons name="chevron-back" size={18} color={Colors.gray600} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => load(year)} style={styles.yearLabel} activeOpacity={0.7}>
            <Text style={styles.yearText}>{year}년</Text>
            <Ionicons name="refresh-outline" size={14} color={Colors.gray400} style={{ marginLeft: 6 }} />
          </TouchableOpacity>
          <TouchableOpacity onPress={nextYear} style={styles.yearBtn} accessibilityRole="button" accessibilityLabel="다음 연도">
            <Ionicons name="chevron-forward" size={18} color={year >= today.getFullYear() ? Colors.gray200 : Colors.gray600} />
          </TouchableOpacity>
        </View>

        {loading && <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />}
        {!loading && error && <ErrorMessage message={error} onRetry={() => { void load(year); }} />}

        {!loading && !loaded && !error && (
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
              <View style={styles.summaryProfit}>
                <Text style={styles.summaryProfitLabel}>영업이익</Text>
                <Text style={[styles.summaryProfitValue, (yearTotal.operatingProfit ?? 0) > 0 && styles.profit, (yearTotal.operatingProfit ?? 0) < 0 && styles.loss]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {fmt(yearTotal.operatingProfit)}
                </Text>
              </View>
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
                      <Text style={[styles.monthValueNum, (data.operatingProfit ?? 0) > 0 && styles.profit, (data.operatingProfit ?? 0) < 0 && styles.loss]}>
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
      {selected && <PnLDetailModal key={selected.data.yearMonth} selection={selected} onClose={() => setSelected(null)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: 'transparent',
  },
  backBtn: { width: 44, height: 44, justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 22, fontWeight: '700', color: Colors.black },
  scroll: { padding: 20, paddingBottom: 48, gap: 16 },

  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  yearBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: Colors.white, borderWidth: 0.5, borderColor: Colors.gray100 },
  yearLabel: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 12, backgroundColor: Colors.white, borderWidth: 0.5, borderColor: Colors.gray100 },
  yearText: { fontSize: 17, fontWeight: '700', color: Colors.black },

  emptyHint: { alignItems: 'center', paddingTop: 48, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.gray400, textAlign: 'center', lineHeight: 22 },
  loadBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.primary },
  loadBtnText: { fontSize: 14, fontWeight: '600', color: Colors.white },

  summaryCard: {
    backgroundColor: Colors.white, borderRadius: 24,
    borderWidth: 1, borderColor: Colors.homeBorder, padding: 18,
  },
  summaryTitle: { fontSize: 13, fontWeight: '600', color: Colors.gray500, marginBottom: 14 },
  summaryProfit: { paddingBottom: 16, marginBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  summaryProfitLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600, marginBottom: 4 },
  summaryProfitValue: { fontSize: 34, fontFamily: Fonts.spaceGroteskBold, fontWeight: '700', color: Colors.black, letterSpacing: -1 },
  summaryGrid: { gap: 10 },
  summaryItem: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  summaryItemLabel: { fontSize: 13, color: Colors.gray500 },
  summaryItemValue: { fontSize: 14, fontWeight: '600', color: Colors.black },

  monthList: { backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder, overflow: 'hidden' },
  monthRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
  },
  monthLabel: { width: 36 },
  monthText: { fontSize: 14, fontWeight: '600', color: Colors.black },
  monthValues: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  monthValueItem: {},
  monthValueLabel: { fontSize: 11, color: Colors.gray400 },
  monthValueNum: { fontSize: 13, fontWeight: '500', color: Colors.black },

  profit: { color: Colors.positive },
  loss: { color: Colors.negative },

  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { backgroundColor: Colors.overlayDetail },
});

const sheet = StyleSheet.create({
  container: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '88%', flexShrink: 1, overflow: 'hidden',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.gray200, alignSelf: 'center', marginBottom: 16 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.black },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingBottom: 20 },

  group: { paddingVertical: 10 },
  groupRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupLabel: { fontSize: 13, fontWeight: '600', color: Colors.black },
  groupValue: { fontSize: 13, fontWeight: '600', color: Colors.black },
  ratioTag: { fontSize: 12, color: Colors.gray600, fontWeight: '400' },
  subRatioTag: { fontSize: 12, color: Colors.gray500 },
  subs: { paddingLeft: 12, marginTop: 6, gap: 4 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between' },
  subLabel: { fontSize: 12, color: Colors.gray500 },
  subValue: { fontSize: 12, color: Colors.gray600 },

  sep: { height: 0.5, backgroundColor: Colors.gray100, marginVertical: 4 },

  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: Colors.homeCanvas, borderRadius: 8, marginVertical: 4,
  },
  totalLabel: { fontSize: 12, fontWeight: '600', color: Colors.gray600 },
  totalValue: { fontSize: 13, fontWeight: '600', color: Colors.black },

  profitRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 12,
    backgroundColor: Colors.homeCanvas, borderRadius: 12, marginTop: 8,
  },
  profitLabel: { fontSize: 14, fontWeight: '700', color: Colors.black },
  profitValue: { fontSize: 16, fontWeight: '800', color: Colors.black },
  profitPos: { color: Colors.positive },
  profitNeg: { color: Colors.negative },
});

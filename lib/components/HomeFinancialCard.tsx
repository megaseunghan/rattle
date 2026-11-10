import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useReducedMotion } from 'react-native-reanimated';
import { AppIcon } from '../icons/AppIcon';
import { Fonts } from '../../constants/fonts';
import { Colors } from '../../constants/colors';
import { useReducedTransparency } from '../hooks/useReducedTransparency';
import { comparisonText, type HomeFinancialCardData, type HomeMetric } from '../utils/homeFinancialCard';
import { RollingAmount } from './home-financial/RollingAmount';
import { MetricChips } from './home-financial/MetricChips';
import { FinancialAreaChart } from './home-financial/FinancialAreaChart';
import { financialTheme, metricLabels } from './home-financial/theme';
interface Props { data: HomeFinancialCardData | null; loading: boolean; refreshing: boolean; error: boolean; onRetry: () => Promise<unknown>; }
export function HomeFinancialCard({ data, loading, refreshing, error, onRetry }: Props) {
  const [metric, setMetric] = useState<HomeMetric>('profit');
  const [reason, setReason] = useState(false), [retrying, setRetrying] = useState(false);
  const reduced = useReducedMotion(), opaque = useReducedTransparency();
  const veil = useRef(new Animated.Value(error ? 1 : 0)).current;
  const [veilVisible, setVeilVisible] = useState(error);
  useEffect(() => {
    if (error) { setVeilVisible(true); veil.setValue(1); return; }
    const animation = Animated.timing(veil, { toValue: 0, duration: reduced ? 0 : 320, useNativeDriver: true });
    animation.start(({ finished }) => { if (finished) setVeilVisible(false); });
    return () => animation.stop();
  }, [error, reduced, veil]);
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    if (reduced || !(loading || refreshing || retrying)) { pulse.setValue(0.5); return; }
    const animation = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 0.9, duration: 650, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0.35, duration: 650, useNativeDriver: true })]));
    animation.start(); return () => animation.stop();
  }, [loading, refreshing, retrying, reduced, pulse]);
  const daily = data?.current.at(-1)?.values[metric] != null;
  const chartEntered = useRef(false);
  useEffect(() => { if (daily) chartEntered.current = true; }, [daily]);
  const amount = data ? (daily ? data.current.at(-1)!.values[metric] : data.totals[metric]) : null;
  const revenue = daily ? data?.current.at(-1)?.values.revenue : data?.totals.revenue;
  const previous = daily ? data?.previous.at(-1)?.values[metric] ?? null : null;
  const comparison = comparisonText(amount, previous);
  const delta = amount != null && previous != null ? amount - previous : null;
  const favorable = delta == null || (metric === 'profit' || metric === 'revenue' ? delta >= 0 : delta <= 0);
  const color = financialTheme[metric];
  const amountColor = amount != null && amount < 0 ? financialTheme.negative : Colors.black;
  const month = data ? Number(data.date.slice(5, 7)) : new Date().getMonth() + 1;
  const title = `${month}월${daily && data ? ` ${Number(data.date.slice(8))}일까지` : ''}의 ${metricLabels[metric]}`;
  async function retry() { if (retrying) return; setRetrying(true); try { await onRetry(); } finally { setRetrying(false); } }
  const retryControl = <Pressable accessibilityRole="button" accessibilityLabel="다시 불러오기" accessibilityState={{ disabled: retrying, busy: retrying }} disabled={retrying} onPress={() => { void retry().catch(() => {}); }} style={styles.retry}>
    {retrying ? <View accessibilityLabel="불러오는 중" style={{ flexDirection: 'row', gap: 5 }}>{[0, 1, 2].map(index => <Animated.View key={index} style={[styles.dot, { opacity: pulse.interpolate({ inputRange: [0.35, 0.6, 0.9], outputRange: index === 0 ? [1, 0.3, 0.3] : index === 1 ? [0.3, 1, 0.3] : [0.3, 0.3, 1] }) }]} />)}</View> : <><AppIcon name="refresh-outline" size={19} color={Colors.gray600} /><Text style={styles.caption}>다시 불러오기</Text></>}
  </Pressable>;
  return <View style={styles.card} testID="home-financial-card">
    <View style={styles.titleRow}><Text style={styles.title}>{title}</Text>{refreshing && !error && <Animated.View accessibilityLabel="갱신 중" style={[styles.dot, { opacity: pulse }]} />}</View>
    {loading && !data ? <Animated.View accessibilityLabel="불러오는 중" style={[styles.center, { opacity: pulse, transform: [{ translateX: pulse.interpolate({ inputRange: [0.35, 0.9], outputRange: reduced ? [0, 0] : [-2, 2] }) }] }]}><View style={styles.placeholder} /><View style={[styles.placeholder, { width: 64, height: 8 }]} /></Animated.View>
      : !data ? <View style={styles.center}><Text style={styles.caption}>{error ? '자료를 불러오지 못했어요' : '집계된 자료가 없어요'}</Text>{error && retryControl}</View>
      : data.hasRecords === false ? <View style={styles.center}><Text style={styles.caption}>집계된 자료가 없어요</Text></View>
      : <>
        <View style={styles.amount}>{amount == null ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: reason }} onPress={() => setReason(value => !value)} style={styles.unknown}><Text style={styles.unknownText}>확인 필요</Text></Pressable> : <RollingAmount value={amount} color={amountColor} reduced={reduced} />}</View>
        {reason && <Text style={styles.caption}>급여 조건과 해당 월의 급여 내역을 확인해 주세요.</Text>}
        <View style={styles.meta}>
          {metric !== 'revenue' && <Text style={styles.caption}>{metric === 'profit' ? '이익률' : '매출 대비'} {amount != null && revenue != null && revenue !== 0 ? `${(amount / revenue * 100).toFixed(1)}%` : '—%'}</Text>}
          {comparison ? <Text style={[styles.caption, { color: favorable ? financialTheme.positive : financialTheme.negative }]}>전월 대비 {comparison}</Text> : !daily && <Text style={styles.caption}>동기간 비교 확인 필요</Text>}
        </View>
        <View style={styles.chart} testID="financial-chart-region">
          <View style={styles.legend} testID="financial-chart-legend">{daily && <><Text style={[styles.caption, { color }]}>● 이번 달</Text>{previous != null && <Text style={styles.caption}>● 지난달</Text>}</>}</View>
          <FinancialAreaChart animateEntry={!chartEntered.current} reduced={reduced} key={data.date} current={data.current} previous={data.previous} date={data.date} metric={metric} />
          {veilVisible && <Animated.View pointerEvents={error ? 'auto' : 'none'} style={[styles.overlay, { opacity: veil }]}>{opaque ? <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.94)' }]} /> : <BlurView intensity={22} tint="light" style={StyleSheet.absoluteFill} />}{error && retryControl}</Animated.View>}
        </View>
        <View style={styles.chipInset}><MetricChips selected={metric} reduced={reduced} onSelect={key => { setMetric(key); setReason(false); }} /></View>
      </>}
  </View>;
}
const styles = StyleSheet.create({ card: { minHeight: 375, paddingTop: 10, paddingBottom: 6, borderRadius: 24, backgroundColor: 'transparent', boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 10, color: 'rgba(30, 48, 72, 0.07)' }] }, titleRow: { marginHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 }, title: { color: Colors.gray700, fontFamily: Fonts.wantedBold, fontSize: 14 }, center: { flex: 1, minHeight: 320, alignItems: 'center', justifyContent: 'center', gap: 14 }, caption: { color: Colors.gray600, fontFamily: Fonts.wantedRegular, fontSize: 11 }, meta: { marginHorizontal: 12, minHeight: 26, gap: 1 }, amount: { marginHorizontal: 12, minHeight: 44, justifyContent: 'center' }, chipInset: { marginHorizontal: 10 }, chart: { height: 242 }, legend: { marginHorizontal: 12, flexDirection: 'row', gap: 14, height: 18, alignItems: 'center' }, overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderRadius: 14 }, retry: { minWidth: 72, minHeight: 48, justifyContent: 'center', alignItems: 'center', gap: 5 }, dots: { color: Colors.gray600, fontSize: 22, letterSpacing: 5 }, dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.gray500 }, placeholder: { width: 100, height: 16, borderRadius: 8, backgroundColor: '#E1E7EF' }, unknown: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' }, unknownText: { fontSize: 25, color: Colors.gray600, textDecorationLine: 'underline', fontFamily: Fonts.wantedRegular } });

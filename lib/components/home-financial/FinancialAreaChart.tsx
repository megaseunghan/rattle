import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Defs, LinearGradient, Line, Mask, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { TabPagerContext } from '../../contexts/TabPagerContext';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { basisPath, financialChartDays, trendPointAtX, won, type FinancialDay, type HomeMetric } from '../../utils/homeFinancialCard';
import { financialTheme, metricLabels } from './theme';
import { MorphingArea } from './MorphingArea';
interface Props { current: FinancialDay[]; previous: FinancialDay[]; metric: HomeMetric; date: string; onInspect?: (active: boolean) => void; animateEntry?: boolean; reduced?: boolean }
export function FinancialAreaChart({ current: cumulativeCurrent, previous: cumulativePrevious, metric, date, onInspect, animateEntry = false, reduced = false }: Props) {
  const current = useMemo(() => financialChartDays(cumulativeCurrent, metric), [cumulativeCurrent, metric]);
  const previous = useMemo(() => financialChartDays(cumulativePrevious, metric), [cumulativePrevious, metric]);
  const setPagerGestureActive = useContext(TabPagerContext)?.setPagerGestureActive;
  const gestureOwner = useId();
  const maskId = `chart-area-${gestureOwner.replace(/[^a-zA-Z0-9-]/g, '')}`;
  useEffect(() => () => setPagerGestureActive?.(gestureOwner, false), [setPagerGestureActive, gestureOwner]);
  const [width, setWidth] = useState(320);
  const [selection, setSelection] = useState<{ day: number; x: number; y: number } | null>(null);
  const inspectRef = useRef(onInspect); inspectRef.current = onInspect;
  const through = Number(date.slice(8)), month = Number(date.slice(5, 7));
  const values = [...current, ...previous].flatMap(row => row.values[metric] == null ? [] : [row.values[metric]!]);
  const min = Math.min(0, ...values), max = Math.max(1, ...values), range = max - min;
  const power = 10 ** Math.floor(Math.log10(Math.max(1, range / 4)));
  const step = [1, 2, 5, 10].map(n => n * power).find(n => n >= range / 4) ?? power;
  const low = min < 0 ? Math.floor((min - range * 0.04) / step) * step : 0;
  const high = Math.ceil((max + range * 0.04) / step) * step;
  const x = (day: number) => (day - 1) / Math.max(1, through - 1) * 322;
  const y = (value: number) => 208 - (value - low) / Math.max(1, high - low) * 192;
  const points = (rows: FinancialDay[]) => rows.filter(row => row.day <= through && row.values[metric] != null).map(row => ({ x: x(row.day), y: y(row.values[metric]!) }));
  const nowPoints = points(current), previousPoints = points(previous);
  const hasTimeline = nowPoints.length > 0;
  const entryEnabled = useRef(animateEntry).current;
  const entrance = useRef(new Animated.Value(entryEnabled && !reduced ? 0 : 1)).current;
  const inspection = useRef(new Animated.Value(0)).current;
  const inspecting = selection != null;
  useEffect(() => {
    if (!hasTimeline) return;
    if (reduced || !entryEnabled) { entrance.setValue(1); return; }
    const animation = Animated.timing(entrance, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [entrance, hasTimeline, entryEnabled, reduced]);
  useEffect(() => {
    if (!inspecting || reduced) { inspection.setValue(inspecting ? 1 : 0); return; }
    const animation = Animated.timing(inspection, { toValue: 1, duration: 100, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [inspection, inspecting, reduced]);
  useEffect(() => {
    if (!hasTimeline) {
      setSelection(null);
      setPagerGestureActive?.(gestureOwner, false);
      onInspect?.(false);
    }
  }, [hasTimeline, setPagerGestureActive, gestureOwner, onInspect]);
  const currentPath = basisPath(nowPoints), previousPath = basisPath(previousPoints);
  const color = financialTheme[metric];
  const latest = useRef({ width, through }); latest.current = { width, through };
  const gesture = useMemo(() => {
    const select = (locationX: number, locationY: number) => {
      const day = Math.max(1, Math.min(latest.current.through, 1 + Math.round(locationX / latest.current.width * (latest.current.through - 1))));
      setSelection({ day, x: locationX, y: locationY });
    };
    return Gesture.Pan()
      .withTestId('financial-chart-pan')
      .minDistance(0)
      .shouldCancelWhenOutside(false)
      .runOnJS(true)
      .onBegin(event => {
        setPagerGestureActive?.(gestureOwner, true);
        select(event.x, event.y);
        inspectRef.current?.(true);
        void Haptics.selectionAsync().catch(() => {});
      })
      .onUpdate(event => select(event.x, event.y))
      .onFinalize(() => {
        setSelection(null);
        inspectRef.current?.(false);
        setPagerGestureActive?.(gestureOwner, false);
      });
  }, [setPagerGestureActive, gestureOwner]);
  const currentValue = selection ? current.find(row => row.day === selection.day)?.values[metric] ?? null : null;
  const previousValue = selection ? previous.find(row => row.day === selection.day)?.values[metric] ?? null : null;
  const currentDot = selection ? trendPointAtX(currentPath, x(selection.day)) : null;
  const previousDot = selection && previousPoints.length ? trendPointAtX(previousPath, x(selection.day)) : null;
  const tooltipWidth = Math.min(200, width - 8), tooltipHeight = previousValue == null ? 48 : 66;
  let top = selection ? Math.max(24, Math.min(224 - tooltipHeight - 24, selection.y - tooltipHeight - 20)) : 0;
  const dotTop = Math.min(...[currentDot, previousDot].filter(Boolean).map(point => point!.y));
  if (selection && top + tooltipHeight > dotTop - 8 && top < dotTop + 20) top = dotTop - tooltipHeight - 12 >= 24 ? dotTop - tooltipHeight - 12 : Math.max(24, Math.min(224 - tooltipHeight - 24, dotTop + 20));
  const axis = (value: number) => value === 0 ? '0원' : `${(value / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}만원`;
  if (!nowPoints.length) return <View style={styles.noTimeline} testID="financial-chart-no-timeline"><Text style={styles.caption}>일별 자료 확인 필요</Text></View>;
  return <View style={styles.wrap} testID="financial-chart-touch-surface"
    onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <Animated.View pointerEvents="none" style={{ opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }] }}>
    <Svg width="100%" height={224} viewBox="0 0 322 224" preserveAspectRatio="none" accessible={false}>
      <Defs>
        {[{ id: `${maskId}-up`, end: 0 }, { id: `${maskId}-down`, end: 224 }].map(item => <LinearGradient key={item.id} id={item.id} gradientUnits="userSpaceOnUse" x1={0} y1={y(0)} x2={0} y2={item.end}>
          <Stop offset="0%" stopColor="white" stopOpacity={0} /><Stop offset="24%" stopColor="white" stopOpacity={1} />
          <Stop offset="80%" stopColor="white" stopOpacity={1} /><Stop offset="100%" stopColor="white" stopOpacity={0} />
        </LinearGradient>)}
        <Mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={322} height={224}>
          <Rect width={322} height={y(0)} fill={`url(#${maskId}-up)`} />
          <Rect y={y(0)} width={322} height={224 - y(0)} fill={`url(#${maskId}-down)`} />
        </Mask>
      </Defs>
      {selection && <><SvgText testID="chart-range-high" x={310} y={12} textAnchor="end" fill={Colors.gray600} fontSize={11}>{axis(high)}</SvgText>
      <SvgText x={310} y={220} textAnchor="end" fill={Colors.gray600} fontSize={11}>{axis(low)}</SvgText></>}
      {min < 0 && <><Line testID="chart-zero-baseline" x1={0} x2={322} y1={y(0)} y2={y(0)} stroke={Colors.gray500} strokeOpacity={0.22} /><SvgText x={310} y={y(0) - 5} textAnchor="end" fill={Colors.gray600} fontSize={10}>0</SvgText></>}
      {previousPath && <MorphingArea path={previousPath} baseline={y(0)} areaMask={maskId} color={financialTheme.prior} prior immediate={reduced || inspecting} />}
      <MorphingArea path={currentPath} baseline={y(0)} areaMask={maskId} color={color} immediate={reduced || inspecting} />
      {selection && <>
        <Line x1={x(selection.day)} x2={x(selection.day)} y1={16} y2={208} stroke={Colors.gray500} strokeDasharray="3 4" />
        {[{ point: previousDot, ink: financialTheme.prior }, { point: currentDot, ink: color }].map(({ point, ink }, i) => point && <Circle key={i} cx={point.x} cy={point.y} r={5} fill={ink} stroke={Colors.white} strokeWidth={2} />)}
      </>}
    </Svg>
    </Animated.View>
    <GestureDetector gesture={gesture}><View collapsable={false} style={StyleSheet.absoluteFill} accessible accessibilityRole="adjustable" accessibilityLabel={`${metricLabels[metric]} ${metric === 'profit' ? '날짜별 누적' : '일별 금액'} 추세. 부드러운 곡선은 추세 표현입니다.`}
      accessibilityValue={{ min: 1, max: through, now: selection?.day ?? through, text: selection ? `${selection.day}일 ${won(currentValue)}` : `${through}일까지` }}
      accessibilityActions={[{ name: 'increment', label: '다음 날' }, { name: 'decrement', label: '이전 날' }, { name: 'escape', label: '금액창 닫기' }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === 'escape') { setSelection(null); return; }
        const day = Math.max(1, Math.min(through, (selection?.day ?? through) + (nativeEvent.actionName === 'increment' ? 1 : -1)));
        setSelection({ day, x: x(day) / 322 * width, y: 140 });
      }} /></GestureDetector>
    {selection && <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.tooltip, { opacity: inspection, transform: [{ translateY: inspection.interpolate({ inputRange: [0, 1], outputRange: [2, 0] }) }], width: tooltipWidth, left: Math.max(4, Math.min(width - tooltipWidth - 4, selection.x - tooltipWidth / 2)), top }]}>
      <Text style={styles.tooltipTitle}>{month}월 {selection.day}일{metric === 'profit' ? ' 누적' : ''}</Text>
      <View style={styles.tooltipRow}><Text style={styles.caption}>이번 달</Text><Text style={[styles.tooltipAmount, { color: currentValue != null && currentValue < 0 ? financialTheme.negative : color }]}>{won(currentValue)}</Text></View>
      {previousValue != null && <View style={styles.tooltipRow}><Text style={styles.caption}>지난달</Text><Text style={[styles.tooltipAmount, { color: Colors.gray600 }]}>{won(previousValue)}</Text></View>}
    </Animated.View>}
  </View>;
}
const styles = StyleSheet.create({ wrap: { height: 224 }, noTimeline: { height: 224, alignItems: 'center', justifyContent: 'center' }, caption: { color: Colors.gray600, fontSize: 11, fontFamily: Fonts.wantedRegular }, tooltip: { position: 'absolute', zIndex: 3, padding: 8, borderWidth: 1, borderColor: Colors.homeBorder, borderRadius: 10, backgroundColor: Colors.white, shadowColor: Colors.black, shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }, tooltipTitle: { fontSize: 11, fontFamily: Fonts.wantedBold, marginBottom: 4, color: Colors.black }, tooltipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, tooltipAmount: { fontSize: 12, fontFamily: Fonts.geistBold } });

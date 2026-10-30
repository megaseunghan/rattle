import { useId, memo } from 'react';
import { smoothTrendPath, TrendPoint } from '../utils/smoothTrendPath';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Circle, Line, Path, Defs, ClipPath, Rect, Text as SvgText } from 'react-native-svg';
import { Colors } from '../../constants/colors';
import { NumericText } from './ui/NumericText';
interface TrendDatum { label: string; value: number | null }
function compact(value: number | null) {
  if (value == null) return '확인 필요';
  const absolute = Math.abs(value), sign = value < 0 ? '-' : '';
  if (absolute >= 100000000) return `${sign}${(absolute / 100000000).toFixed(1)}억`;
  if (absolute >= 10000) return `${sign}${(absolute / 10000).toFixed(1)}만`;
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}
export const DashboardProfitTrend = memo(function DashboardProfitTrend({ data: rawData, onSelect }: { data: TrendDatum[]; onSelect?: (index: number) => void }) {
  const clipId = useId().replace(/[^a-zA-Z0-9_]/g, '');
  const data = rawData.map(item => ({ ...item, value: item.value != null && Number.isFinite(item.value) ? item.value : null }));
  if (!data.length) return <Text style={styles.notice}>표시할 기간이 없어요</Text>;
  const known = data.flatMap(item => item.value != null && Number.isFinite(item.value) ? [item.value] : []);
  let low = Math.min(0, ...known), high = Math.max(0, ...known);
  if (low === high) { low -= 1; high += 1; }
  const y = (value: number) => 124 - (value - low) / (high - low) * 108;
  const points = data.map((item, index) => ({ ...item, x: (index + 0.5) * 300 / data.length, y: item.value == null || !Number.isFinite(item.value) ? null : y(item.value) }));
  const segments: TrendPoint[][] = [];
  let current: TrendPoint[] = [];
  for (const point of points) {
    if (point.y == null) { if (current.length) segments.push(current); current = []; }
    else current.push({ x: point.x, y: point.y });
  }
  if (current.length) segments.push(current);
  return <View style={styles.wrap}>
    {!known.length && <Text style={styles.notice}>추세 금액을 확인해주세요</Text>}
    <Svg width="100%" height={140} viewBox="0 0 300 140" accessible={false}>
      <Defs>
        <ClipPath id={`${clipId}-positive`}><Rect x={0} y={0} width={300} height={y(0)} /></ClipPath>
        <ClipPath id={`${clipId}-negative`}><Rect x={0} y={y(0)} width={300} height={140 - y(0)} /></ClipPath>
      </Defs>
      <Line x1={10} x2={290} y1={16} y2={16} stroke={Colors.gray100} />
      <Line x1={10} x2={290} y1={y(0)} y2={y(0)} stroke={Colors.gray300} strokeDasharray="4 4" />
      <SvgText x={2} y={y(0) - 4} fill={Colors.gray500} fontSize={9}>0</SvgText>
      {segments.filter(segment => segment.length > 1).map((segment, index) => {
        const path = smoothTrendPath(segment);
        const flatZero = segment.every(point => Math.abs(point.y - y(0)) < 0.0001);
        return <ViewlessTrend key={index} path={path} flatZero={flatZero} positiveClip={`${clipId}-positive`} negativeClip={`${clipId}-negative`} />;
      })}
      {points.map((point, index) => point.y == null ? null : <Circle key={point.label + index} testID="profit-trend-point" cx={point.x} cy={point.y} r={4.5} fill={point.value! < 0 ? Colors.negative : Colors.primary} stroke={Colors.white} strokeWidth={2} onPress={() => onSelect?.(index)} />)}
    </Svg>
    <View style={styles.labels}>{data.map((item, index) => <Pressable key={item.label + index} accessibilityRole="button" accessibilityLabel={`${item.label} 영업이익 ${item.value == null ? '확인 필요' : `${Math.round(item.value).toLocaleString('ko-KR')}원`}`} disabled={!onSelect} onPress={() => onSelect?.(index)} style={({ pressed }) => [styles.column, pressed && { opacity: 0.6 }]}>
      <NumericText style={[styles.amount, item.value != null && item.value < 0 && { color: Colors.negative }]} numberOfLines={1} adjustsFontSizeToFit>{compact(item.value)}</NumericText>
      <Text style={[styles.label, index === data.length - 1 && styles.last]}>{item.label}</Text>
    </Pressable>)}</View>
    <View style={styles.colorLegend}><View style={[styles.swatch, { backgroundColor: Colors.primary }]} /><Text style={styles.notice}>0원 이상</Text><View style={[styles.swatch, { backgroundColor: Colors.negative }]} /><Text style={styles.notice}>0원 미만</Text></View>
    <Text style={styles.notice}>점선은 0원 기준이에요{data.some(item => item.value == null) ? ' · 확인이 필요한 기간은 선을 연결하지 않아요' : ''}</Text>
  </View>;
});
function ViewlessTrend({ path, flatZero, positiveClip, negativeClip }: { path: string; flatZero: boolean; positiveClip: string; negativeClip: string }) {
  return <>
    <Path testID="profit-trend-line" d={path} fill="none" stroke={Colors.primary} strokeWidth={2.5} strokeLinecap="round" clipPath={flatZero ? undefined : `url(#${positiveClip})`} />
    {!flatZero && <Path testID="profit-trend-negative-line" d={path} fill="none" stroke={Colors.negative} strokeWidth={2.5} strokeLinecap="round" clipPath={`url(#${negativeClip})`} />}
  </>;
}
const styles = StyleSheet.create({
  colorLegend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }, swatch: { width: 14, height: 3, borderRadius: 2, marginLeft: 6 },
  wrap: { width: '100%', gap: 4, paddingTop: 8 }, labels: { flexDirection: 'row' }, column: { flex: 1, minWidth: 0, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 5 },
  amount: { width: '100%', textAlign: 'center', fontSize: 11, fontWeight: '600', color: Colors.gray600 }, label: { fontSize: 12, color: Colors.gray500 }, last: { color: Colors.action, fontWeight: '700' }, notice: { fontSize: 11, color: Colors.gray500, lineHeight: 17 },
});

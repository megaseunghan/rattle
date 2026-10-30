import { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Line, Text as SvgText, G } from 'react-native-svg';
import { NumericText } from './ui/NumericText';
import { Colors } from '../../constants/colors';
import { DashboardMetric, METRIC_LABELS } from '../services/dashboardBreakdown';

export const DashboardProfitRing = memo(function DashboardProfitRing({ revenue, profit, purchase = null, expense = null, labor = null, selected = null, onSelect, onReset }: {
  revenue: number | null; profit: number | null; purchase?: number | null; expense?: number | null; labor?: number | null;
  selected?: DashboardMetric | null; onSelect?: (metric: DashboardMetric) => void; onReset?: () => void;
}) {
  const metrics: { key: DashboardMetric; amount: number | null; color: string }[] = [
    { key: 'revenue', amount: revenue, color: Colors.black }, { key: 'purchase', amount: purchase, color: Colors.primary },
    { key: 'expense', amount: expense, color: Colors.warningStroke }, { key: 'labor', amount: labor, color: Colors.gray600 },
  ];
  const known = revenue != null && profit != null && purchase != null && expense != null && labor != null &&
    [revenue, profit, purchase, expense, labor].every(Number.isFinite) && revenue >= 0 && purchase >= 0 && expense >= 0 && labor >= 0 &&
    Math.abs(purchase + expense + labor + profit - revenue) <= 1;
  const loss = known && profit! < 0;
  const segments = known ? [
    ...metrics.filter(metric => metric.key !== 'revenue').map(metric => ({ ...metric, amount: metric.amount! })),
    { key: 'profit', amount: Math.max(0, profit!), color: Colors.positive },
  ].filter(segment => segment.amount > 0) : [];
  const total = segments.reduce((sum, segment) => sum + segment.amount, 0);
  const margin = revenue != null && revenue > 0 && profit != null ? profit / revenue * 100 : null;
  const centerMetric = selected ? metrics.find(metric => metric.key === selected)! : null;
  const centerTitle = selected ? METRIC_LABELS[selected] : '영업이익';
  const centerAmount = centerMetric ? centerMetric.amount : profit;
  const centerPercent = selected ? revenue != null && revenue > 0 && centerAmount != null ? centerAmount / revenue * 100 : null : margin;
  const centerCaption = selected ? '매출 대비' : '이익률';
  const centerColor = centerPercent == null ? Colors.gray500 : centerPercent < 0 ? Colors.negative : centerMetric ? centerMetric.color : Colors.positive;
  const descriptions: Record<DashboardMetric, string> = {
    revenue: '현금·카드 등 총매출', purchase: '식자재·비품·소모품 매입',
    expense: '고정비·공과금·수수료 등', labor: '직원·파트타이머 세전 급여',
  };
  let angle = -90;
  const arcs = segments.map(segment => {
    const sweep = segment.amount / total * 360;
    const gap = segments.length > 1 ? Math.min(3, sweep * 0.18) : 0;
    const start = angle + gap / 2, end = angle + sweep - gap / 2, mid = angle + sweep / 2;
    angle += sweep;
    const radians = mid * Math.PI / 180;
    return { ...segment, start, end, right: Math.cos(radians) >= 0, x: 160 + 94 * Math.cos(radians), y: 120 + 94 * Math.sin(radians), labelY: 120 + 94 * Math.sin(radians) };
  });
  for (const right of [false, true]) {
    const side = arcs.filter(arc => arc.right === right).sort((a, b) => a.y - b.y);
    side.forEach((arc, i) => { arc.labelY = Math.max(24, arc.y, i ? side[i - 1].labelY + 32 : 24); });
    const overflow = Math.max(0, (side.at(-1)?.labelY ?? 0) - 208);
    side.forEach(arc => { arc.labelY -= overflow; });
  }
  return <View style={styles.wrap}>
    <View style={styles.chart}>
      <Svg width="100%" height={240} viewBox="0 0 320 240">
        <Circle cx={160} cy={120} r={80} fill="none" stroke={Colors.gray100} strokeWidth={26} />
        {arcs.map(segment => {
          const point = (degrees: number) => [160 + 80 * Math.cos(degrees * Math.PI / 180), 120 + 80 * Math.sin(degrees * Math.PI / 180)];
          const [x1, y1] = point(segment.start), [x2, y2] = point(segment.end);
          const press = () => { if (segment.key === 'profit') onReset?.(); else onSelect?.(segment.key as DashboardMetric); };
          const opacity = !selected || selected === 'revenue' || selected === segment.key ? 1 : 0.3;
          const labelX = segment.right ? 266 : 54;
          return <G key={segment.key}>
            {segments.length === 1 ? <Circle testID="profit-donut-segment" cx={160} cy={120} r={80} fill="none" stroke={segment.color} strokeWidth={26} opacity={opacity} onPress={press} /> :
              <Path testID="profit-donut-segment" d={`M ${x1} ${y1} A 80 80 0 ${segment.end - segment.start > 180 ? 1 : 0} 1 ${x2} ${y2}`} fill="none" stroke={segment.color} strokeWidth={26} opacity={opacity} onPress={press} />}
            <Line x1={segment.x} y1={segment.y} x2={segment.right ? 260 : 60} y2={segment.labelY} stroke={segment.color} strokeWidth={1} />
            <SvgText x={labelX} y={segment.labelY - 2} textAnchor={segment.right ? 'start' : 'end'} fontSize={11} fill={Colors.gray600} onPress={press}>{segment.key === 'profit' ? '영업이익' : METRIC_LABELS[segment.key as DashboardMetric]}</SvgText>
            <SvgText accessibilityLabel={`${segment.key === 'profit' ? '영업이익' : METRIC_LABELS[segment.key as DashboardMetric]} 구성비 ${(segment.amount / total * 100).toFixed(1)}%`} x={labelX} y={segment.labelY + 12} textAnchor={segment.right ? 'start' : 'end'} fontSize={10} fill={Colors.gray500} onPress={press}>{`${(segment.amount / total * 100).toFixed(1)}%`}</SvgText>
          </G>;
        })}
      </Svg>
      <View style={styles.center}>
      <Pressable accessibilityRole="button" accessibilityLabel={`도넛 중앙 ${centerTitle} 보기`} disabled={!selected || !onSelect} onPress={() => { if (selected) onSelect?.(selected); }} style={styles.centerMain}>
        <Text style={styles.centerLabel}>{centerTitle}</Text>
        <NumericText style={[styles.centerAmount, !selected && { color: profit == null ? Colors.gray500 : profit < 0 ? Colors.negative : Colors.positive }]} numberOfLines={1} adjustsFontSizeToFit>{centerAmount == null ? '확인 필요' : `${Math.round(centerAmount).toLocaleString('ko-KR')}원`}</NumericText>
        <Text accessibilityLabel={centerPercent == null ? '비율 확인 필요' : `${selected ? `${METRIC_LABELS[selected]} 매출 대비` : '영업이익률'} ${centerPercent.toFixed(1)}%`} style={[styles.margin, { color: centerColor }]}>{centerPercent == null ? `${centerCaption} 확인 필요` : `${centerCaption} ${centerPercent.toFixed(1)}%`}</Text>
      </Pressable>
        {selected !== 'revenue' && <Pressable accessibilityRole="button" accessibilityLabel="도넛 총매출 세부 보기" disabled={!onSelect} onPress={() => onSelect?.('revenue')} style={styles.revenueSummary}>
          <Text style={styles.revenueLabel}>총매출</Text>
          <NumericText style={styles.revenueAmount} numberOfLines={1} adjustsFontSizeToFit>{revenue == null ? '확인 필요' : `${Math.round(revenue).toLocaleString('ko-KR')}원`}</NumericText>
        </Pressable>}
      </View>
    </View>
    {known && profit! > 0 && <Pressable accessibilityRole="button" accessibilityLabel="영업이익 기본 보기" onPress={onReset} disabled={!onReset} style={styles.profitLabel}><View style={[styles.dot, { backgroundColor: Colors.positive }]} /><Text style={styles.text}>영업이익{selected ? ' · 기본 보기' : ''}</Text></Pressable>}
    <View style={styles.legend}>{metrics.map(metric => <Pressable key={metric.key} accessibilityRole="button" accessibilityLabel={`${METRIC_LABELS[metric.key]} 세부 보기`} accessibilityState={{ selected: selected === metric.key, disabled: !onSelect }} disabled={!onSelect} onPress={() => onSelect?.(metric.key)} style={({ pressed }) => [styles.item, selected === metric.key && styles.selected, pressed && { opacity: 0.7 }]}>
      <View style={styles.legendLabel}><View style={[styles.dot, { backgroundColor: metric.color }]} /><Text style={styles.text}>{METRIC_LABELS[metric.key]}</Text><Text style={styles.chevron}>{selected === metric.key ? '−' : '+'}</Text></View>
      <NumericText style={styles.value} numberOfLines={1} adjustsFontSizeToFit>{metric.amount == null ? '확인 필요' : `${Math.round(metric.amount).toLocaleString('ko-KR')}원`}</NumericText>
      <Text style={styles.description}>{descriptions[metric.key]}</Text>
    </Pressable>)}</View>
    <Text style={styles.caption}>{!known ? '금액을 확인하면 구성비를 볼 수 있어요' : total === 0 ? '집계된 매출과 지출이 없어요' : loss ? '적자 상태 · 도넛은 전체 지출 구성으로 표시해요' : '매출 = 매입 + 비용 + 인건비 + 영업이익'}</Text>
  </View>;
});
const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12, paddingTop: 8 }, chart: { width: '100%', height: 240, alignItems: 'center', justifyContent: 'center' },
  centerMain: { width: '100%', alignItems: 'center', gap: 4 },
  revenueSummary: { alignItems: 'center', width: '100%', borderTopWidth: 1, borderTopColor: Colors.gray100, paddingTop: 7, marginTop: 2, gap: 2, minHeight: 40 }, revenueLabel: { fontSize: 10, color: Colors.gray500 }, revenueAmount: { fontSize: 13, fontWeight: '600', color: Colors.black, width: '100%', textAlign: 'center' }, description: { fontSize: 10, color: Colors.gray500, lineHeight: 15 },
  center: { position: 'absolute', width: 124, alignItems: 'center', justifyContent: 'center', gap: 5 }, centerAmount: { fontSize: 20, fontWeight: '700', color: Colors.black, width: '100%', textAlign: 'center' }, centerLabel: { fontSize: 12, color: Colors.gray500 }, margin: { fontSize: 11, color: Colors.positive, fontWeight: '600' },
  profitLabel: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 7 }, profitAmount: { fontSize: 12, fontWeight: '700', color: Colors.positive },
  legend: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, item: { width: '47%', flexGrow: 1, minHeight: 68, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.homeBorder, backgroundColor: Colors.white, gap: 5 }, selected: { backgroundColor: Colors.tinted, borderColor: Colors.primary },
  legendLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 }, dot: { width: 7, height: 7, borderRadius: 4 }, text: { fontSize: 12, color: Colors.gray600 }, chevron: { marginLeft: 'auto', fontSize: 16, color: Colors.gray500 }, value: { fontSize: 15, color: Colors.black, fontWeight: '700' }, caption: { fontSize: 11, color: Colors.gray500, textAlign: 'center', lineHeight: 17 },
});

/* 손익 칸 기간 막대. 고른 막대만 색(영업이익 초록, 나머지 파랑)이고 그 위에 짧은 금액을 보인다. */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../../constants/colors';
import { Fonts } from '../../../../constants/fonts';
import { Type } from '../../../../constants/designTokens';
import type { HomeMetric } from '../../../utils/homeFinancialCard';
import { NumericText } from '../../ui/NumericText';
import { Skeleton, SkeletonGroup } from '../../skeleton';
import { barRatios, shortAmount, wonText, type PeriodBar } from './profitPeriods';
import { METRIC_LABELS } from './metrics';

export const BAR_TRACK = 120;
const SKELETON_HEIGHTS = [0.55, 0.75, 0.66, 0.48, 0.7, 0.8];

interface Props { bars: readonly PeriodBar[]; metric: HomeMetric; selected: number; onSelect: (index: number) => void; loading: boolean }

export function ProfitBars({ bars, metric, selected, onSelect, loading }: Props) {
  const values = bars.map(bar => bar.values?.[metric] ?? null);
  const ratios = barRatios(values);
  return <View style={styles.row} accessibilityRole="list" accessibilityLabel={`${METRIC_LABELS[metric]} 기간별 막대`}>
    {bars.map((bar, index) => {
      const on = index === selected;
      const value = values[index], ratio = ratios[index];
      const color = metric === 'profit' ? (value != null && value < 0 ? Colors.negative : Colors.positive) : Colors.action;
      return <Pressable key={bar.key} accessibilityRole="button" accessibilityState={{ selected: on }}
        accessibilityLabel={`${bar.name} ${METRIC_LABELS[metric]} ${loading ? '불러오는 중' : wonText(value)}`}
        onPress={() => onSelect(index)} style={styles.bar}>
        <NumericText style={styles.value} numberOfLines={1}>{on && !loading ? shortAmount(value) : ''}</NumericText>
        <View style={styles.track}>
          {loading ? <Skeleton height={BAR_TRACK * SKELETON_HEIGHTS[index % SKELETON_HEIGHTS.length]} radius={6} />
            : ratio == null ? <View style={styles.unknown} />
            : <View style={[styles.fill, { height: BAR_TRACK * ratio, backgroundColor: on ? color : Colors.gray200 }]} />}
        </View>
        <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>{bar.label}</Text>
      </Pressable>;
    })}
  </View>;
}

/** 아직 기간 목록을 모를 때(첫 불러오기) 쓰는 자리. 기간 이름은 알 수 없어 비워 둔다. */
export function ProfitBarsSkeleton({ count }: { count: number }) {
  return <SkeletonGroup label="손익을 불러오는 중이에요" style={styles.row}>
    {Array.from({ length: count }, (_, index) => <View key={index} style={styles.bar}>
      <View style={styles.valueSpace} />
      <View style={styles.track}><Skeleton height={BAR_TRACK * SKELETON_HEIGHTS[index % SKELETON_HEIGHTS.length]} radius={6} /></View>
      <View style={styles.labelSpace} />
    </View>)}
  </SkeletonGroup>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 16, paddingTop: 4 },
  bar: { flex: 1, minWidth: 0, minHeight: 44, alignItems: 'stretch', gap: 4 },
  value: { height: 16, fontSize: Type.xs, fontWeight: '600', textAlign: 'center', color: Colors.black },
  valueSpace: { height: 16 },
  track: { height: BAR_TRACK, justifyContent: 'flex-end' },
  fill: { borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  unknown: { height: 4, borderRadius: 2, backgroundColor: Colors.gray100 },
  label: { fontFamily: Fonts.wantedRegular, fontSize: Type.xs, lineHeight: 16, textAlign: 'center', color: Colors.gray500 },
  labelOn: { fontFamily: Fonts.wantedSemiBold, color: Colors.black },
  labelSpace: { height: 16 },
});

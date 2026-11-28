/* 손익 칸 머리글: 기간 이름·금액·비교. 항목을 바꿔도 자리를 지키고 내용만 바꾼다(한 요소를 다시 그림). */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../../constants/colors';
import { Fonts } from '../../../../constants/fonts';
import { Type } from '../../../../constants/designTokens';
import type { HomeMetric } from '../../../utils/homeFinancialCard';
import { NumericText } from '../../ui/NumericText';
import { Skeleton } from '../../skeleton';
import { METRIC_LABELS, PERIOD_LABELS } from './metrics';
import type { Comparison, ProfitPeriod } from './profitPeriods';

interface Props {
  metric: HomeMetric;
  periodName: string;
  amount: number | null;
  /** 매입·인건비·비용의 매출 대비 비율 */
  share: number | null;
  comparison: Comparison | null;
  comparisonLabel: string | null;
  /** 비교할 수 없을 때 보일 문구 */
  missingComparison: string;
  /** 비교 자료를 기다리는 중·불러오지 못함. 기본은 ready */
  comparisonState?: 'loading' | 'error' | 'ready';
  loading: boolean;
  periods: readonly ProfitPeriod[];
  period: ProfitPeriod;
  onPeriod: (period: ProfitPeriod) => void;
}

export function ProfitHead(props: Props) {
  const { metric, periodName, amount, share, loading, periods, period, onPeriod } = props;
  const [reason, setReason] = useState(false);
  const title = `${periodName} ${METRIC_LABELS[metric]}${share != null ? ` · 매출의 ${share}%` : ''}`;
  return <View style={styles.root} accessibilityLiveRegion="polite">
    <View style={styles.top}>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <View style={styles.segment} accessibilityRole="tablist" accessibilityLabel="기간">
        {periods.map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: item === period }}
          hitSlop={{ top: 8, bottom: 8 }} onPress={() => onPeriod(item)} style={[styles.segmentItem, item === period && styles.segmentOn]}>
          <Text style={[styles.segmentText, item === period && styles.segmentTextOn]}>{PERIOD_LABELS[item]}</Text>
        </Pressable>)}
      </View>
    </View>
    {loading ? <><Skeleton width="58%" height={30} style={styles.gapTop} /><Skeleton width="46%" height={14} style={styles.gapCompare} /></>
      : amount == null ? <>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: reason }} onPress={() => setReason(value => !value)} style={styles.unknown}>
          <Text style={styles.unknownText}>확인 필요</Text>
        </Pressable>
        {reason && <Text style={styles.caption}>{metric === 'labor' || metric === 'profit'
          ? '급여 조건과 해당 기간의 급여 내역을 확인해 주세요.' : '이 기간 자료를 다시 불러와 주세요.'}</Text>}
      </> : <>
        <NumericText style={styles.amount}>{metric === 'profit' && amount > 0 ? '+' : amount < 0 ? '−' : ''}{Math.abs(Math.round(amount)).toLocaleString('ko-KR')}<Text style={styles.won}>원</Text></NumericText>
        <ComparisonLine {...props} />
      </>}
  </View>;
}

function ComparisonLine({ comparison, comparisonLabel, missingComparison, comparisonState = 'ready' }: Props) {
  if (comparisonState === 'loading' && comparisonLabel) return <Skeleton width="46%" height={14} style={styles.gapCompare} />;
  if (comparisonState === 'error' && comparisonLabel) return <Text style={[styles.caption, styles.gapCompare]}>비교를 불러오지 못했어요</Text>;
  if (!comparison || !comparisonLabel) return <Text style={[styles.caption, styles.gapCompare]}>{comparisonLabel ? missingComparison : '비교할 앞 기간이 없어요'}</Text>;
  const tone = comparison.favorable ? styles.good : styles.bad;
  const up = comparison.delta >= 0;
  return <View style={[styles.compare, styles.gapCompare]}>
    <NumericText style={[styles.delta, tone]}>{up ? '+' : '−'}{Math.abs(Math.round(comparison.delta)).toLocaleString('ko-KR')}원</NumericText>
    {comparison.percent != null && <NumericText style={[styles.chip, comparison.favorable ? styles.chipGood : styles.chipBad]}>
      {up ? '▲' : '▼'} {comparison.percent.toFixed(1)}%</NumericText>}
    <Text style={styles.caption}>{comparisonLabel}</Text>
  </View>;
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 20, paddingTop: 18, minHeight: 112 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flexShrink: 1, fontFamily: Fonts.wantedRegular, fontSize: Type.base, color: Colors.gray500 },
  segment: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: 999, backgroundColor: Colors.gray100 },
  segmentItem: { minHeight: 28, minWidth: 40, paddingHorizontal: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: Colors.white },
  segmentText: { fontFamily: Fonts.wantedRegular, fontSize: 12, color: Colors.gray600 },
  segmentTextOn: { fontFamily: Fonts.wantedSemiBold, color: Colors.black },
  amount: { marginTop: 2, fontSize: 30, fontWeight: '600', lineHeight: 38, letterSpacing: -0.8, color: Colors.black },
  won: { fontFamily: Fonts.wantedMedium, fontSize: Type.lg },
  compare: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  delta: { fontSize: Type.sm, fontWeight: '600' },
  good: { color: Colors.positive }, bad: { color: Colors.negative },
  chip: { fontSize: 12, fontWeight: '600', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  chipGood: { color: Colors.positive, backgroundColor: Colors.positiveBg }, chipBad: { color: Colors.negative, backgroundColor: Colors.negativeBg },
  caption: { fontFamily: Fonts.wantedRegular, fontSize: Type.sm, color: Colors.gray500 },
  unknown: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  unknownText: { fontFamily: Fonts.wantedRegular, fontSize: 25, color: Colors.gray600, textDecorationLine: 'underline' },
  gapTop: { marginTop: 8 }, gapCompare: { marginTop: 6 },
});

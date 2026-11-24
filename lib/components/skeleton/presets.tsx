/* 화면에서 반복되는 모양(바로가기 카드 목록·목록 행·요약 카드)을 자리 표시로 미리 그린다.
   실제 화면의 카드 높이·간격과 맞춰 자료가 도착해도 배치가 흔들리지 않게 한다. */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Skeleton, SkeletonGroup } from './Skeleton';

const LINE_WIDTHS = ['46%', '58%', '40%', '52%', '36%', '62%'] as const;
const lineWidth = (index: number) => LINE_WIDTHS[index % LINE_WIDTHS.length];

interface BaseProps { label: string; style?: StyleProp<ViewStyle>; }

interface CardListProps extends BaseProps { count: number; }
/** 그림 + 제목 + 상태 한 줄로 된 카드 목록(홈 바로가기, 레시피, 청소 등). */
export function SkeletonCardList({ count, label, style }: CardListProps) {
  return <SkeletonGroup label={label} style={[styles.list, style]}>
    {Array.from({ length: count }, (_, i) => <View key={i} testID="skeleton-card-row" style={styles.cardRow}>
      <Skeleton width={48} height={48} radius={14} />
      <View style={styles.text}><Skeleton width={lineWidth(i)} height={14} /><Skeleton width="30%" height={10} radius={6} /></View>
    </View>)}
  </SkeletonGroup>;
}

interface RowsProps extends BaseProps { count: number; avatar?: boolean; trailing?: boolean; card?: boolean; }
/** 한 카드 안에 구분선으로 나뉜 목록 행(매입·재고·알림·요청 등). */
export function SkeletonRows({ count, label, style, avatar = true, trailing = true, card = true }: RowsProps) {
  return <SkeletonGroup label={label} style={[card && styles.card, style]}>
    {Array.from({ length: count }, (_, i) => <View key={i} testID="skeleton-row" style={[styles.row, i > 0 && styles.divider]}>
      {avatar && <Skeleton width={40} height={40} radius={12} />}
      <View style={styles.text}><Skeleton width={lineWidth(i + 1)} height={14} /><Skeleton width="38%" height={10} radius={6} /></View>
      {trailing && <Skeleton width={72} height={14} />}
    </View>)}
  </SkeletonGroup>;
}

interface SummaryProps extends BaseProps { metrics?: number; }
/** 큰 금액 하나와 2열 보조 지표로 된 요약 카드(손익·급여·매출 요약). */
export function SkeletonSummary({ label, style, metrics = 0 }: SummaryProps) {
  return <SkeletonGroup label={label} style={[styles.card, styles.summary, style]}>
    <Skeleton width="34%" height={12} radius={6} />
    <Skeleton width="60%" height={30} style={styles.amount} />
    {metrics > 0 && <View style={styles.grid}>
      {Array.from({ length: metrics }, (_, i) => <View key={i} testID="skeleton-metric" style={styles.metric}>
        <Skeleton width="44%" height={10} radius={6} /><Skeleton width="80%" height={20} />
      </View>)}
    </View>}
  </SkeletonGroup>;
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  card: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.homeBorder, borderRadius: 20, overflow: 'hidden' },
  cardRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5, paddingLeft: 8, paddingRight: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.homeBorder, borderRadius: 15 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  divider: { borderTopWidth: 1, borderTopColor: Colors.hairline },
  text: { flex: 1, gap: 7 },
  summary: { padding: 18, borderRadius: 24 },
  amount: { marginTop: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, rowGap: 16 },
  metric: { width: '50%', gap: 7, paddingRight: 12 },
});

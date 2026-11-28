/* 손익 칸 아래 세부: 최대 3행 + '그 외', 이름 뒤 회색 비율 칩(가장 큰 항목만 연파랑), 금액은 오른쪽 끝. */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '../../../../constants/colors';
import { Fonts } from '../../../../constants/fonts';
import { Type } from '../../../../constants/designTokens';
import { AppIcon } from '../../../icons/AppIcon';
import { NumericText } from '../../ui/NumericText';
import { Skeleton, SkeletonGroup } from '../../skeleton';
import type { Breakdown } from './profitBreakdown';
import { wonText } from './profitPeriods';

type Props =
  | { kind: 'ready'; breakdown: Breakdown; periodName: string }
  | { kind: 'loading' }
  | { kind: 'error'; onRetry: () => void }
  | { kind: 'unavailable'; message: string };

export function ProfitDetail(props: Props) {
  return <View style={styles.root}>
    {props.kind === 'loading' && <SkeletonGroup label="세부 항목을 불러오는 중이에요" style={styles.list}>
      {[0, 1, 2].map(index => <View key={index} style={styles.line}><Skeleton width="34%" height={14} /><Skeleton width="30%" height={14} /></View>)}
    </SkeletonGroup>}
    {props.kind === 'error' && <View style={styles.notice}>
      <AppIcon name="information-circle-outline" size={16} color={Colors.gray500} accessible={false} />
      <Text style={styles.noticeText}>세부 항목을 불러오지 못했어요</Text>
      <Pressable accessibilityRole="button" onPress={props.onRetry} style={styles.textButton}><Text style={styles.action}>다시 시도</Text></Pressable>
    </View>}
    {props.kind === 'unavailable' && <Text style={styles.caption}>{props.message}</Text>}
    {props.kind === 'ready' && <>
      {props.breakdown.lines.length ? <View style={styles.list} accessibilityRole="list">
        {props.breakdown.lines.map(line => <View key={line.label} style={styles.line} accessible
          accessibilityLabel={`${line.label} ${wonText(line.amount)}${line.percent != null ? `, ${line.percent}%` : ''}`}>
          <View style={styles.name}>
            <Text style={styles.label} numberOfLines={1}>{line.label}</Text>
            {line.percent != null && <NumericText style={[styles.chip, line.top && styles.chipTop]}>{line.percent}%</NumericText>}
          </View>
          <NumericText style={styles.amount}>{wonText(line.amount)}</NumericText>
        </View>)}
      </View> : <Text style={styles.caption}>이 기간에 나눌 자료가 없어요</Text>}
      <View style={styles.foot}>
        <Text style={styles.caption}>{props.periodName} · {props.breakdown.basis}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="손익 자세히 보기" onPress={() => router.push('/profit-loss')}
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
          <Text style={styles.action}>자세히 보기</Text><AppIcon name="chevron-forward" size={14} color={Colors.action} accessible={false} />
        </Pressable>
      </View>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  root: { borderTopWidth: 1, borderTopColor: Colors.hairline, marginTop: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  list: { gap: 2 },
  line: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  name: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { flexShrink: 1, fontFamily: Fonts.wantedMedium, fontSize: Type.base, color: Colors.gray800 },
  chip: { fontSize: 11, fontWeight: '600', color: Colors.gray600, backgroundColor: Colors.gray100, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, overflow: 'hidden' },
  chipTop: { color: Colors.action, backgroundColor: Colors.bg },
  amount: { fontSize: Type.base, fontWeight: '600', color: Colors.black, textAlign: 'right' },
  foot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  caption: { flexShrink: 1, fontFamily: Fonts.wantedRegular, fontSize: 12, color: Colors.gray500, paddingVertical: 8 },
  more: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 },
  action: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.sm, color: Colors.action },
  textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  notice: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingLeft: 12, borderRadius: 12, backgroundColor: Colors.contextBg },
  noticeText: { flexGrow: 1, flexShrink: 1, fontFamily: Fonts.wantedRegular, fontSize: Type.sm, color: Colors.gray600 },
  pressed: { opacity: 0.65 },
});

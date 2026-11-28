/* design-system: DESIGN.md — S54 달 넘기기와 탭(지급 대기 / 지급 완료 / 명단). */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Radius, Type } from '../../../constants/designTokens';
import { AppIcon } from '../../icons/AppIcon';
import { NumericText } from '../ui/NumericText';
import { monthLabel } from './format';

export type LedgerTab = 'pending' | 'paid' | 'roster';

interface LedgerHeaderProps {
  yearMonth: string;
  canNext: boolean;
  onMonth: (delta: number) => void;
  tab: LedgerTab;
  counts: Record<LedgerTab, number>;
  onTab: (tab: LedgerTab) => void;
}

const TABS: { value: LedgerTab; label: string }[] = [
  { value: 'pending', label: '지급 대기' }, { value: 'paid', label: '지급 완료' }, { value: 'roster', label: '명단' },
];

export function LedgerHeader({ yearMonth, canNext, onMonth, tab, counts, onTab }: LedgerHeaderProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.month}>
        <Pressable accessibilityRole="button" accessibilityLabel="이전 달" onPress={() => onMonth(-1)} style={styles.nav}>
          <AppIcon name="chevron-back" size={16} color={Colors.gray600} />
        </Pressable>
        <Text style={styles.monthText} accessibilityRole="header">{monthLabel(yearMonth)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="다음 달" accessibilityState={{ disabled: !canNext }} disabled={!canNext}
          onPress={() => onMonth(1)} style={[styles.nav, !canNext && styles.off]}>
          <AppIcon name="chevron-forward" size={16} color={Colors.gray600} />
        </Pressable>
      </View>
      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map(item => {
          const selected = item.value === tab;
          return (
            <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={`${item.label} ${counts[item.value]}`}
              onPress={() => onTab(item.value)} style={[styles.tab, selected && styles.tabOn]}>
              <Text style={[styles.tabText, selected && styles.tabTextOn]} numberOfLines={1}>{item.label} </Text>
              <NumericText style={[styles.count, selected && styles.tabTextOn]}>{counts[item.value]}</NumericText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  month: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: -12 },
  nav: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.3 },
  monthText: { fontSize: Type.md + 1, fontWeight: '700', color: Colors.black },
  tabs: { flexDirection: 'row', backgroundColor: Colors.segmentTrack, borderRadius: Radius.md, padding: 4, gap: 4 },
  tab: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm + 2 },
  tabOn: { backgroundColor: Colors.white },
  tabText: { fontSize: Type.base, fontWeight: '600', color: Colors.gray500, flexShrink: 1 },
  tabTextOn: { color: Colors.black, fontWeight: '700' },
  count: { fontSize: Type.xs + 1, fontWeight: '600', color: Colors.gray500 },
});

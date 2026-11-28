/* S04 홈 칸 제목 + 오른쪽 글자 탭(2026-11-27 확정 시안). 좁은 폭에서는 탭이 제목 아래로 내려간다. */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { Type } from '../../../constants/designTokens';
import { NumericText } from '../ui/NumericText';
import { Skeleton } from '../skeleton';

export interface SectionTab<T extends string> { id: T; label: string; count?: number | null }
interface Props<T extends string> {
  title: string;
  tabs?: readonly SectionTab<T>[];
  selected?: T;
  onSelect?: (id: T) => void;
  tabsLabel?: string;
}

export function HomeSectionHeader<T extends string>({ title, tabs, selected, onSelect, tabsLabel }: Props<T>) {
  return <View style={styles.row}>
    <Text style={styles.title} accessibilityRole="header">{title}</Text>
    {!!tabs?.length && <View style={styles.tabs} accessibilityRole="tablist" accessibilityLabel={tabsLabel}>
      {tabs.map(tab => {
        const on = tab.id === selected;
        return <Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{ selected: on }}
          accessibilityLabel={tab.count == null ? tab.label : `${tab.label} ${tab.count}명`}
          onPress={() => onSelect?.(tab.id)} style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
          <Text style={[styles.tabLabel, on && styles.tabOn]}>{tab.label}</Text>
          {tab.count === null && <Skeleton width={10} height={12} radius={4} />}
          {typeof tab.count === 'number' && <NumericText style={styles.count}>{tab.count}</NumericText>}
        </Pressable>;
      })}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, minHeight: 44, marginTop: 6 },
  title: { fontFamily: Fonts.wantedBold, fontSize: Type.xl, lineHeight: 28, color: Colors.black },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, marginLeft: 'auto' },
  tab: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 3 },
  tabLabel: { fontFamily: Fonts.wantedMedium, fontSize: Type.md, color: Colors.gray500 },
  tabOn: { fontFamily: Fonts.wantedBold, color: Colors.black },
  count: { fontSize: 12, fontWeight: '500', color: Colors.gray500 },
  pressed: { opacity: 0.65 },
});

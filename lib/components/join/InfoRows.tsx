/* design-system: DESIGN.md — 합류 승인·직원 정보(S05)의 '줄 + 아래 시트' 줄. 누르면 그 항목의 시트를 연다. */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../../icons/AppIcon';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { Type } from '../../../constants/designTokens';

export function RowGroup({ title, children }: { title: string; children: ReactNode }) {
  return <View style={styles.group}>
    <Text style={styles.groupTitle} accessibilityRole="header">{title}</Text>
    {children}
  </View>;
}

export type RowTone = 'normal' | 'ask' | 'none';

export interface InfoRowProps {
  label: string;
  value: string;
  /** 직원이 고른 값 표시('직원이 고름', '직원이 잘 모르겠대요') */
  tag?: string;
  /** 시안 join-v9: 직원이 고른 값은 연파랑, 잘 모르겠다고 한 값은 회색 꼬리표 */
  tagTone?: 'chosen' | 'unsure';
  /** ask: 정해야 하는 값(행동 색), none: 아직 안 정한 값(회색) */
  tone?: RowTone;
  numeric?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}

export function InfoRow({ label, value, tag, tagTone = 'unsure', tone = 'normal', numeric = false, onPress, disabled }: InfoRowProps) {
  const pressable = !!onPress && !disabled;
  return <Pressable accessibilityRole={pressable ? 'button' : undefined} disabled={!pressable} onPress={onPress}
    accessibilityLabel={`${label}${tag ? `, ${tag}` : ''}, ${value}`} accessibilityHint={pressable ? '눌러서 바꿀 수 있어요' : undefined}
    style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.labelWrap}>
      <Text style={styles.label}>{label}</Text>
      {!!tag && <Text style={[styles.tag, tagTone === 'chosen' && styles.tagChosen]}>{tag}</Text>}
    </View>
    <View style={styles.valueWrap}>
      <Text style={[styles.value, numeric && styles.numeric, tone === 'ask' && styles.ask, tone === 'none' && styles.none, !pressable && styles.fixed]}
        numberOfLines={2}>{value}</Text>
      {pressable && <AppIcon name="chevron-forward" size={16} color={Colors.gray500} />}
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  group: { marginTop: 20 },
  groupTitle: { fontFamily: Fonts.wantedMedium, fontSize: Type.sm, color: Colors.gray500, marginBottom: 2 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray200, paddingVertical: 10 },
  pressed: { opacity: 0.6 },
  labelWrap: { flexShrink: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  label: { fontFamily: Fonts.wantedRegular, fontSize: Type.md, color: Colors.gray700 },
  tag: { fontFamily: Fonts.wantedMedium, fontSize: Type.xs, color: Colors.gray600, backgroundColor: Colors.chipBg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  tagChosen: { color: Colors.action, backgroundColor: Colors.tinted },
  valueWrap: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  value: { flexShrink: 1, textAlign: 'right', fontFamily: Fonts.wantedSemiBold, fontSize: Type.md, color: Colors.black },
  numeric: { fontFamily: Fonts.geistSemiBold, fontVariant: ['tabular-nums'] },
  ask: { color: Colors.action },
  none: { fontFamily: Fonts.wantedRegular, color: Colors.gray500 },
  fixed: { fontFamily: Fonts.wantedRegular, color: Colors.gray600 },
});

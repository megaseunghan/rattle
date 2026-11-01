import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Spacing, Type } from '../../../constants/designTokens';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
  /** 이미 좌우 padding이 있는 컨테이너(예: ScrollView contentContainerStyle) 안에서 쓸 때 true로 설정해 이중 여백을 방지한다 */
  insetHorizontalPadding?: boolean;
}

export function SectionHeader({ title, actionLabel, onActionPress, insetHorizontalPadding = true }: SectionHeaderProps) {
  return (
    <View style={[styles.container, !insetHorizontalPadding && styles.containerNoInset]}>
      <Text style={styles.title}>{title}</Text>
      {actionLabel && (
        <Pressable accessibilityRole="button" onPress={onActionPress} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
          <Text style={styles.action}>{actionLabel} ›</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: Spacing.sectionTop,
    paddingHorizontal: Spacing.screenX,
    paddingBottom: Spacing.sectionHeaderGap,
  },
  containerNoInset: {
    paddingHorizontal: 0,
  },
  title: {
    flex: 1,
    fontSize: Type.md,
    fontWeight: '700',
    color: Colors.black,
  },
  actionButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 1 },
  pressed: { opacity: 0.7 },
  action: {
    fontSize: Type.xs + 1,
    fontWeight: '700',
    color: Colors.action,
  },
});

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
        <Pressable onPress={onActionPress} hitSlop={8}>
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
    paddingTop: Spacing.sectionTop,
    paddingHorizontal: Spacing.screenX,
    paddingBottom: Spacing.sectionHeaderGap,
  },
  containerNoInset: {
    paddingHorizontal: 0,
  },
  title: {
    fontSize: Type.md,
    fontWeight: '700',
    color: Colors.black,
  },
  action: {
    fontSize: Type.xs + 1,
    fontWeight: '700',
    color: Colors.primary,
  },
});

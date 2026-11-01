import { AppIcon } from '../../icons/AppIcon';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Illustration, type IllustrationName } from '../../icons/Illustration';
import { Colors } from '../../../constants/colors';

interface EmptyStateProps {
  icon: keyof typeof AppIcon.glyphMap;
  title: string;
  illustration?: IllustrationName | null;
  description?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
}

export function EmptyState({ icon, title, description, ctaLabel, onCtaPress, illustration = 'empty-data' }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        {illustration ? <Illustration name={illustration} size={72} /> : <AppIcon name={icon} size={18} color={Colors.gray400} />}
        <Text style={styles.title}>{title}</Text>
      </View>
      {description && <Text style={styles.description}>{description}</Text>}
      {ctaLabel && onCtaPress && (
        <Pressable
          onPress={onCtaPress}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaText}>{ctaLabel}</Text>
          <AppIcon name="arrow-forward" size={16} color={Colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.black,
  },
  description: {
    fontSize: 13,
    color: Colors.gray500,
    marginTop: 8,
    lineHeight: 20,
  },
  cta: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 8,
  },
  ctaPressed: { opacity: 0.65 },
  ctaText: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: Colors.primary },
});

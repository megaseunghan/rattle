import { StyleSheet, Text, View } from 'react-native';
import { BadgeColors, BadgeStyle, BadgeTextStyle, BadgeVariant } from '../../../constants/designTokens';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

export function Badge({ label, variant = 'neutral' }: BadgeProps) {
  const colors = BadgeColors[variant];
  const isAuto = variant === 'auto';

  return (
    <View style={[styles.base, { backgroundColor: colors.bg }, isAuto && styles.autoBase]}>
      <Text style={[styles.text, { color: colors.text }, isAuto && styles.autoText]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    ...BadgeStyle,
  },
  autoBase: {
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  text: {
    ...BadgeTextStyle,
  },
  autoText: {
    fontSize: 10,
    fontWeight: '700',
  },
});

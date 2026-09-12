import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Radius, Type } from '../../../constants/designTokens';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'text' | 'pill' | 'kakao';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
}

export function Button({ label, onPress, variant = 'primary', disabled = false, loading = false }: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        isDisabled && variant === 'primary' && styles.primaryDisabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={loadingIndicatorColor[variant]} />
      ) : (
        <Text style={[textStyles[variant], isDisabled && variant === 'primary' && styles.primaryDisabledText]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  primaryDisabled: {
    backgroundColor: Colors.gray200,
  },
  primaryDisabledText: {
    color: Colors.gray500,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.field,
    paddingVertical: 15,
    width: '100%',
  },
  secondary: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: Radius.field,
    paddingVertical: 15,
    width: '100%',
  },
  danger: {
    borderWidth: 1.5,
    borderColor: Colors.negative,
    borderRadius: Radius.field,
    paddingVertical: 15,
    width: '100%',
  },
  kakao: {
    flexDirection: 'row',
    backgroundColor: Colors.kakao.bg,
    borderRadius: Radius.field,
    paddingVertical: 15,
    width: '100%',
  },
  text: {
    paddingVertical: 10,
  },
  pill: {
    backgroundColor: Colors.tinted,
    borderRadius: Radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 18,
    alignSelf: 'flex-start',
  },
});

const textStyles = StyleSheet.create({
  primary: {
    fontSize: Type.md,
    fontWeight: '700',
    color: Colors.white,
  },
  secondary: {
    fontSize: Type.base,
    fontWeight: '700',
    color: Colors.gray600,
  },
  danger: {
    fontSize: Type.base,
    fontWeight: '700',
    color: Colors.negative,
  },
  kakao: {
    fontSize: Type.md,
    fontWeight: '700',
    color: Colors.kakao.text,
  },
  text: {
    fontSize: Type.sm,
    fontWeight: '600',
    color: Colors.gray500,
    textAlign: 'center',
  },
  pill: {
    fontSize: Type.sm,
    fontWeight: '600',
    color: Colors.primary,
  },
});

const loadingIndicatorColor: Record<ButtonVariant, string> = {
  primary: Colors.white,
  secondary: Colors.primary,
  danger: Colors.negative,
  kakao: Colors.kakao.text,
  text: Colors.gray500,
  pill: Colors.primary,
};

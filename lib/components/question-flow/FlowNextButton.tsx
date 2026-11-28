/* design-system: DESIGN.md — 하단 고정 행동 버튼(높이 56). 꺼지면 gray100 바탕·gray400 글자. */
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Radius } from '../../../constants/designTokens';

export interface FlowNextButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export function FlowNextButton({ label, onPress, disabled, loading }: FlowNextButtonProps) {
  const off = !!disabled || !!loading;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: off, busy: !!loading }}
    disabled={off} onPress={off ? undefined : onPress}
    style={({ pressed }) => [styles.button, !!disabled && !loading && styles.off, pressed && styles.pressed]}>
    <Text accessible={false} style={[styles.label, !!disabled && !loading && styles.labelOff, loading && styles.hidden]}>{label}</Text>
    {loading && <ActivityIndicator style={styles.spinner} color={Colors.white} />}
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minHeight: 56, borderRadius: Radius.xl, backgroundColor: Colors.action, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  off: { backgroundColor: Colors.gray100 },
  pressed: { opacity: 0.92 },
  label: { fontSize: 17, fontWeight: '700', color: Colors.white, textAlign: 'center' },
  labelOff: { color: Colors.gray400 },
  hidden: { opacity: 0 },
  spinner: { position: 'absolute' },
});

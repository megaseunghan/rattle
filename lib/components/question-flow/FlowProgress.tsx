/* design-system: DESIGN.md — 끊김 없는 한 줄 진행 막대(gray100 트랙 + Colors.action 채움). */
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { useReduceMotion } from './useReduceMotion';

const FILL_MS = 350;

export function FlowProgress({ step, total, label }: { step: number; total: number; label: string }) {
  const reduce = useReduceMotion();
  const ratio = total > 0 ? Math.min(1, Math.max(0, step / total)) : 0;
  const value = useRef(new Animated.Value(ratio)).current;
  useEffect(() => {
    if (reduce) { value.setValue(ratio); return; }
    const animation = Animated.timing(value, {
      toValue: ratio, duration: FILL_MS, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [ratio, reduce, value]);
  return <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel={label}
    accessibilityValue={{ min: 1, max: total, now: step }}>
    <Animated.View style={[styles.fill, { transform: [{ scaleX: value }] }]} />
  </View>;
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, backgroundColor: Colors.gray100, overflow: 'hidden', marginTop: 4 },
  fill: { height: 4, width: '100%', borderRadius: 2, backgroundColor: Colors.action, transformOrigin: 'left' },
});

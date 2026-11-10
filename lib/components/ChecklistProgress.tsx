import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';

/** Only render for a known, non-empty checklist. Unknown data is not 0%. */
export function ChecklistProgress({ done, total, scopeKey, compact = false }: {
  done: number; total: number; scopeKey: string; compact?: boolean;
}) {
  const target = total > 0 ? Math.round(Math.max(0, Math.min(done, total)) / total * 100) : 0;
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(target)).current;
  const scope = useRef(scopeKey);
  const [display, setDisplay] = useState({ scopeKey, percent: target });
  useEffect(() => {
    const listener = value.addListener(({ value: next }) => setDisplay({ scopeKey: scope.current, percent: Math.round(next) }));
    return () => { value.stopAnimation(); value.removeListener(listener); };
  }, [value]);
  useEffect(() => {
    value.stopAnimation();
    if (scope.current !== scopeKey || reduced) {
      scope.current = scopeKey; value.setValue(target); setDisplay({ scopeKey, percent: target });
    } else {
      Animated.timing(value, { toValue: target, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    }
    return () => value.stopAnimation();
  }, [target, scopeKey, reduced, value]);
  if (total <= 0) return null;
  const percent = display.scopeKey === scopeKey ? display.percent : target;
  return <View style={styles.root} accessible accessibilityRole="progressbar" accessibilityLabel="체크 완료율"
    accessibilityValue={{ min: 0, max: 100, now: target, text: `${target}% 완료` }}>
    <View style={[styles.track, compact && styles.compact]} accessible={false}>
      <Animated.View style={[styles.fill, { width: value.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp' }) }]} />
    </View>
    <Text style={styles.text} accessible={false}>{percent}% 완료</Text>
  </View>;
}
const styles = StyleSheet.create({
  root: { minHeight: 20, flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { width: 96, height: 4, borderRadius: 3, overflow: 'hidden', backgroundColor: Colors.homeBorder },
  compact: { width: 64 }, fill: { height: 4, borderRadius: 3, backgroundColor: Colors.action },
  text: { color: Colors.gray600, fontFamily: Fonts.wantedRegular, fontSize: 11, lineHeight: 16, fontVariant: ['tabular-nums'] },
});

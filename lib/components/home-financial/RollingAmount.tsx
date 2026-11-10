import { useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Fonts } from '../../../constants/fonts';
import { won } from '../../utils/homeFinancialCard';
function Digit({ value, color, size, reduced }: { value: string; color: string; size: number; reduced: boolean }) {
  const previous = useRef(value), progress = useRef(new Animated.Value(1)).current;
  const [outgoing, setOutgoing] = useState(value);
  const line = size * 1.3;
  useLayoutEffect(() => {
    progress.stopAnimation();
    setOutgoing(previous.current);
    const changed = previous.current !== value;
    previous.current = value;
    if (reduced || !changed) { progress.setValue(1); return; }
    progress.setValue(0);
    const motion = Animated.timing(progress, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    motion.start();
    return () => motion.stop();
  }, [value, reduced, progress]);
  return <View style={{ width: size * 0.64, height: line, overflow: 'hidden' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Animated.Text style={[styles.digit, { color, fontSize: size, lineHeight: line, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -line] }) }] }]}>{outgoing}</Animated.Text>
    <Animated.Text style={[styles.digit, { color, fontSize: size, lineHeight: line, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [line, 0] }) }] }]}>{value}</Animated.Text>
  </View>;
}
export function RollingAmount({ value, color, size = 28, reduced }: { value: number; color: string; size?: number; reduced: boolean }) {
  const text = won(value);
  return <View accessible accessibilityRole="text" accessibilityLabel={text} style={styles.row}>
    {[...text].map((char, index) => /\d/.test(char)
      ? <Digit key={index} value={char} color={color} size={size} reduced={reduced} />
      : <Text key={index} accessible={false} style={{ color, fontSize: size, lineHeight: size * 1.3, fontFamily: Fonts.geistBold }}>{char}</Text>)}
  </View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', minHeight: 40 }, digit: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: Fonts.geistBold, fontVariant: ['tabular-nums'] } });

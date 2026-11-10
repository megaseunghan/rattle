import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutRectangle, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useReducedTransparency } from '../../hooks/useReducedTransparency';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { HOME_METRICS, type HomeMetric } from '../../utils/homeFinancialCard';
import { financialTheme, metricLabels } from './theme';
export function MetricChips({ selected, onSelect, reduced }: { selected: HomeMetric; onSelect: (key: HomeMetric) => void; reduced: boolean }) {
  const opaque = useReducedTransparency();
  const [layouts, setLayouts] = useState<Partial<Record<HomeMetric, LayoutRectangle>>>({});
  const left = useRef(new Animated.Value(0)).current, width = useRef(new Animated.Value(0)).current;
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  // Geometry observers also clip white labels to the moving fill, including intermediate frames.
  useEffect(() => {
    let x = 0, w = 0;
    const a = left.addListener(({ value }) => { x = value; setIndicator({ left: x, width: w }); });
    const b = width.addListener(({ value }) => { w = value; setIndicator({ left: x, width: w }); });
    return () => { left.removeListener(a); width.removeListener(b); };
  }, [left, width]);
  useEffect(() => {
    const target = layouts[selected]; if (!target) return;
    const motion = Animated.parallel([
      Animated.timing(left, { toValue: target.x, duration: reduced ? 0 : 240, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(width, { toValue: target.width, duration: reduced ? 0 : 240, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    ]);
    motion.start(); return () => motion.stop();
  }, [selected, layouts, reduced, left, width]);
  return <View style={styles.row}>
    {HOME_METRICS.map(key => { const layout = layouts[key]; return layout && <View key={key} pointerEvents="none" style={[styles.glass, { position: 'absolute', left: layout.x, top: 0, width: layout.width, height: 44, overflow: 'hidden' }]}>{!opaque && <BlurView intensity={12} tint="light" style={StyleSheet.absoluteFill} />}</View>; })}
    <Animated.View pointerEvents="none" style={[styles.indicator, { left, width, backgroundColor: financialTheme[selected] }]} />
    {HOME_METRICS.map(key => {
      const layout = layouts[key];
      const clipLeft = layout ? Math.max(0, indicator.left - layout.x) : 0;
      const clipRight = layout ? Math.min(layout.width, indicator.left + indicator.width - layout.x) : 0;
      return <Pressable key={key} accessibilityRole="button" accessibilityLabel={metricLabels[key]} accessibilityState={{ selected: selected === key }} onPress={() => onSelect(key)}
        onLayout={({ nativeEvent: { layout: next } }) => setLayouts(previous => previous[key]?.x === next.x && previous[key]?.width === next.width ? previous : { ...previous, [key]: next })}
        style={({ pressed }) => [styles.chip, pressed && { opacity: 0.85 }]}>
        <Text style={[styles.label, { color: selected === key ? financialTheme[key] : Colors.gray600, fontFamily: selected === key ? Fonts.wantedBold : Fonts.wantedRegular }]}>{metricLabels[key]}</Text>
        {layout && clipRight > clipLeft && <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: clipLeft, width: clipRight - clipLeft, top: 0, height: 44, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: -clipLeft, width: layout.width, height: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={[styles.label, { color: Colors.white, fontFamily: selected === key ? Fonts.wantedBold : Fonts.wantedRegular }]}>{metricLabels[key]}</Text></View>
        </View>}
      </Pressable>;
    })}
  </View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 4, marginTop: 8, position: 'relative' }, indicator: { position: 'absolute', top: 0, height: 44, borderRadius: 999 }, chip: { flexGrow: 1, minWidth: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, overflow: 'hidden' }, glass: { backgroundColor: financialTheme.chip, borderRadius: 999 }, label: { fontSize: 12 } });

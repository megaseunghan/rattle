import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';

const corners = 'M1 60V20Q1 1 20 1H60M220 1H260Q279 1 279 20V60M279 220V260Q279 279 260 279H220M60 279H20Q1 279 1 260V220';
const edges = ['top', 'right', 'bottom', 'left'] as const;
const native = { useNativeDriver: true, isInteraction: false };
type Phase = 'waiting' | 'checking' | 'result';

// Keep the native interpolation nodes attached when a response freezes the cycle.
const CheckingEdges = memo(function CheckingEdges({ cycle }: { cycle: Animated.Value }) {
  return <>{edges.map((side, index) => {
    const start = index / 4;
    const tick = cycle.interpolate({
      inputRange: [start - 0.001, start, start + 0.18, start + 0.25],
      outputRange: [0, 1, 1, 0], extrapolate: 'clamp',
    });
    return <Animated.View key={side} style={[s.edge, index % 2 === 0 ? s.horizontal : s.vertical, {
      [side]: 0, opacity: tick.interpolate({ inputRange: [0, 1], outputRange: [0.08, 1] }),
      transform: [{ scale: tick.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }) }],
    }]} />;
  })}</>;
});

export function ScannerFrame({ size, top, left, color, phase, symbol, staticFrame }: {
  size: number; top: number; left: number; color: string; phase: Phase; symbol: string; staticFrame: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const cycle = useRef(new Animated.Value(0)).current;
  const edgesVisible = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const edgeOpacity = useMemo(() => Animated.multiply(
    edgesVisible, reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
  ), [edgesVisible, reveal]);

  useLayoutEffect(() => {
    if (staticFrame || phase === 'waiting') {
      edgesVisible.setValue(0);
      scale.setValue(phase === 'checking' ? 0.88 : 1);
      reveal.setValue(phase === 'result' ? 1 : 0);
      return;
    }
    if (phase === 'checking') {
      let active = true;
      edgesVisible.setValue(0);
      cycle.setValue(0);
      reveal.setValue(0);
      const lock = Animated.timing(scale, { ...native, toValue: 0.88, duration: 120, easing: Easing.out(Easing.ease) });
      const ticks = Animated.loop(Animated.timing(cycle, { ...native, toValue: 1, duration: 1200, easing: Easing.linear }));
      lock.start(({ finished }) => {
        if (!active || !finished) return;
        edgesVisible.setValue(1);
        ticks.start();
      });
      return () => { active = false; lock.stop(); ticks.stop(); };
    }
    // Reuse the native values so an early response can interrupt a partial lock or tick.
    const options = { ...native, toValue: 1, duration: 240, easing: Easing.out(Easing.ease) };
    const unlock = Animated.parallel([Animated.timing(scale, options), Animated.timing(reveal, options)]);
    unlock.start();
    return () => unlock.stop();
  }, [phase, staticFrame, scale, cycle, reveal, edgesVisible]);

  return <Animated.View pointerEvents="none" style={[s.frame, { top, left, width: size, height: size, transform: [{ scale }] }]}>
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 280 280">
      <Path d={corners} stroke={Colors.black} strokeWidth={4} fill="none" />
      <Path d={corners} stroke={color} strokeWidth={phase === 'waiting' ? 3 : 5} fill="none" />
    </Svg>
    {!staticFrame && phase !== 'waiting' && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.center, {
      opacity: edgeOpacity,
    }]}>
      <CheckingEdges cycle={cycle} />
    </Animated.View>}
    {phase === 'checking' && staticFrame && <Text accessible={false} style={[s.symbol, { color: Colors.light }]}>…</Text>}
    {!!symbol && <Animated.Text accessible={false} style={[s.symbol, { color, opacity: reveal,
      transform: [{ scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
    }]}>{symbol}</Animated.Text>}
  </Animated.View>;
}

const s = StyleSheet.create({
  frame: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  edge: { position: 'absolute', backgroundColor: Colors.light, borderRadius: 3 },
  horizontal: { height: 4, width: 42 }, vertical: { width: 4, height: 42 },
  symbol: { fontSize: 42, fontFamily: Fonts.wantedSemiBold, backgroundColor: Colors.black, borderRadius: 32, width: 64, lineHeight: 64, textAlign: 'center', overflow: 'hidden' },
});

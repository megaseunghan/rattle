import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  cancelAnimation, Easing, ReduceMotion,
  useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { smoothProgress, splashPath, SPLASH_DURATION_MS } from '../utils/splashMorph';

interface Props { ready: boolean; canExit?: boolean; onDone: () => void }
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** One continuous UI clock drives geometry, settling and overlapping text; no image swaps. */
export function SplashAnimation({ ready, canExit = true, onDone }: Props) {
  const reduced = useReducedMotion();
  const [sequenceDone, setSequenceDone] = useState(false);
  const phase = useSharedValue(reduced ? 1 : 0);
  const opacity = useSharedValue(1);
  const alive = useRef(false);
  const completed = useRef(false);
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    alive.current = true;
    if (!ready) return () => { alive.current = false; };
    const sequenceFinished = () => { if (alive.current) setSequenceDone(true); };
    const endSequence = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(sequenceFinished);
    };
    if (reduced) {
      phase.set(1);
      setSequenceDone(true);
    } else {
      phase.set(0);
      opacity.set(1);
      setSequenceDone(false);
      phase.set(withTiming(1, { duration: SPLASH_DURATION_MS, easing: Easing.linear }, endSequence));
    }
    return () => {
      alive.current = false;
      cancelAnimation(phase);
    };
  }, [ready, reduced, phase, opacity]);

  useEffect(() => {
    if (!ready || !sequenceDone || !canExit) {
      opacity.set(1);
      return;
    }
    let cancelled = false;
    const finish = () => {
      if (!cancelled && alive.current && !completed.current) {
        completed.current = true;
        doneRef.current();
      }
    };
    opacity.set(withTiming(0, { duration: reduced ? 150 : 220, reduceMotion: ReduceMotion.Never }, ended => {
      if (ended) scheduleOnRN(finish);
    }));
    return () => { cancelled = true; cancelAnimation(opacity); };
  }, [ready, sequenceDone, canExit, reduced, opacity]);

  const geometry = useAnimatedProps(() => ({ d: splashPath(phase.get()) }));
  const overlay = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const mark = useAnimatedStyle(() => {
    const t = phase.get();
    return {
      opacity: reduced ? 1 : smoothProgress(t, 0, 0.14),
      transform: [
        { translateY: -18 * smoothProgress(t, 0.38, 0.92) },
        { scale: 0.94 + 0.06 * smoothProgress(t, 0, 0.35) - 0.15 * smoothProgress(t, 0.38, 0.94) },
      ],
    };
  });
  const mist = useAnimatedStyle(() => {
    const t = phase.get();
    return { opacity: reduced ? 0 : 0.55 * smoothProgress(t, 0, 0.18) * (1 - smoothProgress(t, 0.25, 0.85)) };
  });
  const halo = useAnimatedStyle(() => {
    const t = phase.get();
    return {
      opacity: reduced ? 0 : 0.45 * smoothProgress(t, 0.45, 0.7) * (1 - smoothProgress(t, 0.7, 1)),
      transform: [{ scale: 0.8 + 0.4 * smoothProgress(t, 0.4, 1) }],
    };
  });
  const caption = useAnimatedStyle(() => ({
    opacity: smoothProgress(phase.get(), 0.64, 0.94),
    transform: [{ translateY: reduced ? 0 : 8 * (1 - smoothProgress(phase.get(), 0.6, 0.94)) }],
  }));

  return <Animated.View style={[styles.overlay, overlay]} accessibilityViewIsModal
    accessibilityRole="progressbar" accessibilityLabel="Rattle 준비 중">
    <View style={styles.scene} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Animated.View style={[styles.halo, halo]} />
      <Animated.View style={[styles.mark, mark]}>
        <Svg width={144} height={144} viewBox="0 0 144 144">
          <Defs><LinearGradient id="liquidBlue" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={Colors.light} /><Stop offset="0.6" stopColor={Colors.primary} />
            <Stop offset="1" stopColor={Colors.dark} />
          </LinearGradient></Defs>
          <AnimatedPath animatedProps={geometry} fill="url(#liquidBlue)" fillRule="nonzero" />
        </Svg>
        <Animated.View style={[styles.mist, mist]}>
          <Svg width={200} height={200}><Defs>
            <RadialGradient id="mist"><Stop offset="0.2" stopColor={Colors.primary} stopOpacity={0.7} />
              <Stop offset="0.55" stopColor={Colors.splashLight} stopOpacity={0.4} />
              <Stop offset="1" stopColor={Colors.white} stopOpacity={0} /></RadialGradient>
          </Defs><Rect width={200} height={200} fill="url(#mist)" /></Svg>
        </Animated.View>

      </Animated.View>
      <Animated.View style={[styles.caption, caption]}>
        <Text style={styles.name}>Rattle</Text>
        <View style={styles.bar} />
      </Animated.View>
    </View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  scene: { width: 240, height: 240 },
  mark: { position: 'absolute', top: 48, left: 48, width: 144, height: 144 },
  mist: { position: 'absolute', top: -28, left: -28 },
  halo: { position: 'absolute', top: 24, left: 24, width: 192, height: 192, borderRadius: 96, borderWidth: 16, borderColor: Colors.homeCanvas },
  caption: { position: 'absolute', top: 162, left: 0, right: 0, alignItems: 'center' },
  name: { fontFamily: Fonts.wantedBold, fontSize: 30, lineHeight: 38, letterSpacing: -1, color: Colors.primary },
  // Decorative launch accent, not a fabricated percentage of network progress.
  bar: { marginTop: 12, width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.primary },
});

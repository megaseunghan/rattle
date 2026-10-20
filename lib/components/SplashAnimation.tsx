import { useEffect } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation, Easing, ReduceMotion, useAnimatedStyle,
  useReducedMotion, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Colors } from '../../constants/colors';

interface Props {
  ready: boolean;
  onDone: () => void;
}

/** 네이티브 시작 화면과 같은 로고를 유지하다 준비가 끝나면 짧게 걷어낸다. */
export function SplashAnimation({ ready, onDone }: Props) {
  const opacity = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!ready) return;
    opacity.set(withTiming(0, {
      duration: reducedMotion ? 0 : 150,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      reduceMotion: ReduceMotion.System,
    }, finished => {
      if (finished) scheduleOnRN(onDone);
    }));
    return () => cancelAnimation(opacity);
  }, [ready, reducedMotion, onDone, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View style={[styles.overlay, style]} accessibilityRole="progressbar" accessibilityLabel="Rattle 준비 중">
      <Image source={require('../../assets/Rattle_1024x1024.png')} style={styles.logo} resizeMode="contain" accessible={false} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  logo: { width: 144, height: 144 },
});

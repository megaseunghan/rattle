import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { Colors } from '../../constants/colors';

interface Props {
  onDone: () => void;
}

/**
 * 앱 시작 모션: 유기적인 블롭 하나가 등장 → 둘로 갈라지며 변형 → 정렬되어 R 마크로 완성 →
 * 스프링으로 살짝 튀며 안정 → Rattle 워드마크가 뒤따라 나타난다.
 * 타이밍은 0.0/0.3/0.6/0.8/1.0/1.2s 구간에 맞춰 손으로 짠 것(디자인 목업 기준)이라 매직넘버 그대로 둔다.
 */
export function SplashAnimation({ onDone }: Props) {
  const blobOpacity = useSharedValue(0);
  const blobScale = useSharedValue(0.5);
  const radiusA = useSharedValue(40); // 등장 시 둥근 사각형 → 변형되며 비대칭 블롭으로
  const radiusB = useSharedValue(40);

  const splitProgress = useSharedValue(0); // 0 = 합쳐진 블롭, 1 = 완전히 갈라진 두 블롭

  const markOpacity = useSharedValue(0);
  const markScale = useSharedValue(0.7);

  const wordmarkOpacity = useSharedValue(0);
  const wordmarkTranslateY = useSharedValue(8);

  const containerOpacity = useSharedValue(1);

  useEffect(() => {
    blobOpacity.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) });
    blobScale.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) });

    radiusA.value = withDelay(300, withTiming(999, { duration: 300, easing: Easing.inOut(Easing.quad) }));
    radiusB.value = withDelay(300, withTiming(12, { duration: 300, easing: Easing.inOut(Easing.quad) }));

    splitProgress.value = withDelay(600, withTiming(1, { duration: 200, easing: Easing.inOut(Easing.quad) }));

    markOpacity.value = withDelay(800, withTiming(1, { duration: 150 }));
    markScale.value = withDelay(
      800,
      withSequence(
        withSpring(1.15, { damping: 5, stiffness: 200 }),
        withSpring(1, { damping: 9, stiffness: 200 }),
      ),
    );

    wordmarkOpacity.value = withDelay(1200, withTiming(1, { duration: 320 }));
    wordmarkTranslateY.value = withDelay(1200, withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) }));

    containerOpacity.value = withDelay(
      1900,
      withTiming(0, { duration: 280 }, () => runOnJS(onDone)()),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const singleBlobStyle = useAnimatedStyle(() => ({
    opacity: blobOpacity.value * (1 - splitProgress.value),
    transform: [{ scale: blobScale.value }],
    borderTopLeftRadius: radiusA.value,
    borderBottomRightRadius: radiusA.value,
    borderTopRightRadius: radiusB.value,
    borderBottomLeftRadius: radiusB.value,
  }));

  const blobLeftStyle = useAnimatedStyle(() => ({
    opacity: splitProgress.value * (1 - markOpacity.value),
    transform: [
      { translateX: -16 * splitProgress.value },
      { translateY: -8 * splitProgress.value },
      { scale: 0.6 + 0.35 * splitProgress.value },
    ],
  }));

  const blobRightStyle = useAnimatedStyle(() => ({
    opacity: splitProgress.value * (1 - markOpacity.value),
    transform: [
      { translateX: 16 * splitProgress.value },
      { translateY: 10 * splitProgress.value },
      { scale: 0.55 + 0.35 * splitProgress.value },
    ],
  }));

  const markStyle = useAnimatedStyle(() => ({
    opacity: markOpacity.value,
    transform: [{ scale: markScale.value }],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
    transform: [{ translateY: wordmarkTranslateY.value }],
  }));

  const containerStyle = useAnimatedStyle(() => ({ opacity: containerOpacity.value }));

  return (
    <Animated.View style={[styles.overlay, containerStyle]} pointerEvents="none">
      <View style={styles.markBox}>
        <Animated.View style={[styles.blob, styles.blobSingle, singleBlobStyle]} />
        <Animated.View style={[styles.blob, styles.blobPiece, blobLeftStyle]} />
        <Animated.View style={[styles.blob, styles.blobPiece, styles.blobPieceDark, blobRightStyle]} />
        <Animated.Text style={[styles.markLetter, markStyle]}>R</Animated.Text>
      </View>

      <Animated.View style={[styles.wordmarkRow, wordmarkStyle]}>
        <Text style={styles.wordmarkR}>R</Text>
        <Text style={styles.wordmarkRest}>attle</Text>
        <View style={styles.wordmarkDot} />
      </Animated.View>
      <Animated.View style={[styles.underline, wordmarkStyle]} />
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
  markBox: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blob: { position: 'absolute' },
  blobSingle: { width: 72, height: 72, backgroundColor: Colors.primary },
  blobPiece: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary },
  blobPieceDark: { backgroundColor: Colors.dark },
  markLetter: {
    position: 'absolute',
    fontSize: 64,
    fontWeight: '800',
    color: Colors.primary,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 20,
  },
  wordmarkR: { fontSize: 28, fontWeight: '800', color: Colors.primary },
  wordmarkRest: { fontSize: 28, fontWeight: '800', color: Colors.black, letterSpacing: -1 },
  wordmarkDot: {
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: Colors.primary, marginLeft: -1, marginBottom: 8,
  },
  underline: {
    marginTop: 8,
    width: 28,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.primary,
  },
});

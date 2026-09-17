import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, interpolate, runOnJS, useAnimatedProps, useAnimatedStyle,
  useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

/**
 * Rattle 마크는 캡슐 3개 — 세로 기둥 / 정원 볼 / 45° 대각선 다리 — 로 이루어져 있다.
 * 마지막 프레임 좌표·색은 assets/Rattle_1024x1024.png 를 직접 측정해서 옮긴 값이라
 * viewBox도 로고 원본과 같은 1024 좌표계를 쓴다.
 *
 * 캡슐의 x·y·w·h·rx를 그대로 보간하면 "원형 블롭 → 캡슐"이 하나의 도형 변형으로 이어지므로
 * 크로스페이드 없이 형태가 자라나는 모션이 된다.
 * 각 단계는 목업의 0.0s(등장) / 0.3s(변형) / 0.6s(정렬) / 0.8s(완성) 프레임에 대응한다.
 */
type Capsule = { x: number; y: number; w: number; h: number; r: number };

// 마스터 로고 PNG가 캔버스 안에서 안 중앙(좌우/상하 여백이 서로 달랐음)이라
// 에셋을 중앙으로 재정렬(x -31, y -63)했다 — 여기 좌표도 같은 이동값을 반영한다.
const STEM: Capsule[] = [
  { x: 259, y: 277, w: 400, h: 400, r: 200 },   // 0.0s — 둥근 블롭
  { x: 239, y: 237, w: 370, h: 460, r: 185 },   // 0.3s — 세로로 늘어나기 시작
  { x: 184, y: 207, w: 291, h: 620, r: 145.5 }, // 0.6s — 기둥 자리로 정렬
  { x: 177, y: 185, w: 291, h: 660, r: 145.5 }, // 0.8s — 완성 (실측값)
];

const BOWL: Capsule[] = [
  { x: 389, y: 257, w: 360, h: 360, r: 180 },
  { x: 409, y: 227, w: 345, h: 345, r: 172.5 },
  { x: 459, y: 182, w: 310, h: 310, r: 155 },
  { x: 465, y: 169.5, w: 318, h: 318, r: 159 },
];

// 다리는 고정 회전(-45°)된 그룹 안에 있어서, 블롭 단계의 원은 회전해도 원 그대로다.
const LEG: Capsule[] = [
  { x: 450, y: 335, w: 350, h: 350, r: 175 },
  { x: 469, y: 367, w: 320, h: 390, r: 160 },
  { x: 541, y: 452, w: 242, h: 420, r: 121 },
  { x: 536.5, y: 436, w: 242, h: 447, r: 121 },
];

const LEG_ORIGIN = '657.5, 659.5'; // 다리 캡슐의 회전 중심 (축의 중점)
const MARK_CENTER = { x: 511, y: 511 }; // 로고 content 의 실제 중심 (재정렬 후 캔버스 정중앙)
const STEM_COLOR = '#1679FC'; // 기둥은 그라데이션 없이 단색 (로고 원본과 동일)

/** 0.0 → 0.375 → 0.75 → 1.0 구간이 각각 0.0s / 0.3s / 0.6s / 0.8s 프레임이다 */
const STAGES = [0, 0.375, 0.75, 1];

function capsuleAt(frames: Capsule[], p: number) {
  'worklet';
  return {
    x: interpolate(p, STAGES, [frames[0].x, frames[1].x, frames[2].x, frames[3].x]),
    y: interpolate(p, STAGES, [frames[0].y, frames[1].y, frames[2].y, frames[3].y]),
    width: interpolate(p, STAGES, [frames[0].w, frames[1].w, frames[2].w, frames[3].w]),
    height: interpolate(p, STAGES, [frames[0].h, frames[1].h, frames[2].h, frames[3].h]),
    rx: interpolate(p, STAGES, [frames[0].r, frames[1].r, frames[2].r, frames[3].r]),
    ry: interpolate(p, STAGES, [frames[0].r, frames[1].r, frames[2].r, frames[3].r]),
  };
}

interface Props {
  ready: boolean;
  onDone: () => void;
}

export function SplashAnimation({ ready, onDone }: Props) {
  const progress = useSharedValue(0);   // 블롭 → 로고 형태 변형
  const appear = useSharedValue(0);     // 등장 페이드
  const scale = useSharedValue(0.62);   // 등장 스케일 + 완성 시 스프링 바운스
  const glow = useSharedValue(0);       // 완성 순간 퍼지는 빛무리
  const text = useSharedValue(0);       // 워드마크
  const container = useSharedValue(1);  // 전체 페이드아웃

  useEffect(() => {
    if (!ready) return;
    appear.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });

    progress.value = withSequence(
      withTiming(STAGES[1], { duration: 300, easing: Easing.out(Easing.cubic) }),    // 등장
      withTiming(STAGES[2], { duration: 300, easing: Easing.inOut(Easing.cubic) }),  // 변형 → 정렬
      withTiming(STAGES[3], { duration: 200, easing: Easing.inOut(Easing.cubic) }),  // 완성
    );

    scale.value = withSequence(
      withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }),
      // apple-design §4: 완성 순간의 한 번뿐인 튐은 damping ratio~0.8/response~0.4에 대응하는 값으로,
      // 뒤이은 안정은 거의 critically damped(ratio~1.0/response~0.3)로 — 여러 번 진동하지 않고 한 번만 튀고 멈춘다.
      withDelay(500, withSpring(1.09, { damping: 25, stiffness: 247 })), // 0.8s — 살짝 튀고
      withSpring(1, { damping: 42, stiffness: 438 }),                    // 1.0s — 안정
    );

    glow.value = withDelay(800, withSequence(
      withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 460, easing: Easing.out(Easing.quad) }),
    ));

    text.value = withDelay(1200, withTiming(1, { duration: 340, easing: Easing.out(Easing.cubic) }));

    container.value = withDelay(2000, withTiming(0, { duration: 300 }, finished => {
      if (finished) runOnJS(onDone)();
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const stemProps = useAnimatedProps(() => capsuleAt(STEM, progress.value));
  const bowlProps = useAnimatedProps(() => capsuleAt(BOWL, progress.value));
  const legProps = useAnimatedProps(() => capsuleAt(LEG, progress.value));

  // 뒤에 깔리는 확대 복사본 — 형태가 굳어질수록 옅어지며 블롭의 뭉근한 가장자리를 만든다
  const hazeProps = useAnimatedProps(() => ({
    opacity: interpolate(progress.value, STAGES, [0.5, 0.42, 0.22, 0]),
  }));

  const glowProps = useAnimatedProps(() => ({
    r: interpolate(glow.value, [0, 1], [390, 620]),
    opacity: glow.value * 0.16,
  }));

  const markStyle = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [{ scale: scale.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: text.value,
    transform: [{ translateY: interpolate(text.value, [0, 1], [10, 0]) }],
  }));

  const containerStyle = useAnimatedStyle(() => ({ opacity: container.value }));

  return (
    <Animated.View style={[styles.overlay, containerStyle]} pointerEvents="auto">
      <Animated.View style={markStyle}>
        <Svg width={168} height={168} viewBox="0 0 1024 1024">
          <Defs>
            {/* 각 도형의 그라데이션도 로고 원본에서 샘플링한 값 */}
            <LinearGradient id="bowlGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#5FA4FA" />
              <Stop offset="1" stopColor="#2685FB" />
            </LinearGradient>
            {/* 다리는 회전 그룹 안이라, 로컬 세로 방향이 화면에서는 좌상 → 우하 대각선이 된다 */}
            <LinearGradient id="legGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#93C1FA" />
              <Stop offset="1" stopColor="#1B79FB" />
            </LinearGradient>
          </Defs>

          <AnimatedCircle cx={MARK_CENTER.x} cy={MARK_CENTER.y} fill={STEM_COLOR} animatedProps={glowProps} />

          <AnimatedG scale={1.16} origin={`${MARK_CENTER.x}, ${MARK_CENTER.y}`} animatedProps={hazeProps}>
            <AnimatedRect animatedProps={stemProps} fill={STEM_COLOR} />
            <AnimatedRect animatedProps={bowlProps} fill="url(#bowlGrad)" />
            <G rotation={-45} origin={LEG_ORIGIN}>
              <AnimatedRect animatedProps={legProps} fill="url(#legGrad)" />
            </G>
          </AnimatedG>

          <AnimatedRect animatedProps={stemProps} fill={STEM_COLOR} />
          <AnimatedRect animatedProps={bowlProps} fill="url(#bowlGrad)" />
          <G rotation={-45} origin={LEG_ORIGIN}>
            <AnimatedRect animatedProps={legProps} fill="url(#legGrad)" />
          </G>
        </Svg>
      </Animated.View>

      <Animated.View style={[styles.wordmarkBox, textStyle]}>
        <Text style={styles.wordmark}>Rattle</Text>
        <View style={styles.underline} />
      </Animated.View>

      <Animated.Text style={[styles.tagline, textStyle]}>Start Something Clear</Animated.Text>
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
  wordmarkBox: { alignItems: 'center', marginTop: 18 },
  wordmark: {
    fontFamily: Fonts.spaceGroteskBold,
    fontSize: 38,
    letterSpacing: -1,
    color: STEM_COLOR,
  },
  underline: {
    marginTop: 10,
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: STEM_COLOR,
  },
  tagline: {
    position: 'absolute',
    bottom: 72,
    fontFamily: Fonts.spaceGroteskRegular,
    fontSize: 13,
    letterSpacing: 0.4,
    color: Colors.gray400,
  },
});

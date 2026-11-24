/* 확정 시안 B · 빛 흐름(2026-11-24): 연한 파랑 자리 위로 화면 전체에 이어지는 빛 한 줄기가 지나간다. */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, useWindowDimensions, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Colors } from '../../../constants/colors';

const SWEEP_MS = 1500;
const BEAM_WIDTH_RATIO = 0.5;

interface BeamContextValue { beam: Animated.Value; animated: boolean; screenWidth: number; }
const BeamContext = createContext<BeamContextValue | null>(null);

/** 기기의 동작 줄이기 설정. 확인 전에는 움직임을 시작하지 않는다. */
function useReduceMotionSetting(): boolean {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduced(value); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduced;
}

interface SkeletonGroupProps { label: string; children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string; }

/** 한 화면(또는 영역)의 자리 표시를 묶는다. 빛 한 줄기를 공유하고, 읽기 도구에는 라벨 하나만 알린다. */
export function SkeletonGroup({ label, children, style, testID }: SkeletonGroupProps) {
  const reduced = useReduceMotionSetting();
  const { width } = useWindowDimensions();
  const beam = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) { beam.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(beam, { toValue: 1, duration: SWEEP_MS, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [beam, reduced]);
  const value = useMemo(() => ({ beam, animated: !reduced, screenWidth: width }), [beam, reduced, width]);
  return <BeamContext.Provider value={value}>
    <View testID={testID} style={style} accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }}>
      {children}
    </View>
  </BeamContext.Provider>;
}

interface SkeletonProps { width?: DimensionValue; height: number; radius?: number; style?: StyleProp<ViewStyle>; testID?: string; }

/** 자리 표시 블록 하나. 그룹 밖이거나 동작 줄이기가 켜져 있으면 움직이지 않는다. */
export function Skeleton({ width = '100%', height, radius = 8, style, testID }: SkeletonProps) {
  const ctx = useContext(BeamContext);
  const ref = useRef<View>(null);
  const [offsetX, setOffsetX] = useState<number | null>(null);
  // 가로 페이저의 다른 탭에 있으면 x가 화면 폭만큼 밀려 있으므로 한 화면 폭 안으로 접는다.
  const measure = () => ref.current?.measureInWindow((x) => {
    const w = ctx?.screenWidth || 1;
    setOffsetX(((x % w) + w) % w);
  });
  const screenWidth = ctx?.screenWidth ?? 0;
  const beamWidth = screenWidth * BEAM_WIDTH_RATIO;
  const translateX = ctx && offsetX != null
    ? ctx.beam.interpolate({ inputRange: [0, 1], outputRange: [-beamWidth - offsetX, screenWidth - offsetX] })
    : null;
  return <View ref={ref} testID={testID} onLayout={ctx?.animated ? measure : undefined}
    importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
    style={[styles.block, { width, height, borderRadius: radius }, style]}>
    {ctx?.animated && translateX && <Animated.View pointerEvents="none" style={[styles.beam, { width: beamWidth, transform: [{ translateX }] }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="skeleton-beam" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={Colors.skeletonHighlight} stopOpacity="0" />
            <Stop offset="0.5" stopColor={Colors.skeletonHighlight} stopOpacity="0.9" />
            <Stop offset="1" stopColor={Colors.skeletonHighlight} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#skeleton-beam)" />
      </Svg>
    </Animated.View>}
  </View>;
}

const styles = StyleSheet.create({
  block: { backgroundColor: Colors.skeleton, overflow: 'hidden' },
  beam: { position: 'absolute', top: 0, bottom: 0, left: 0 },
});

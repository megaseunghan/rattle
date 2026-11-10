import { useEffect, useId } from 'react';
import { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import Reanimated, { cancelAnimation, Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedPath = Reanimated.createAnimatedComponent(Path);
const AnimatedCircle = Reanimated.createAnimatedComponent(Circle);
const NUMBER = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi;
export function splitChartPath(path: string) {
  return { numbers: (path.match(NUMBER) ?? []).map(Number), parts: path.split(NUMBER) };
}
export function mixChartCoordinates(from: number[], to: number[], progress: number) {
  'worklet';
  return to.map((value, index) => from[index] + (value - from[index]) * progress);
}
export function joinChartPath(parts: string[], numbers: number[]) {
  'worklet';
  let path = parts[0] ?? '';
  for (let index = 0; index < numbers.length; index++) path += numbers[index] + parts[index + 1];
  return path;
}

/** Morph only matching path structures; missing series never become invented zero points. */
export function MorphingArea({ path, color, prior = false, immediate = false, baseline = 176, areaMask }: {
  path: string; color: string; prior?: boolean; immediate?: boolean; baseline?: number; areaMask?: string;
}) {
  const gradientId = `area-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const initial = splitChartPath(path);
  const shape = useSharedValue({ from: initial.numbers, to: initial.numbers, parts: initial.parts, fromBaseline: baseline, toBaseline: baseline });
  const progress = useSharedValue(1);
  useEffect(() => {
    const next = splitChartPath(path);
    const previous = shape.value;
    const compatible = previous.parts.join('|') === next.parts.join('|') && previous.to.length === next.numbers.length;
    const presented = compatible ? mixChartCoordinates(previous.from, previous.to, progress.value) : next.numbers;
    cancelAnimation(progress);
    const presentedBaseline = previous.fromBaseline + (previous.toBaseline - previous.fromBaseline) * progress.value;
    shape.value = { from: immediate ? next.numbers : presented, to: next.numbers, parts: next.parts, fromBaseline: immediate || !compatible ? baseline : presentedBaseline, toBaseline: baseline };
    progress.value = immediate || !compatible ? 1 : 0;
    if (!immediate && compatible) progress.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
    return () => cancelAnimation(progress);
  }, [path, baseline, immediate, progress, shape]);
  const lineProps = useAnimatedProps(() => ({ d: joinChartPath(shape.value.parts, mixChartCoordinates(shape.value.from, shape.value.to, progress.value)) }));
  const fillProps = useAnimatedProps(() => {
    const numbers = mixChartCoordinates(shape.value.from, shape.value.to, progress.value);
    const d = joinChartPath(shape.value.parts, numbers);
    const base = shape.value.fromBaseline + (shape.value.toBaseline - shape.value.fromBaseline) * progress.value;
    return { d: numbers.length ? `${d} L ${numbers[numbers.length - 2]} ${base} L ${numbers[0]} ${base} Z` : '' };
  });
  const dotProps = useAnimatedProps(() => {
    const numbers = mixChartCoordinates(shape.value.from, shape.value.to, progress.value);
    return { cx: numbers[numbers.length - 2] ?? 0, cy: numbers[numbers.length - 1] ?? 176 };
  });
  return <>
    <Defs><LinearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
      <Stop offset="0%" stopColor={color} stopOpacity={0} /><Stop offset="20%" stopColor={color} stopOpacity={1} />
      <Stop offset="80%" stopColor={color} stopOpacity={1} /><Stop offset="100%" stopColor={color} stopOpacity={0} />
    </LinearGradient></Defs>
    <AnimatedPath animatedProps={fillProps} fill={areaMask ? color : `url(#${gradientId})`} mask={areaMask ? `url(#${areaMask})` : undefined} opacity={0.09} />
    <AnimatedPath animatedProps={lineProps} fill="none" stroke={color} strokeWidth={prior ? 2.5 : 3.5} strokeDasharray={prior ? '4 5' : undefined} strokeLinecap="round" />
    {!prior && <AnimatedCircle animatedProps={dotProps} r={4} fill={color} />}
  </>;
}

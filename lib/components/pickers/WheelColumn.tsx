/* design-system: DESIGN.md — 공용 휠 한 칸. 기존 ClosingTimeWheel(매장 마감 시간)의 동작을 그대로 따르되 숫자 서체·목록 길이 변경을 지원한다. */
import { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';

export const WHEEL_ROW = 44;
const HEIGHT = 180;

export interface WheelColumnProps {
  /** 접근성 이름(예: '년', '시간') */
  label: string;
  options: readonly string[];
  index: number;
  onChange: (index: number) => void;
  disabled?: boolean;
  /** 숫자 칸이면 Geist로 보인다. */
  numeric?: boolean;
  /** 접근성 값 뒤에 붙일 단위(예: '년'). 화면에는 휠 위 머리글로 보인다. */
  unit?: string;
  onMoving?: (moving: boolean) => void;
}

export function WheelColumn({ label, options, index, onChange, disabled = false, numeric = true, unit = '', onMoving }: WheelColumnProps) {
  const scroll = useRef<ScrollView>(null);
  const position = useRef(new Animated.Value(index * WHEEL_ROW)).current;
  const reported = useRef(index);
  const initialOffset = useRef({ x: 0, y: index * WHEEL_ROW }).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touching = useRef(false);
  const moving = useRef(onMoving);
  moving.current = onMoving;
  useEffect(() => () => { clearTimeout(timer.current); moving.current?.(false); }, []);
  useEffect(() => {
    if (reported.current === index) return;
    reported.current = index;
    position.setValue(index * WHEEL_ROW);
    scroll.current?.scrollTo({ y: index * WHEEL_ROW, animated: false });
  }, [index, position]);

  function choose(next: number) {
    if (disabled) return;
    const bounded = Math.max(0, Math.min(options.length - 1, next));
    reported.current = bounded;
    onChange(bounded);
    scroll.current?.scrollTo({ y: bounded * WHEEL_ROW, animated: false });
    position.setValue(bounded * WHEEL_ROW);
  }
  function scheduleSettled() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (!touching.current) moving.current?.(false); }, 160);
  }
  function handleScroll(y: number) {
    if (disabled) return;
    const next = Math.max(0, Math.min(options.length - 1, Math.round(y / WHEEL_ROW)));
    if (reported.current !== next) { reported.current = next; onChange(next); }
    scheduleSettled();
  }

  return <View style={styles.column} accessible accessibilityRole="adjustable" accessibilityLabel={label}
    accessibilityValue={{ text: options[index] != null ? `${options[index]}${unit}` : '' }} accessibilityState={{ disabled }}
    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
    onAccessibilityAction={event => choose(index + (event.nativeEvent.actionName === 'increment' ? 1 : -1))}>
    <Animated.ScrollView ref={scroll} testID={`wheel-${label}`} style={styles.scroll}
      contentContainerStyle={styles.content} contentOffset={initialOffset}
      scrollEnabled={!disabled} snapToInterval={WHEEL_ROW} decelerationRate="fast" bounces={false}
      showsVerticalScrollIndicator={false} scrollEventThrottle={16} nestedScrollEnabled
      onScrollBeginDrag={() => { touching.current = true; clearTimeout(timer.current); moving.current?.(true); }}
      onScrollEndDrag={() => { touching.current = false; scheduleSettled(); }}
      onMomentumScrollBegin={() => { clearTimeout(timer.current); moving.current?.(true); }}
      onMomentumScrollEnd={() => { touching.current = false; clearTimeout(timer.current); moving.current?.(false); }}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: position } } }], {
        useNativeDriver: false,
        listener: (event: { nativeEvent: { contentOffset: { y: number } } }) => handleScroll(event.nativeEvent.contentOffset.y),
      })}>
      {options.map((option, i) => <Animated.View key={`${i}:${option}`} style={{ opacity: position.interpolate({
        inputRange: [(i - 2) * WHEEL_ROW, (i - 1) * WHEEL_ROW, i * WHEEL_ROW, (i + 1) * WHEEL_ROW, (i + 2) * WHEEL_ROW],
        outputRange: [0.15, 0.45, 1, 0.45, 0.15], extrapolate: 'clamp',
      }) }}>
        <Pressable style={styles.option} disabled={disabled} accessible={false} onPress={() => choose(i)}>
          <Text style={[styles.text, numeric && styles.number, index === i && (numeric ? styles.selectedNumber : styles.selected)]}>{option}</Text>
        </Pressable>
      </Animated.View>)}
    </Animated.ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  column: { flex: 1, minWidth: 0 },
  scroll: { height: HEIGHT, flexGrow: 0 },
  content: { paddingVertical: (HEIGHT - WHEEL_ROW) / 2 },
  option: { height: WHEEL_ROW, alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: Fonts.wantedMedium, fontSize: 18, color: Colors.gray500 },
  number: { fontFamily: Fonts.geistMedium, fontVariant: ['tabular-nums'] },
  selected: { color: Colors.black, fontFamily: Fonts.wantedSemiBold },
  selectedNumber: { color: Colors.black, fontFamily: Fonts.geistSemiBold },
});

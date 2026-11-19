import { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';

const ROW = 44;
const HEIGHT = 180;

/** A bounded, whole-hour wheel; fading rows never cover the shared backdrop. */
export function ClosingTimeWheel({ label, options, index, disabled, onChange, onMoving }: {
  label: string; options: readonly string[]; index: number; disabled: boolean;
  onChange: (index: number) => void; onMoving: (moving: boolean) => void;
}) {
  const scroll = useRef<ScrollView>(null);
  const position = useRef(new Animated.Value(index * ROW)).current;
  const reported = useRef(index);
  const initialOffset = useRef({ x: 0, y: index * ROW }).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touching = useRef(false);
  const movingCallback = useRef(onMoving);
  movingCallback.current = onMoving;
  useEffect(() => () => { clearTimeout(timer.current); movingCallback.current(false); }, []);
  useEffect(() => {
    if (reported.current === index) return;
    reported.current = index;
    position.setValue(index * ROW);
    scroll.current?.scrollTo({ y: index * ROW, animated: false });
  }, [index, position]);
  function choose(next: number) {
    if (disabled) return;
    const bounded = Math.max(0, Math.min(options.length - 1, next));
    reported.current = bounded;
    onChange(bounded);
    scroll.current?.scrollTo({ y: bounded * ROW, animated: false });
    position.setValue(bounded * ROW);
  }
  function scheduleSettled() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (!touching.current) movingCallback.current(false); }, 160);
  }
  return <View style={styles.column} accessible accessibilityRole="adjustable" accessibilityLabel={label}
    accessibilityValue={{ text: options[index], min: 0, max: options.length - 1, now: index }}
    accessibilityState={{ disabled }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
    onAccessibilityAction={event => choose(index + (event.nativeEvent.actionName === 'increment' ? 1 : -1))}>
    <Animated.ScrollView ref={scroll} testID={`closing-wheel-${label}`} style={styles.scroll}
      contentContainerStyle={styles.content} contentOffset={initialOffset}
      scrollEnabled={!disabled} snapToInterval={ROW} decelerationRate="fast" bounces={false}
      showsVerticalScrollIndicator={false} scrollEventThrottle={16} nestedScrollEnabled
      onScrollBeginDrag={() => { touching.current = true; clearTimeout(timer.current); onMoving(true); }}
      onScrollEndDrag={() => { touching.current = false; scheduleSettled(); }}
      onMomentumScrollBegin={() => { clearTimeout(timer.current); onMoving(true); }}
      onMomentumScrollEnd={() => { touching.current = false; clearTimeout(timer.current); onMoving(false); }}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: position } } }], { useNativeDriver: false,
        listener: (event: { nativeEvent: { contentOffset: { y: number } } }) => {
          if (disabled) return;
          const next = Math.max(0, Math.min(options.length - 1, Math.round(event.nativeEvent.contentOffset.y / ROW)));
          if (reported.current !== next) { reported.current = next; onChange(next); }
          scheduleSettled();
        } })}>
      {options.map((option, i) => <Animated.View key={option} style={{ opacity: position.interpolate({
        inputRange: [(i - 2) * ROW, (i - 1) * ROW, i * ROW, (i + 1) * ROW, (i + 2) * ROW],
        outputRange: [0, 0.4, 1, 0.4, 0], extrapolate: 'clamp',
      }) }}>
        <Pressable style={styles.option} disabled={disabled} accessible={false} onPress={() => choose(i)}>
          <Text style={[styles.text, label === '시간' && styles.number, index === i && styles.selected]}>{option}</Text>
        </Pressable>
      </Animated.View>)}
    </Animated.ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  column: { flex: 1, minWidth: 0 }, scroll: { height: HEIGHT, flexGrow: 0 },
  content: { paddingVertical: (HEIGHT - ROW) / 2 },
  option: { height: ROW, alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: Fonts.wantedMedium, fontSize: 20, color: Colors.gray500 },
  number: { fontFamily: Fonts.geistMedium, fontSize: 24 },
  selected: { color: Colors.action },
});

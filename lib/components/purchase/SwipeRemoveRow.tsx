/* design-system: DESIGN.md — 매입 품목 행: 왼쪽으로 밀어 빼기(확정 2026-11-23, purchase-item-remove-v1 A안) */
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';

/** 조금 밀었을 때 열리는 '빼기' 버튼 폭 */
const OPEN_WIDTH = 88;
/** 행 폭의 이 비율 이상 밀고 놓으면 버튼을 누르지 않아도 바로 뺀다 */
const REMOVE_RATIO = 0.6;
/** 빠르게 튕겨 밀었을 때 바로 빼는 속도(왼쪽, pt/s) */
const FLING_VELOCITY = -900;
const SPRING = { damping: 38, stiffness: 420, overshootClamping: true };
/** 카드 안쪽 여백(16)을 넘어 빨간 영역이 카드 끝까지 차도록 한다 */
const CARD_INSET = 16;

export function SwipeRemoveRow({ id, label, onRemove, children, disabled = false }: {
  id: string; label: string; onRemove: () => void; children: ReactNode; disabled?: boolean;
}) {
  const reduced = useReducedMotion();
  const offset = useSharedValue(0), start = useSharedValue(0), width = useSharedValue(343);
  const [opened, setOpened] = useState(false);
  const remove = useCallback(() => { setOpened(false); onRemove(); }, [onRemove]);

  const pan = Gesture.Pan().withTestId(`purchase-row-swipe-${id}`).enabled(!disabled)
    .activeOffsetX([-12, 12]).failOffsetY([-8, 8]).maxPointers(1)
    .onStart(() => { start.value = offset.value; })
    .onUpdate(event => { offset.value = Math.max(-width.value, Math.min(0, start.value + event.translationX)); })
    .onEnd(event => {
      const distance = -(start.value + event.translationX);
      if (distance >= width.value * REMOVE_RATIO || (distance >= OPEN_WIDTH && event.velocityX <= FLING_VELOCITY)) {
        if (reduced) { scheduleOnRN(remove); return; }
        offset.value = withTiming(-width.value, { duration: 160 }, done => { if (done) scheduleOnRN(remove); });
        return;
      }
      const target = event.velocityX < 250 && distance > OPEN_WIDTH / 2 ? -OPEN_WIDTH : 0;
      offset.value = reduced ? target : withSpring(target, SPRING);
      scheduleOnRN(setOpened, target !== 0);
    });

  const rowMotion = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return <View style={styles.clip} onLayout={event => { if (event.nativeEvent.layout.width > 0) width.value = event.nativeEvent.layout.width; }}>
    <View style={styles.under}>
      {/* 화면 읽기 사용자는 밀지 않아도 이 버튼으로 뺄 수 있다. 손가락은 행이 덮고 있어 열렸을 때만 닿는다. */}
      <Pressable testID={`purchase-row-remove-${id}`} accessibilityRole="button" accessibilityLabel={`${label} 빼기`} disabled={disabled}
        onPress={remove} style={styles.removeButton}>
        <View style={styles.minus}><View style={styles.minusBar} /></View>
        <Text style={styles.removeText}>빼기</Text>
      </Pressable>
    </View>
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.row, rowMotion]} accessibilityHint={opened ? undefined : '왼쪽으로 밀면 뺄 수 있어요'}>{children}</Animated.View>
    </GestureDetector>
  </View>;
}

const styles = StyleSheet.create({
  clip: { marginHorizontal: -CARD_INSET, overflow: 'hidden' },
  under: { ...StyleSheet.absoluteFill, flexDirection: 'row', justifyContent: 'flex-end', backgroundColor: Colors.negative },
  removeButton: { width: OPEN_WIDTH, alignItems: 'center', justifyContent: 'center', gap: 4 },
  minus: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  minusBar: { width: 10, height: 2, borderRadius: 1, backgroundColor: Colors.negative },
  removeText: { fontFamily: Fonts.wantedBold, fontSize: 14, color: Colors.white },
  row: { backgroundColor: Colors.white, paddingHorizontal: CARD_INSET },
});

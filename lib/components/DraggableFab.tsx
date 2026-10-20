import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

const FAB_SIZE = 52;
const TAB_BAR_HEIGHT = 80;
const DRAG_TAP_THRESHOLD = 6; // 이 이하로 움직이면 드래그가 아니라 탭으로 간주
const STORAGE_KEY = 'rattle_fab_position_v1';
const RUBBERBAND_CONSTANT = 0.55; // 경계 밖으로 나갈수록 저항이 커지는 정도 (apple-design §9)

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

/** 경계를 넘어간 만큼 점점 더 저항하도록 완충 — 하드 스탑 대신 부드럽게 늘어나는 느낌 */
function rubberband(overshoot: number, dimension: number, constant = RUBBERBAND_CONSTANT): number {
  'worklet';
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** 값이 [min, max] 밖이면 러버밴딩으로 완충하고, 안이면 그대로 반환 */
function withRubberband(value: number, min: number, max: number, dimension: number): number {
  'worklet';
  if (value < min) return min + rubberband(value - min, dimension);
  if (value > max) return max + rubberband(value - max, dimension);
  return value;
}

interface DraggableFabProps {
  visible: boolean;
  onPress: () => void;
  onDragEnd?: (x: number, y: number) => void;
  iconName: keyof typeof Ionicons.glyphMap;
}

/** 화면 어디든 자유롭게 드래그해서 옮길 수 있는 FAB. 위치는 기기에 저장돼 다음에 열어도 유지된다. */
export function DraggableFab({ visible, onPress, onDragEnd, iconName }: DraggableFabProps) {
  if (!visible) return null;
  return <DraggableFabInner onPress={onPress} onDragEnd={onDragEnd} iconName={iconName} />;
}

function DraggableFabInner({ onPress, onDragEnd, iconName }: Omit<DraggableFabProps, 'visible'>) {
  const { width, height } = useWindowDimensions();
  const minX = 8;
  const maxX = width - FAB_SIZE - 8;
  const minY = 40;
  const maxY = height - FAB_SIZE - TAB_BAR_HEIGHT - 16;

  const defaultX = width - FAB_SIZE - 20;
  const defaultY = height - FAB_SIZE - TAB_BAR_HEIGHT - 16;

  const x = useSharedValue(defaultX);
  const y = useSharedValue(defaultY);
  const startX = useSharedValue(defaultX);
  const startY = useSharedValue(defaultY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      let restoredX = defaultX;
      let restoredY = defaultY;
      if (raw) {
        try {
          const pos = JSON.parse(raw) as { x: number; y: number };
          if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) throw new Error();
          restoredX = clamp(pos.x, minX, maxX);
          restoredY = clamp(pos.y, minY, maxY);
        } catch {
          // 저장된 값이 손상됐으면 기본 위치 유지
        }
      }
      x.value = restoredX;
      y.value = restoredY;
      setReady(true);
      onDragEnd?.(restoredX, restoredY);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }).catch(() => {
      setReady(true);
      onDragEnd?.(defaultX, defaultY);
    });
  }, []);

  function persistPosition(px: number, py: number) {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ x: px, y: py })).catch(() => {});
    onDragEnd?.(px, py);
  }

  const pan = Gesture.Pan()
    .minDistance(DRAG_TAP_THRESHOLD)
    .onStart(() => {
      cancelAnimation(x);
      cancelAnimation(y);
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((e) => {
      // 경계 안에서는 손끝에 1:1로 붙고, 밖으로 나가면 러버밴딩으로 저항 (apple-design §2, §9)
      x.value = withRubberband(startX.value + e.translationX, minX, maxX, width);
      y.value = withRubberband(startY.value + e.translationY, minY, maxY, height);
    })
    .onEnd((e) => {
      const finalX = clamp(x.value, minX, maxX);
      const finalY = clamp(y.value, minY, maxY);
      // 놓을 때의 제스처 속도를 그대로 스프링에 넘겨 손과 애니메이션 사이에 이질감이 없게 한다 (apple-design §5)
      x.value = withSpring(finalX, { damping: 20, stiffness: 300, velocity: e.velocityX });
      y.value = withSpring(finalY, { damping: 20, stiffness: 300, velocity: e.velocityY });
      scheduleOnRN(persistPosition, finalX, finalY);
    });
  const tap = Gesture.Tap().maxDistance(DRAG_TAP_THRESHOLD).onEnd((_event, success) => {
    if (success) scheduleOnRN(onPress);
  });

  const animatedStyle = useAnimatedStyle(() => ({
    left: x.value,
    top: y.value,
    opacity: ready ? 1 : 0,
  }));

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <Animated.View style={[styles.fab, animatedStyle]} accessible accessibilityRole="button"
        accessibilityLabel={iconName === 'close' ? '빠른 등록 닫기' : '빠른 등록 열기'}
        onAccessibilityTap={onPress}>
        <Ionicons name={iconName} size={24} color={Colors.white} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});

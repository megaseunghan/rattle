import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

const FAB_SIZE = 52;
const TAB_BAR_HEIGHT = 80;
const DRAG_TAP_THRESHOLD = 6; // 이 이하로 움직이면 드래그가 아니라 탭으로 간주
const STORAGE_KEY = 'rattle_fab_position_v1';

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
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
      if (raw) {
        try {
          const pos = JSON.parse(raw) as { x: number; y: number };
          x.value = clamp(pos.x, minX, maxX);
          y.value = clamp(pos.y, minY, maxY);
        } catch {
          // 저장된 값이 손상됐으면 기본 위치 유지
        }
      }
      setReady(true);
      onDragEnd?.(x.value, y.value);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });
  }, []);

  function persistPosition(px: number, py: number) {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ x: px, y: py }));
    onDragEnd?.(px, py);
  }

  const pan = Gesture.Pan()
    .minDistance(0) // 움직임이 거의 없는 순수 탭에서도 제스처가 확실히 활성화되도록
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((e) => {
      x.value = clamp(startX.value + e.translationX, minX, maxX);
      y.value = clamp(startY.value + e.translationY, minY, maxY);
    })
    .onFinalize((e) => {
      const moved = Math.abs(e.translationX) > DRAG_TAP_THRESHOLD || Math.abs(e.translationY) > DRAG_TAP_THRESHOLD;
      runOnJS(persistPosition)(x.value, y.value);
      if (!moved) runOnJS(onPress)();
    });

  const animatedStyle = useAnimatedStyle(() => ({
    left: x.value,
    top: y.value,
    opacity: ready ? 1 : 0,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.fab, animatedStyle]}>
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

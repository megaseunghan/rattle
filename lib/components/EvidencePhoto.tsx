import { useRef, useState } from 'react';
import { Animated, GestureResponderEvent, StyleSheet, View } from 'react-native';
import { Image, ImageProps } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';

// 확대하지 않은 사진을 위아래로 이만큼 밀거나 빠르게 튕기면 닫는다(사용자 결정 2026-11-25: 닫기 버튼 대신 밀기·바깥 누르기).
const DISMISS_DISTANCE = 48;
const DISMISS_VELOCITY = 0.5; // px/ms
const FADE_DISTANCE = 320;
const TAP_SLOP = 8;

interface Area { x: number; y: number; width: number; height: number }
interface Inset { top: number; bottom: number }
type Props = ImageProps & { onClose: () => void; inset?: Inset };

// 손가락 영역은 화면 전체(사진 밖 여백 포함)를 덮는다. 사진은 inset 안쪽에 맞춰 그린다.
export function EvidencePhoto({ onClose, inset = { top: 0, bottom: 0 }, ...image }: Props) {
  const [area, setArea] = useState<Area>({ x: 0, y: 0, width: 0, height: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const drag = useRef(new Animated.Value(0)).current;
  const gesture = useRef({ x: 0, y: 0, distance: 0, multiple: false, dragging: false, lastY: 0, lastT: 0, velocity: 0, start: transform });
  const fit = size.width && size.height ? Math.min(area.width / size.width, area.height / size.height) : 0;
  const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
  const backdrop = drag.interpolate({ inputRange: [-FADE_DISTANCE, 0, FADE_DISTANCE], outputRange: [0.15, 1, 0.15], extrapolate: 'clamp' });

  function track(pageY: number, timestamp?: number) {
    const g = gesture.current;
    const t = timestamp ?? Date.now();
    if (t > g.lastT) g.velocity = (pageY - g.lastY) / (t - g.lastT);
    g.lastY = pageY; g.lastT = t;
  }

  function touch(event: GestureResponderEvent) {
    const { touches, pageX, pageY, timestamp } = event.nativeEvent;
    const g = gesture.current;
    if (touches.length > 1) {
      g.multiple = true;
      if (g.dragging) { g.dragging = false; drag.setValue(0); }
      const [a, b] = touches;
      const distance = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
      if (!g.distance) g.distance = distance;
      if (distance && g.distance) {
        const scale = Math.max(1, Math.min(4, g.start.scale * distance / g.distance));
        setTransform({ scale, x: 0, y: 0 });
      }
    } else if (!g.multiple && g.start.scale > 1) {
      const bound = (length: number, viewport: number) => Math.max(0, (length * fit * g.start.scale - viewport) / 2);
      setTransform({ ...g.start, x: clamp(g.start.x + pageX - g.x, bound(size.width, area.width)),
        y: clamp(g.start.y + pageY - g.y, bound(size.height, area.height)) });
    } else if (!g.multiple) {
      const dx = pageX - g.x, dy = pageY - g.y;
      if (!g.dragging && Math.abs(dy) > TAP_SLOP && Math.abs(dy) > Math.abs(dx)) g.dragging = true;
      if (g.dragging) { drag.setValue(dy); track(pageY, timestamp); }
    }
  }

  function release(e: GestureResponderEvent['nativeEvent']) {
    const g = gesture.current;
    if (g.multiple) return;
    const dx = Math.abs(e.pageX - g.x), dy = e.pageY - g.y;
    if (g.start.scale === 1 && Math.abs(dy) > Math.abs(dx)
      && (Math.abs(dy) >= DISMISS_DISTANCE || (g.dragging && Math.abs(g.velocity) >= DISMISS_VELOCITY))) {
      Animated.timing(drag, { toValue: Math.sign(dy || 1) * (area.height || FADE_DISTANCE), duration: 160, useNativeDriver: true })
        .start(() => onClose());
      return;
    }
    if (g.dragging) {
      Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 24 }).start();
      return;
    }
    const outside = fit > 0 && (Math.abs(e.locationX - area.x - area.width / 2 - g.start.x) > size.width * fit * g.start.scale / 2 ||
      Math.abs(e.locationY - area.y - area.height / 2 - g.start.y) > size.height * fit * g.start.scale / 2);
    if (dx < TAP_SLOP && Math.abs(dy) < TAP_SLOP && outside) onClose();
  }

  return <View testID="evidence-photo" style={styles.fill} onAccessibilityEscape={onClose}
    accessible accessibilityRole="image" accessibilityLabel="증빙 사진"
    accessibilityHint="두 손가락으로 문지르면 닫혀요."
    onStartShouldSetResponder={() => true}
    onResponderGrant={({ nativeEvent }) => {
      gesture.current = { x: nativeEvent.pageX, y: nativeEvent.pageY, distance: 0, multiple: nativeEvent.touches.length > 1,
        dragging: false, lastY: nativeEvent.pageY, lastT: nativeEvent.timestamp ?? Date.now(), velocity: 0, start: transform };
    }}
    onTouchStart={event => { if (event.nativeEvent.touches.length > 1) touch(event); }} onResponderMove={touch}
    onResponderRelease={({ nativeEvent }) => release(nativeEvent)}
    onResponderTerminate={() => { gesture.current.dragging = false; drag.setValue(0); }}>
    <Animated.View testID="evidence-backdrop" pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]} />
    <View pointerEvents="none" style={[styles.fill, { paddingTop: inset.top, paddingBottom: inset.bottom }]}>
      <View style={styles.frame} onLayout={({ nativeEvent }) => setArea(nativeEvent.layout)}>
        <Animated.View style={[styles.frame, { transform: [{ translateY: drag }] }]}>
          <View style={[styles.frame, { transform: [{ translateX: transform.x }, { translateY: transform.y }, { scale: transform.scale }] }]}>
            <Image {...image} onLoad={event => setSize(event.source)} style={styles.frame} contentFit="contain" />
          </View>
        </Animated.View>
      </View>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  frame: { flex: 1, overflow: 'hidden' },
  backdrop: { backgroundColor: Colors.homeCanvas },
});

/** 모달 안 SafeAreaProvider 아래에서 쓰는 전체 화면 보기. 배경은 화면 끝까지, 사진은 상태 표시줄·홈 표시줄 안쪽에 둔다. */
export function EvidenceViewerPhoto(props: Omit<Props, 'inset'>) {
  const { top, bottom } = useSafeAreaInsets();
  return <EvidencePhoto {...props} inset={{ top, bottom }} />;
}

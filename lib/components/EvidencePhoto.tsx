import { useRef, useState } from 'react';
import { GestureResponderEvent, StyleSheet, View } from 'react-native';
import { Image, ImageProps } from 'expo-image';

// The responder covers the whole viewport, including the letterboxed margins.
export function EvidencePhoto({ onClose, ...image }: ImageProps & { onClose: () => void }) {
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const gesture = useRef({ x: 0, y: 0, distance: 0, multiple: false, start: transform });
  const fit = size.width && size.height ? Math.min(frame.width / size.width, frame.height / size.height) : 0;
  const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

  function touch(event: GestureResponderEvent) {
    const { touches, pageX, pageY } = event.nativeEvent;
    const g = gesture.current;
    if (touches.length > 1) {
      g.multiple = true;
      const [a, b] = touches;
      const distance = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
      if (!g.distance) g.distance = distance;
      if (distance && g.distance) {
        const scale = Math.max(1, Math.min(4, g.start.scale * distance / g.distance));
        setTransform({ scale, x: 0, y: 0 });
      }
    } else if (!g.multiple && g.start.scale > 1) {
      const bound = (length: number, viewport: number) => Math.max(0, (length * fit * g.start.scale - viewport) / 2);
      setTransform({ ...g.start, x: clamp(g.start.x + pageX - g.x, bound(size.width, frame.width)),
        y: clamp(g.start.y + pageY - g.y, bound(size.height, frame.height)) });
    }
  }

  return <View testID="evidence-photo" style={styles.frame} onAccessibilityEscape={onClose}
    onLayout={({ nativeEvent }) => setFrame(nativeEvent.layout)}
    onStartShouldSetResponder={() => true}
    onResponderGrant={({ nativeEvent }) => {
      gesture.current = { x: nativeEvent.pageX, y: nativeEvent.pageY, distance: 0, multiple: nativeEvent.touches.length > 1, start: transform };
    }}
    onTouchStart={event => { if (event.nativeEvent.touches.length > 1) touch(event); }} onResponderMove={touch}
    onResponderRelease={({ nativeEvent: e }) => {
      const g = gesture.current;
      if (g.multiple) return;
      const dx = Math.abs(e.pageX - g.x), dy = Math.abs(e.pageY - g.y);
      const outside = fit > 0 && (Math.abs(e.locationX - frame.width / 2 - g.start.x) > size.width * fit * g.start.scale / 2 ||
        Math.abs(e.locationY - frame.height / 2 - g.start.y) > size.height * fit * g.start.scale / 2);
      if ((g.start.scale === 1 && dy >= 60 && dy > dx * 1.5) || (dx < 8 && dy < 8 && outside)) onClose();
    }}>
    <View pointerEvents="none" style={[styles.frame, { transform: [{ translateX: transform.x }, { translateY: transform.y }, { scale: transform.scale }] }]}>
      <Image {...image} onLoad={event => setSize(event.source)} style={styles.frame} contentFit="contain" />
    </View>
  </View>;
}
const styles = StyleSheet.create({ frame: { flex: 1, overflow: 'hidden' } });

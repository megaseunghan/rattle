import { Children, cloneElement, isValidElement, ReactElement, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Modal, Platform, StyleSheet, useWindowDimensions, View, ViewProps } from 'react-native';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Colors } from '../../../constants/colors';
import { DetailSheetMotion } from '../../../constants/designTokens';

type OverlayProps = ViewProps & { children?: React.ReactNode };
/** Keep the scrim fixed. Only the transparent content layer travels by the sheet's measured height.
 * Children must be the existing full-screen overlay, whose last element is the sheet surface.
 * Preserves that overlay's keyboard handling, backdrop press and safe-area layout.
 */
export function SheetModal({ visible, onRequestClose, onDismiss, children }: {
  visible: boolean; onRequestClose: () => void; onDismiss?: () => void; children: ReactElement<OverlayProps>;
}) {
  const { height } = useWindowDimensions();
  const lastContent = useRef(children);
  if (visible) lastContent.current = children;
  const overlay = visible ? children : lastContent.current;
  const [rendered, setRendered] = useState(visible);
  const [shown, setShown] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0);
  const entered = useRef(false);
  const transition = useRef(0);
  const alive = useRef(true);
  const currentVisible = useRef(visible);
  currentVisible.current = visible;
  const opacity = useSharedValue(0);
  const offset = useSharedValue(height);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  function finishClose(generation: number) {
    if (alive.current && !currentVisible.current && generation === transition.current) { setRendered(false); setShown(false); entered.current = false; if (Platform.OS !== 'ios') onDismiss?.(); }
  }
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; cancelAnimation(opacity); cancelAnimation(offset); };
  }, [opacity, offset]);
  useEffect(() => {
    const generation = ++transition.current;
    if (visible && !rendered) {
      entered.current = false; setShown(false); opacity.value = 0; offset.value = height; setRendered(true);
      return;
    }
    if (!rendered) return;
    if (visible && shown && sheetHeight > 0) {
      if (!entered.current) { offset.value = sheetHeight; entered.current = true; }
      opacity.value = withTiming(1, { duration: DetailSheetMotion.backdropEnter, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System });
      offset.value = withTiming(0, { duration: DetailSheetMotion.enter, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System });
    } else if (!visible) {
      opacity.value = withTiming(0, { duration: DetailSheetMotion.backdropExit, easing: Easing.in(Easing.quad), reduceMotion: ReduceMotion.System });
      offset.value = withTiming(sheetHeight || height, { duration: DetailSheetMotion.exit, easing: Easing.in(Easing.cubic), reduceMotion: ReduceMotion.System }, finished => {
        if (finished) scheduleOnRN(finishClose, generation);
      });
    }
  }, [visible, rendered, shown, sheetHeight, height, opacity, offset]);
  const parts = Children.toArray(overlay.props.children);
  const surfaceIndex = parts.findLastIndex(isValidElement);
  const content = cloneElement(overlay, { style: [overlay.props.style, styles.clear] }, parts.map((part, index) => {
    if (index !== surfaceIndex || !isValidElement<ViewProps>(part)) return part;
    return cloneElement(part, { onLayout: (event: LayoutChangeEvent) => {
      setSheetHeight(event.nativeEvent.layout.height); part.props.onLayout?.(event);
    } });
  }));
  const color = StyleSheet.flatten(overlay.props.style)?.backgroundColor ?? Colors.overlaySheet;
  return <Modal visible={rendered} onDismiss={onDismiss} transparent animationType="none" onShow={() => setShown(true)} onRequestClose={onRequestClose}>
    <View style={styles.root}>
      <Animated.View testID="sheet-fixed-backdrop" pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color }, backdropStyle]} />
      <Animated.View pointerEvents={visible ? 'auto' : 'none'} testID="sheet-moving-content" style={[styles.root, contentStyle]} accessibilityViewIsModal onAccessibilityEscape={onRequestClose}>{content}</Animated.View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({ root: { flex: 1 }, clear: { backgroundColor: 'transparent' } });

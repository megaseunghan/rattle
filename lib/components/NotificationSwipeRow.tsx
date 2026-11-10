import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AppState, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { TabPagerContext } from '../contexts/TabPagerContext';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import type { AppNotification } from '../../types';
const categories = { attendance: '근무', stock: '재고', sales: '매출', members: '매장 참여' };
export function notificationRelativeTime(iso: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / 1440)}일 전`;
}
export function NotificationSwipeRow({ item, disabled, onPress, onDeleteRequest, onGesture, scrollGesture }: {
  item: AppNotification; disabled: boolean; onPress: () => void; onDeleteRequest: () => void | boolean | Promise<void | boolean>; onGesture?: (id: string, active: boolean) => void; scrollGesture?: ReturnType<typeof Gesture.Native>;
}) {
  const owner = useId(), pager = useContext(TabPagerContext);
  const reduced = useReducedMotion();
  const translate = useSharedValue(0);
  const width = useSharedValue(Math.max(1, Dimensions.get('window').width - 32));
  const screenWidth = useSharedValue(Dimensions.get('window').width);
  const naturalHeight = useSharedValue(79), clipHeight = useSharedValue(-1), opacity = useSharedValue(1);
  const startPosition = useSharedValue(0), blocked = useSharedValue(false), longPressReveal = useSharedValue(false);
  const activeUI = useSharedValue(AppState.currentState === 'active');
  const swiped = useRef(false), activeRef = useRef(AppState.currentState === 'active');
  const mounted = useRef(true), committing = useRef(false), writing = useRef(false), generation = useRef(0);
  const [active, setActive] = useState(activeRef.current), [opened, setOpened] = useState(false), [pending, setPending] = useState(false);
  const latest = useRef({ disabled, onPress, onDeleteRequest, onGesture, pager });
  latest.current = { disabled, onPress, onDeleteRequest, onGesture, pager };
  function lock(value: boolean) { latest.current.onGesture?.(item.id, value); latest.current.pager?.setPagerGestureActive?.(owner, value); }
  function showOpened(value: boolean) { if (mounted.current) setOpened(value); }
  function touchStart() { swiped.current = false; }
  function gestureStart() { swiped.current = true; if (!longPressReveal.value) setOpened(false); lock(true); }
  function settle(value: number, velocity = 0) {
    cancelAnimation(translate);
    translate.value = reduced ? value : withSpring(value, { damping: 38, stiffness: 420, velocity, overshootClamping: true });
    showOpened(value === -80);
  }
  function reset() {
    generation.current++; cancelAnimation(translate); cancelAnimation(clipHeight); cancelAnimation(opacity);
    translate.value = 0; clipHeight.value = -1; opacity.value = 1;
    // An in-flight write still owns this row until it resolves.
    if (!writing.current) { committing.current = false; blocked.value = false; setPending(false); }
    showOpened(false); lock(false);
  }
  function recover() {
    if (!mounted.current) return;
    cancelAnimation(clipHeight); cancelAnimation(translate);
    const finish = () => {
      if (!mounted.current) return;
      clipHeight.value = -1; committing.current = false; blocked.value = false; setPending(false);
    };
    opacity.value = reduced ? 1 : withTiming(1, { duration: 180 });
    translate.value = reduced ? 0 : withSpring(0, { damping: 38, stiffness: 420, overshootClamping: true });
    if (reduced) { clipHeight.value = -1; finish(); }
    else clipHeight.value = withTiming(naturalHeight.value, { duration: 230, easing: Easing.out(Easing.cubic) }, done => { if (done) scheduleOnRN(finish); });
  }
  async function finishDelete(token: number) {
    if (!mounted.current || generation.current !== token || !committing.current) return;
    if (!activeRef.current || latest.current.disabled) { reset(); return; }
    writing.current = true;
    try {
      const result = await latest.current.onDeleteRequest();
      writing.current = false;
      if (mounted.current && result !== true) recover();
    } catch { writing.current = false; if (mounted.current) recover(); }
  }
  function collapse(token: number) {
    if (!mounted.current || generation.current !== token) return;
    clipHeight.value = naturalHeight.value;
    if (reduced) { clipHeight.value = 0; opacity.value = 0; void finishDelete(token); }
    else {
      opacity.value = withTiming(0, { duration: 180 });
      clipHeight.value = withTiming(0, { duration: 230, easing: Easing.out(Easing.cubic) }, done => { if (done) scheduleOnRN(finishDelete, token); });
    }
  }
  function requestDelete(velocity = 0) {
    if (committing.current || !activeRef.current || latest.current.disabled) { if (!committing.current) reset(); return; }
    committing.current = true; blocked.value = true; setPending(true); setOpened(false); lock(false);
    const token = ++generation.current;
    cancelAnimation(translate);
    if (reduced) { translate.value = -width.value - 8; collapse(token); }
    else translate.value = withSpring(-width.value - 8, { damping: 38, stiffness: 420, velocity: Math.min(velocity, -450), overshootClamping: true }, done => { if (done) scheduleOnRN(collapse, token); });
  }
  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener('change', state => {
      activeRef.current = state === 'active'; activeUI.value = activeRef.current; setActive(activeRef.current);
      if (!activeRef.current) reset();
    });
    return () => { mounted.current = false; generation.current++; sub.remove(); cancelAnimation(translate); cancelAnimation(clipHeight); cancelAnimation(opacity); lock(false); };
  }, [owner, item.id]);
  useEffect(() => { if (disabled && !committing.current) reset(); }, [disabled]);
  const pan = useMemo(() => Gesture.Pan().withTestId(`notification-swipe-${item.id}`).enabled(active && !disabled)
    .blocksExternalGesture(...(scrollGesture ? [scrollGesture] : []))
    .activeOffsetX([-12, 12]).failOffsetY([-8, 8]).maxPointers(1)
    .onTouchesDown((event, manager) => {
      longPressReveal.value = false; scheduleOnRN(touchStart);
      const x = event.allTouches[0]?.absoluteX;
      if (blocked.value || x == null || x < 24 || x > screenWidth.value - 24) manager.fail();
    })
    .onStart(() => { cancelAnimation(translate); startPosition.value = translate.value; scheduleOnRN(gestureStart); })
    .onUpdate(event => { if (!blocked.value) translate.value = Math.max(-width.value - 8, Math.min(0, startPosition.value + event.translationX)); })
    .onEnd((event, success) => {
      if (!success || blocked.value || !activeUI.value) return;
      const distance = Math.max(0, -(startPosition.value + event.translationX));
      const velocity = Number.isFinite(event.velocityX) ? event.velocityX : 0;
      const shouldDelete = velocity <= 0 && (distance >= width.value * 0.65 || (distance >= 80 && velocity < -850 && distance - velocity * 0.16 >= width.value * 0.65));
      if (shouldDelete) { blocked.value = true; scheduleOnRN(requestDelete, velocity); }
      else {
        const target = velocity > 250 ? 0 : distance - velocity * 0.08 > 40 ? -80 : 0;
        translate.value = reduced ? target : withSpring(target, { damping: 38, stiffness: 420, velocity, overshootClamping: true });
        scheduleOnRN(showOpened, target === -80);
      }
    })
    .onFinalize((_event, success) => {
      scheduleOnRN(lock, false);
      if (!success && !blocked.value && !longPressReveal.value) {
        translate.value = reduced ? 0 : withSpring(0, { damping: 38, stiffness: 420, overshootClamping: true });
        scheduleOnRN(showOpened, false);
      }
    }), [active, disabled, item.id, owner, reduced, scrollGesture]);
  const rowMotion = useAnimatedStyle(() => ({ transform: [{ translateX: translate.value }] }));
  const actionMotion = useAnimatedStyle(() => ({ left: width.value + 8, width: Math.max(72, -translate.value - 8), transform: [{ translateX: translate.value }] }));
  const clipMotion = useAnimatedStyle(() => ({ height: clipHeight.value < 0 ? undefined : clipHeight.value, opacity: opacity.value }));
  return <Animated.View testID={`notification-row-${item.id}`} style={[styles.clip, clipMotion]} onLayout={event => {
    const next = event.nativeEvent.layout.width;
    if (next > 0) width.value = next;
    screenWidth.value = Dimensions.get('window').width;
  }}>
    <Animated.View style={[styles.action, actionMotion]}
      pointerEvents={opened && !disabled && !pending ? 'auto' : 'none'} accessibilityElementsHidden={!opened} importantForAccessibility={opened ? 'auto' : 'no-hide-descendants'}>
      <Pressable testID={`notification-delete-${item.id}`} disabled={disabled || !opened || pending} accessibilityRole="button" accessibilityLabel="내 목록에서 삭제"
        onPress={() => requestDelete()} style={styles.delete}><Text style={styles.deleteText}>삭제</Text></Pressable>
    </Animated.View>
    <GestureDetector gesture={pan}><Animated.View style={rowMotion} onLayout={event => { if (event.nativeEvent.layout.height > 0) naturalHeight.value = event.nativeEvent.layout.height; }}>
      <Pressable disabled={disabled || pending} onPress={() => { if (!swiped.current && !committing.current) { if (translate.value !== 0) settle(0); else latest.current.onPress(); } }}
        onLongPress={() => { if (!disabled && !committing.current) { swiped.current = true; longPressReveal.value = true; settle(-80); } }}
        accessibilityRole="button" accessibilityLabel={`${item.is_read ? '읽음' : '읽지 않음'}, ${item.message}, ${notificationRelativeTime(item.created_at)}`}
        accessibilityHint="왼쪽으로 짧게 밀면 삭제 버튼, 끝까지 밀면 내 목록에서 바로 삭제해요"
        accessibilityState={{ disabled: disabled || pending }} accessibilityActions={[{ name: 'delete', label: '내 목록에서 삭제' }]}
        onAccessibilityAction={({ nativeEvent }) => { if (nativeEvent.actionName === 'delete') requestDelete(); }}
        style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}>
        <View style={styles.body}><Text style={[styles.message, !item.is_read && styles.unread]}>{item.message}</Text>
          <Text style={styles.meta}>{categories[item.category]} · {notificationRelativeTime(item.created_at)}</Text></View>
        {!item.is_read && <View style={styles.dot} />}
      </Pressable>
    </Animated.View></GestureDetector>
  </Animated.View>;
}
const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  action: { position: 'absolute', top: 10, bottom: 10, minHeight: 44 },
  delete: { flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: Colors.action, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontFamily: Fonts.wantedMedium, fontSize: 13, color: Colors.white },
  row: { backgroundColor: Colors.homeCanvas, flexDirection: 'row', alignItems: 'flex-start', minHeight: 79, paddingVertical: 13, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.homeBorder },
  body: { flex: 1, minWidth: 0 }, message: { fontFamily: Fonts.wantedRegular, fontSize: 13, lineHeight: 20, color: Colors.gray600 },
  unread: { fontFamily: Fonts.wantedMedium, color: Colors.black }, meta: { fontFamily: Fonts.wantedRegular, fontSize: 11, lineHeight: 16, color: Colors.gray600, marginTop: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.action, marginTop: 8 }, pressed: { opacity: 0.7 }, disabled: { opacity: 0.5 },
});

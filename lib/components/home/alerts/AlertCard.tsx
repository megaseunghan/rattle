/* S04 홈 알림 카드 한 장. 펼친 목록에서는 좌우로 밀어 홈에서 숨긴다(2026-11-27 확정 시안). */
import { useContext, useEffect, useId, useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Colors } from '../../../../constants/colors';
import { Fonts } from '../../../../constants/fonts';
import { Type } from '../../../../constants/designTokens';
import { AppIcon } from '../../../icons/AppIcon';
import { TabPagerContext } from '../../../contexts/TabPagerContext';

export interface AlertCardItem {
  key: string;
  title: string;
  description: string;
  /** 누르면 이동할 화면 설명(접근성 안내) */
  actionHint: string;
  onPress: () => void;
  /** 없으면 홈에서 닫을 수 없는 카드다. */
  onDismiss?: () => void;
}
interface Props {
  item: AlertCardItem;
  swipeable: boolean;
  disabled: boolean;
  /** 접힌 묶음 맨 위 카드를 누르면 펼친다. */
  expandCount?: number;
  onExpand?: () => void;
}

const SWIPE_THRESHOLD = 90;
const LEAVE_MS = 160;

function useSwipe(enabled: boolean, onDismiss?: () => void) {
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const offset = useRef(new Animated.Value(0)).current;
  const pager = useContext(TabPagerContext);
  const lock = pager?.setPagerGestureActive ?? pager?.setAlertGestureActive;
  const owner = useId();
  const current = useRef({ enabled, onDismiss, reduced, width, lock });
  current.current = { enabled, onDismiss, reduced, width, lock };
  useEffect(() => () => lock?.(owner, false, true), [lock, owner]);
  const release = (dx: number) => {
    const state = current.current;
    state.lock?.(owner, false, true);
    if (!state.onDismiss || Math.abs(dx) < SWIPE_THRESHOLD) {
      if (state.reduced) offset.setValue(0); else Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start();
      return;
    }
    const dismiss = state.onDismiss;
    if (state.reduced) { offset.setValue(0); dismiss(); return; }
    Animated.timing(offset, { toValue: Math.sign(dx) * state.width, duration: LEAVE_MS, useNativeDriver: true })
      .start(() => { offset.setValue(0); dismiss(); });
  };
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => current.current.enabled && !!current.current.onDismiss
      && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderGrant: () => current.current.lock?.(owner, true),
    onPanResponderMove: (_, g) => offset.setValue(g.dx),
    onPanResponderRelease: (_, g) => release(g.dx),
    onPanResponderTerminate: () => release(0),
    onPanResponderTerminationRequest: () => false,
  })).current;
  const opacity = offset.interpolate({ inputRange: [-300, 0, 300], outputRange: [0.4, 1, 0.4], extrapolate: 'clamp' });
  return { handlers: enabled ? responder.panHandlers : {}, style: { transform: [{ translateX: offset }], opacity } };
}

export function AlertCard({ item, swipeable, disabled, expandCount, onExpand }: Props) {
  const swipe = useSwipe(swipeable && !disabled, item.onDismiss);
  const expands = !!onExpand && (expandCount ?? 0) > 1;
  const label = `${item.title}, ${item.description}${expands ? `, 알림 ${expandCount}건 펼치기` : ''}`;
  return <Animated.View style={[styles.card, swipe.style]} testID={`home-alert-${item.key}`} {...swipe.handlers}>
    <View style={styles.badge} />
    <Pressable style={({ pressed }) => [styles.body, pressed && styles.pressed]} disabled={disabled}
      accessibilityRole="button" accessibilityLabel={label} accessibilityHint={expands ? undefined : item.actionHint}
      accessibilityState={expands ? { expanded: false } : undefined}
      accessibilityActions={item.onDismiss ? [{ name: 'dismiss', label: '이 알림 홈에서 닫기' }] : undefined}
      onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'dismiss' && !disabled) item.onDismiss?.(); }}
      onPress={expands ? onExpand : item.onPress}>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.description}>{item.description}</Text>
    </Pressable>
    {item.onDismiss && <Pressable accessibilityRole="button" accessibilityLabel="이 알림 홈에서 닫기" disabled={disabled}
      onPress={item.onDismiss} hitSlop={4} style={({ pressed }) => [styles.close, pressed && styles.pressed, disabled && styles.disabled]}>
      <AppIcon name="close" size={18} color={Colors.gray500} accessible={false} />
    </Pressable>}
  </Animated.View>;
}

/** 접힌 묶음 뒤에 가장자리만 보이는 빈 카드. 읽기 도구에는 숨긴다. */
export const STACK_STEP = 9;
export function AlertCardShadow({ depth, extra }: { depth: 1 | 2; extra: number }) {
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.shadow, { bottom: extra - STACK_STEP * depth, zIndex: 3 - depth, transform: [{ scaleX: depth === 1 ? 0.95 : 0.9 }] }]} />;
}

const styles = StyleSheet.create({
  card: { zIndex: 3, flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.white, borderRadius: 16,
    paddingVertical: 4, paddingLeft: 16, paddingRight: 0, borderWidth: 1, borderColor: Colors.homeBorder },
  badge: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.action, marginTop: 18 },
  body: { flex: 1, minHeight: 44, paddingVertical: 10, gap: 3 },
  title: { fontFamily: Fonts.wantedBold, fontSize: Type.md, lineHeight: 21, color: Colors.black },
  description: { fontFamily: Fonts.wantedRegular, fontSize: Type.sm, lineHeight: 19, color: Colors.gray500 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  shadow: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.homeBorder },
  pressed: { opacity: 0.65 }, disabled: { opacity: 0.4 },
});

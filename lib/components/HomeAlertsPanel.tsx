import { useContext, useEffect, useId, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Type } from '../../constants/designTokens';
import { HomeAlert, Store } from '../../types';
import { useHomeAlerts } from '../hooks/useHomeAlerts';
import { AppIcon } from '../icons/AppIcon';
import { GlassCard } from './GlassCard';
import { Skeleton, SkeletonGroup } from './skeleton';
import { TabPagerContext } from '../contexts/TabPagerContext';

const TITLES: Record<HomeAlert['kind'], string> = {
  stock: '재고', fixedExpenseMissing: '고정비', tossNotSynced: '매출 동기화', monthClose: '월마감',
};
const SWIPE_THRESHOLD = 96;

/** A2 확정안: 제목/설명 + 행동 하나. 숨기기는 스와이프와 접근성 사용자 지정 동작. */
function AlertRow({ alert, disabled, saving, onHide }: {
  alert: HomeAlert; disabled: boolean; saving: boolean; onHide: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const setAlertGestureActive = useContext(TabPagerContext)?.setAlertGestureActive;
  const gestureOwner = useId();
  const touches = useRef(new Set<string>());
  const origin = useRef<{ x: number; y: number } | null>(null);
  const multiTouch = useRef(false);
  useEffect(() => () => setAlertGestureActive?.(gestureOwner, false), [setAlertGestureActive, gestureOwner]);
  const offset = useRef(new Animated.Value(0)).current;
  const current = useRef({ disabled, onHide });
  current.current = { disabled, onHide };
  const reset = () => offset.setValue(0);
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => !current.current.disabled && !multiTouch.current && g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderMove: (event, g) => {
      if (g.numberActiveTouches > 1) multiTouch.current = true;
      const dx = origin.current && Number.isFinite(event.nativeEvent?.pageX) ? event.nativeEvent.pageX - origin.current.x : g.dx;
      if (!current.current.disabled) offset.setValue(Math.max(-144, Math.min(0, dx)));
    },
    onPanResponderRelease: (event, g) => {
      // PanResponder는 중간 grant 시 dx=0으로 재설정하므로 실제 터치 시작점을 기준으로 한다.
      const dx = origin.current && Number.isFinite(event.nativeEvent?.pageX) ? event.nativeEvent.pageX - origin.current.x : g.dx;
      const dy = origin.current && Number.isFinite(event.nativeEvent?.pageY) ? event.nativeEvent.pageY - origin.current.y : g.dy;
      reset();
      origin.current = null;
      if (!current.current.disabled && !multiTouch.current && dx <= -SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 2) current.current.onHide();
    },
    onPanResponderTerminate: () => { reset(); origin.current = null; },
    onPanResponderTerminationRequest: () => true,
  })).current;
  useEffect(() => { if (disabled) reset(); }, [disabled]); // no timed motion; respects reduced motion
  return <View style={styles.row} testID={`home-alert-${alert.key}`} {...responder.panHandlers}
    onTouchStart={event => {
      // 숨기기는 한 손가락으로만 수행한다. 이전/다른 손가락의 시작점으로 오탐하지 않는다.
      multiTouch.current = event.nativeEvent.touches.length !== 1;
      origin.current = multiTouch.current ? null : { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
      if (event.nativeEvent.touches.length === event.nativeEvent.changedTouches.length) {
        touches.current.clear();
      }
      event.nativeEvent.changedTouches.forEach(touch => touches.current.add(String(touch.identifier)));
      setAlertGestureActive?.(gestureOwner, touches.current.size > 0);
    }}
    onTouchEnd={event => {
      event.nativeEvent.changedTouches.forEach(touch => touches.current.delete(String(touch.identifier)));
      const ended = event.nativeEvent.touches.length === 0;
      if (ended) touches.current.clear();
      if (ended || touches.current.size === 0) setAlertGestureActive?.(gestureOwner, false, ended);
    }}
    onTouchCancel={event => {
      event.nativeEvent.changedTouches.forEach(touch => touches.current.delete(String(touch.identifier)));
      const ended = event.nativeEvent.touches.length === 0;
      if (ended) touches.current.clear();
      if (ended || touches.current.size === 0) setAlertGestureActive?.(gestureOwner, false, ended);
    }}>
    <View style={styles.under} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={styles.underLabel}>숨기기</Text>
    </View>
    <Animated.View style={[styles.slide, { transform: [{ translateX: offset }] }]}>
      <View style={styles.copy} accessible accessibilityLabel={`${TITLES[alert.kind]}, ${alert.message}`}
      accessibilityHint="왼쪽으로 밀어 알림 숨기기. 화면 이동은 아래 행동 버튼을 사용하세요."
      accessibilityActions={[{ name: 'hide', label: '이 알림 숨기기' }]}
      onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'hide' && !disabled) onHide(); }}>
        <Text style={styles.title}>{TITLES[alert.kind]}</Text>
        <Text style={styles.message}>{alert.message}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable disabled={disabled} accessibilityRole="button"
          accessibilityLabel={`${alert.actionLabel}, ${alert.message}`}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onPress={() => router.push(alert.route as never)}
          style={({ pressed }) => [styles.actionTarget, disabled && styles.disabled,
            focused && styles.focus, pressed && styles.pressed]}>
          <View style={styles.actionSurface}><Text style={styles.actionLabel}>{alert.actionLabel}</Text></View>
        </Pressable>
        {saving && <ActivityIndicator size="small" color={Colors.action} accessibilityLabel="숨김 저장 중" />}
      </View>
    </Animated.View>
  </View>;
}

type AlertData = ReturnType<typeof useHomeAlerts>;
function AlertsContent({ data, active }: { data: AlertData; active: boolean }) {
  const { alerts, loading, error, refetch, markRead, restoreRead } = data;
  const [saving, setSaving] = useState<string | null>(null);
  const [undo, setUndo] = useState<HomeAlert | null>(null);
  const [failure, setFailure] = useState<{ alert: HomeAlert; restoring: boolean } | null>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  const current = useRef({ active, alerts });
  current.current = { active, alerts };
  const generation = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; }; }, []);
  useEffect(() => {
    // 완료/실행취소는 현재 홈 탭 방문 중만 유지하고 이전 확인창도 무효화한다.
    generation.current += 1;
    if (!active) { setUndo(null); setFailure(null); }
  }, [active]);

  async function save(alert: HomeAlert, restoring = false) {
    if (busy.current || !current.current.active) return;
    busy.current = true;
    const issued = generation.current;
    setSaving(alert.key); setFailure(null);
    try {
      const valid = await (restoring ? restoreRead(alert.key) : markRead(alert.key));
      if (valid && mounted.current && issued === generation.current) setUndo(restoring ? null : alert);
    } catch {
      if (mounted.current && issued === generation.current) setFailure({ alert, restoring });
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(null);
    }
  }
  function confirmHide(alert: HomeAlert) {
    if (busy.current || !current.current.active) return;
    const issued = generation.current;
    Alert.alert('이 알림을 숨길까요?', `${TITLES[alert.kind]} 알림이 이 목록에서 숨겨져요. 업무가 해결된 것은 아니에요.`, [
      { text: '취소', style: 'cancel' },
      { text: '숨기기', onPress: () => {
        if (mounted.current && issued === generation.current && current.current.alerts.some(item => item.key === alert.key)) void save(alert);
      } },
    ], { cancelable: true });
  }
  const done = !!undo && alerts.length === 0 && !loading && !error;
  if (!error && !loading && alerts.length === 0 && !undo) return null;
  return <View style={styles.list}>
    <GlassCard contentStyle={styles.panel}>
      <View style={[styles.rows, loading && styles.loadingList]}>
        {alerts.map(alert => <AlertRow key={alert.key} alert={alert} disabled={saving !== null}
          saving={saving === alert.key} onHide={() => confirmHide(alert)} />)}
      </View>
      {loading && alerts.length === 0 && <SkeletonGroup label="홈 알림 불러오는 중" style={styles.rows}>
        {[0, 1].map(i => <Skeleton key={i} height={56} radius={14} />)}
      </SkeletonGroup>}
      {loading && alerts.length > 0 && <ActivityIndicator size="small" color={Colors.action} accessibilityLabel="홈 알림 불러오는 중" style={styles.loading} />}
      {done && <View style={styles.done} accessibilityLiveRegion="polite">
        <AppIcon name="checkmark" size={20} color={Colors.action} />
        <Text style={styles.doneText}>모든 알림을 확인했어요</Text>
      </View>}
      {error && <View style={styles.error} accessibilityLiveRegion="polite">
        <Text style={styles.errorText}>홈 알림을 불러오지 못했어요</Text>
        <Pressable accessibilityRole="button" disabled={saving !== null || loading} onPress={() => void refetch()} style={styles.textButton}>
          <Text style={styles.actionLabel}>다시 시도</Text>
        </Pressable>
      </View>}
      {failure && <View style={styles.error} accessibilityLiveRegion="polite">
        <Text style={styles.errorText}>{failure.restoring ? '알림을 복원하지 못했어요' : '숨김 상태를 저장하지 못했어요'}</Text>
        <Pressable accessibilityRole="button" disabled={saving !== null} onPress={() => void save(failure.alert, failure.restoring)} style={styles.textButton}>
          <Text style={styles.actionLabel}>다시 시도</Text>
        </Pressable>
      </View>}
    </GlassCard>
    {undo && <View style={styles.undo} accessibilityLiveRegion="polite">
      <Text style={styles.undoText}>{TITLES[undo.kind]} 알림을 숨겼어요</Text>
      <Pressable accessibilityRole="button" disabled={saving !== null} onPress={() => void save(undo, true)} style={styles.textButton}>
        <Text style={styles.actionLabel}>{saving === undo.key ? '처리 중' : '실행취소'}</Text>
      </Pressable>
    </View>}
  </View>;
}

export function HomeAlertsPanel({ active = true, refreshKey = 0, todaySales, store, financial = true }: {
  active?: boolean; refreshKey?: number; todaySales?: number; store?: Store; financial?: boolean;
}) {
  const data = useHomeAlerts(todaySales, store, financial, active);
  // 탭 진입은 enabled: active와 재사용 시간이 맡는다. 당겨서 새로고침(refreshKey 증가)만 다시 받는다.
  const lastRefresh = useRef(refreshKey);
  useEffect(() => {
    if (lastRefresh.current === refreshKey) return;
    lastRefresh.current = refreshKey;
    if (active) void data.refetch();
  }, [active, refreshKey, data.refetch]);
  // 계정·매장·공유 범위 전환 시 이전 실패/완료/실행취소와 확인창 콜백을 격리한다.
  return <AlertsContent key={data.scope} data={data} active={active} />;
}
const styles = StyleSheet.create({
  list: { gap: 8 }, panel: { padding: 8, gap: 8 },
  rows: { gap: 8 },
  row: { overflow: 'hidden', borderRadius: 14, backgroundColor: Colors.gray600 },
  under: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 16 },
  underLabel: { color: Colors.white, fontSize: Type.sm, fontWeight: '700' },
  slide: { backgroundColor: Colors.tinted, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 8, paddingLeft: 16, paddingRight: 8 },
  copy: { flexGrow: 1, flexShrink: 1, flexBasis: 150, minWidth: 0, gap: 4 },
  title: { fontSize: Type.base, lineHeight: 19, fontWeight: '700', color: Colors.black },
  message: { fontSize: 12, lineHeight: 18, color: Colors.gray600 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  actionTarget: { minHeight: 44, justifyContent: 'center', borderWidth: 2, borderColor: 'transparent', borderRadius: 10 },
  actionSurface: { minHeight: 32, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: Colors.white, justifyContent: 'center' },
  actionLabel: { fontSize: Type.sm, fontWeight: '700', color: Colors.action },
  focus: { borderColor: Colors.action }, pressed: { opacity: 0.65 }, disabled: { opacity: 0.5 },
  loadingList: { opacity: 0.6 }, loading: { paddingVertical: 8 },
  done: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  doneText: { flex: 1, fontSize: Type.sm, fontWeight: '700', color: Colors.gray600 },
  error: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingHorizontal: 8, gap: 8 },
  errorText: { flexGrow: 1, flexShrink: 1, flexBasis: 150, fontSize: Type.sm, color: Colors.gray600 },
  textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  undo: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingLeft: 16, paddingRight: 4, gap: 8 },
  undoText: { flexGrow: 1, flexShrink: 1, fontSize: Type.sm, color: Colors.gray600 },
});

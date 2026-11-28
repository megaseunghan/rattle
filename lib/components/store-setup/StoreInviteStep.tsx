/* design-system: DESIGN.md — 매장 시작하기 뒤 멤버 초대: 참여코드 복사·공유, 홈으로 가기. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Clipboard, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { AppIcon } from '../../icons/AppIcon';
import { createStoreInviteCode } from '../../services/storeMembers';
import { getErrorMessage } from '../../utils/error';
import { FlowError, FlowNextButton, useReduceMotion } from '../question-flow';
import { formatInviteCode, inviteShareMessage, spokenInviteCode } from './format';

const TOAST_MS = 1800;

type CodeState = { status: 'loading' } | { status: 'ready'; code: string } | { status: 'error'; message: string };

export interface StoreInviteStepProps {
  storeId: string;
  storeName: string;
  /** 미리보기 등 쓰기가 막힌 상태면 false. 코드 발급도 서버 쓰기다. */
  canWrite: () => boolean;
  onDone: () => Promise<void>;
}

export function StoreInviteStep({ storeId, storeName, canWrite, onDone }: StoreInviteStepProps) {
  const [code, setCode] = useState<CodeState>({ status: 'loading' });
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const toast = useToast();
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const load = useCallback(async () => {
    setCode({ status: 'loading' });
    try {
      if (!canWrite()) throw new Error('write blocked');
      const value = await createStoreInviteCode(storeId);
      if (alive.current) setCode({ status: 'ready', code: value });
    } catch (e) {
      // 매장은 이미 만들어졌다. 코드 자리만 다시 시도하게 한다.
      if (alive.current) setCode({ status: 'error', message: getErrorMessage(e, '참여코드를 불러오지 못했어요.') });
    }
  }, [canWrite, storeId]);
  useEffect(() => { void load(); }, [load]);
  const goHomeRef = useRef<() => void>(() => {});
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { goHomeRef.current(); return true; });
    return () => subscription.remove();
  }, []);

  function copy(value: string) {
    Clipboard.setString(formatInviteCode(value));
    toast.show('참여코드를 복사했어요');
  }
  async function share(value: string) {
    try { await Share.share({ message: inviteShareMessage(storeName, value) }); }
    catch { toast.show('공유하지 못했어요. 다시 시도해 주세요.'); }
  }
  async function goHome() {
    if (leaving) return;
    setLeaving(true); setLeaveError(null);
    try { await onDone(); }
    catch (e) { if (alive.current) setLeaveError(getErrorMessage(e, '홈으로 가지 못했어요. 다시 시도해 주세요.')); }
    finally { if (alive.current) setLeaving(false); }
  }
  goHomeRef.current = () => { void goHome(); };

  return <View style={styles.root}>
    <View style={styles.body}>
      <View style={styles.check} accessible={false}><AppIcon name="checkmark" size={28} color={Colors.action} /></View>
      <Text accessibilityRole="header" style={styles.title}>{'매장을 만들었어요\n함께 일할 멤버를 초대해 보세요'}</Text>
      <Text style={styles.description}>멤버가 래틀 앱의 ‘기존 매장 참여’에서 이 코드를 입력하면 참여 신청이 와요. 승인해야 합류돼요.</Text>
      <View style={styles.codeBox}>
        <Text style={styles.codeLabel} numberOfLines={1}>{storeName} 참여코드</Text>
        <CodeValue state={code} onRetry={() => { void load(); }} />
        <Text style={styles.codeHint}>멤버 관리에서 언제든 다시 볼 수 있어요</Text>
      </View>
      <View style={styles.actions}>
        <ActionButton icon="copy-outline" label="복사하기" disabled={code.status !== 'ready'}
          onPress={() => { if (code.status === 'ready') copy(code.code); }} />
        <ActionButton icon="share-outline" label="공유하기" primary disabled={code.status !== 'ready'}
          onPress={() => { if (code.status === 'ready') void share(code.code); }} />
      </View>
    </View>
    <Animated.View pointerEvents="none" style={[styles.toast, { opacity: toast.opacity }]} accessibilityLiveRegion="polite">
      <Text style={styles.toastText}>{toast.message}</Text>
    </Animated.View>
    <View style={styles.bottom}>
      {leaveError && <FlowError message={leaveError} />}
      <FlowNextButton label="홈으로 가기" loading={leaving} onPress={() => { void goHome(); }} />
    </View>
  </View>;
}

function CodeValue({ state, onRetry }: { state: CodeState; onRetry: () => void }) {
  if (state.status === 'ready') {
    return <Text style={styles.code} selectable accessibilityLabel={`참여코드 ${spokenInviteCode(state.code)}`}>{formatInviteCode(state.code)}</Text>;
  }
  if (state.status === 'loading') return <Text style={[styles.code, styles.codePending]} accessibilityLabel="참여코드 불러오는 중">····-····-····-····</Text>;
  return <View style={styles.codeError} accessibilityRole="alert">
    <Text style={styles.codeErrorText}>{state.message}</Text>
    <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="참여코드 다시 불러오기" style={styles.retry}>
      <Text style={styles.retryText}>다시 불러오기</Text>
    </Pressable>
  </View>;
}

function ActionButton({ icon, label, primary, disabled, onPress }: { icon: 'copy-outline' | 'share-outline'; label: string; primary?: boolean; disabled: boolean; onPress: () => void }) {
  const color = disabled ? Colors.gray400 : primary ? Colors.action : Colors.black;
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={`참여코드 ${label}`}
    accessibilityState={{ disabled }} style={({ pressed }) => [styles.action, primary && !disabled && styles.actionPrimary, pressed && styles.actionPressed]}>
    <AppIcon name={icon} size={18} color={color} />
    <Text style={[styles.actionText, { color }]}>{label}</Text>
  </Pressable>;
}

function useToast() {
  const reduce = useReduceMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = useCallback((text: string) => {
    setMessage(text);
    AccessibilityInfo.announceForAccessibility(text);
    clearTimeout(timer.current);
    if (reduce) opacity.setValue(1); else Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      if (reduce) opacity.setValue(0); else Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }, TOAST_MS);
  }, [opacity, reduce]);
  return { opacity, message, show };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.white },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  check: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  title: { fontSize: 24, lineHeight: 34, fontWeight: '700', color: Colors.black, marginTop: 20 },
  description: { fontSize: 14, lineHeight: 22, color: Colors.gray600, marginTop: 8 },
  codeBox: { marginTop: 32, paddingTop: 24, paddingBottom: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.gray100, alignItems: 'center' },
  codeLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  code: { fontFamily: Fonts.geistSemiBold, fontSize: 24, letterSpacing: 1, color: Colors.black, marginTop: 10 },
  codePending: { color: Colors.gray300 },
  codeHint: { fontSize: 12, color: Colors.gray500, marginTop: 10 },
  codeError: { alignItems: 'center', marginTop: 10 },
  codeErrorText: { fontSize: 14, lineHeight: 22, color: Colors.gray600, textAlign: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  retryText: { fontSize: 14, fontWeight: '600', color: Colors.action },
  actions: { flexDirection: 'row', gap: 8, marginTop: 20 },
  action: { flex: 1, minHeight: 52, borderRadius: 14, backgroundColor: Colors.gray50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionPrimary: { backgroundColor: Colors.bg },
  actionPressed: { opacity: 0.85 },
  actionText: { fontSize: 16, fontWeight: '600' },
  toast: { position: 'absolute', left: 20, right: 20, bottom: 96, backgroundColor: Colors.black, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16 },
  toastText: { fontSize: 14, color: Colors.white },
  bottom: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
});

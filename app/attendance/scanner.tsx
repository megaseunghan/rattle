import { Component, ComponentType, ReactNode, memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Platform, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScannerFrame } from '../../lib/components/ScannerFrame';
import { useKeepAwake } from 'expo-keep-awake';
import type { CameraViewProps } from 'expo-camera';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { Radius, Spacing, Type } from '../../constants/designTokens';
import { useAttendanceScanner } from '../../lib/hooks/useAttendanceScanner';
import * as Haptics from 'expo-haptics';
import { useReducedTransparency } from '../../lib/hooks/useReducedTransparency';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';

const qrSettings: CameraViewProps['barcodeScannerSettings'] = { barcodeTypes: ['qr'] };

class CameraBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export const CameraSurface = memo(function CameraSurface({ onScan, onAvailability }: { onScan: (data: string) => void; onAvailability: (ready: boolean) => void }) {
  const [camera, setCamera] = useState<ComponentType<CameraViewProps> | null>(null);
  const [status, setStatus] = useState('loading'); const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => { onAvailability(active && status === 'ready'); }, [active, status, onAvailability]);
  const current = useRef(false), permissionRequest = useRef(0);
  async function readPermission(request = false) {
    const version = ++permissionRequest.current;
    setCamera(null); setStatus('loading');
    try {
      const module = require('expo-camera') as typeof import('expo-camera');
      const permission = await (request ? module.Camera.requestCameraPermissionsAsync() : module.Camera.getCameraPermissionsAsync());
      if (!current.current || version !== permissionRequest.current) return;
      if (permission.granted) { setCamera(() => module.CameraView); setStatus('ready'); }
      else if (permission.status === 'undetermined') setStatus('firstRequest');
      else setStatus(permission.canAskAgain ? 'retry' : 'settings');
    } catch { if (current.current && version === permissionRequest.current) setStatus('missing'); }
  }
  useEffect(() => {
    current.current = true; void readPermission();
    const listener = AppState.addEventListener('change', next => {
      const foreground = next === 'active'; setActive(foreground);
      if (foreground) void readPermission();
      else { permissionRequest.current++; setCamera(null); }
    });
    return () => { current.current = false; permissionRequest.current++; listener.remove(); };
  }, []);
  const onBarcodeScanned = useCallback<NonNullable<CameraViewProps['onBarcodeScanned']>>(
    result => onScan(result.data), [onScan],
  );
  const unavailable = <View style={s.cameraFallback}><Text style={s.whiteTitle}>카메라를 사용할 수 없어요</Text><Text style={s.whiteBody}>앱을 최신 버전으로 설치한 뒤 다시 열어주세요</Text></View>;
  if (status === 'missing') return unavailable;
  if (status === 'loading') return <LoadingSpinner fullScreen={false} />;
  if (['firstRequest', 'retry', 'settings'].includes(status)) {
    const settings = status === 'settings';
    return <View style={s.cameraFallback}>
      <Text style={s.whiteTitle}>카메라를 허용해주세요</Text>
      <Text style={s.whiteBody}>{settings ? '설정에서 카메라를 허용해주세요' : 'QR을 찍으려면 카메라를 허용해주세요'}</Text>
      <Pressable accessibilityRole="button" style={s.action} onPress={() => {
        if (settings) void Linking.openSettings();
        else void readPermission(true);
      }}><Text style={s.whiteBody}>{settings ? '설정 열기' : '카메라 허용하기'}</Text></Pressable>
    </View>;
  }
  const Camera = camera;
  return <CameraBoundary fallback={unavailable}>{Camera && active && <Camera style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={qrSettings} onBarcodeScanned={onBarcodeScanned} onMountError={() => setStatus('missing')} />}</CameraBoundary>;
});
function signalRecognition() {
  if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility('QR을 읽었어요');
  void Haptics.selectionAsync().catch(() => {});
}

function NoticeCard({ animate, color, children }: { animate: boolean; color: string; children: ReactNode }) {
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const entered = useRef(false);
  useLayoutEffect(() => {
    if (!animate || entered.current) {
      progress.setValue(1);
      entered.current = true;
      return;
    }
    entered.current = true;
    const animation = Animated.timing(progress, {
      toValue: 1, duration: 240, easing: Easing.out(Easing.ease), useNativeDriver: true, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [animate, progress]);

  return <Animated.View testID="scanner-notice-card" style={[s.notice, { borderTopColor: color,
    opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  }]}>{children}</Animated.View>;
}

export default function AttendanceScannerScreen({ onLeft }: { onLeft?: () => void } = {}) {
  useKeepAwake('rattle-attendance-scanner');
  const scanner = useAttendanceScanner(undefined, signalRecognition); const insets = useSafeAreaInsets(); const { width, height } = useWindowDimensions();
  const [recovery, setRecovery] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(true);
  const reduceTransparency = useReducedTransparency();
  const staticFrame = reduceMotion || (Platform.OS === 'ios' && reduceTransparency);
  const repeat = scanner.state === 'repeatQr';
  const success = scanner.state === 'saved' || scanner.state === 'registered';
  const failed = scanner.state === 'scanFailed' || scanner.state === 'wrongQr';
  const processing = scanner.state === 'processing' || scanner.state === 'pairing';
  const result = scanner.needsConfirmation;
  const recoveryNotice = scanner.state === 'unknownSetup' || scanner.state === 'error';
  const canLeave = !!onLeft && scanner.canLeave;
  const showNotice = !!scanner.title && (cameraReady || result || recoveryNotice || canLeave || scanner.state === 'leaving');
  const nextAction = result ? '다음 QR을 찍으려면 확인을 눌러주세요' : '';
  const unresolvedLabel = scanner.unresolvedCount ? `확인할 기록 ${scanner.unresolvedCount}건이 있어요` : '';
  const noticeLabel = [scanner.title, scanner.time, scanner.body, unresolvedLabel, nextAction].filter(Boolean).join('. ');
  const lastAnnouncement = useRef('');
  useEffect(() => {
    const message = result || recoveryNotice ? noticeLabel : '';
    if (Platform.OS === 'ios' && message && lastAnnouncement.current !== message) {
      AccessibilityInfo.announceForAccessibility(message);
    }
    lastAnnouncement.current = message;
  }, [noticeLabel, result, recoveryNotice]);
  const frameColor = repeat ? Colors.warning : success ? Colors.success : failed ? Colors.danger
    : processing ? Colors.light : scanner.state === 'unknown' ? Colors.warning : Colors.white;

  useEffect(() => {
    let alive = true, motionChanged = false;
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      motionChanged = true; setReduceMotion(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (alive && !motionChanged) setReduceMotion(value);
    }).catch(() => {});
    return () => { alive = false; motion.remove(); };
  }, []);
  useEffect(() => {
    if (success || failed || repeat) {
      const feedback = repeat ? Haptics.NotificationFeedbackType.Warning : success ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error;
      void Haptics.notificationAsync(feedback).catch(() => {});
    }
  }, [success, failed, repeat, scanner.notice]);
  const size = Math.min(width - 80, 280, height * 0.32), top = Math.max(insets.top + 86, height * 0.19);
  return <View style={s.root}>
    <View style={[StyleSheet.absoluteFill, !cameraReady && (showNotice || !!unresolvedLabel) && s.cameraAboveNotice]}>
      <CameraSurface onAvailability={setCameraReady} onScan={scanner.scan} />
    </View>
    {cameraReady && <ScannerFrame size={size} top={top} left={(width - size) / 2} color={frameColor}
      phase={processing ? 'checking' : result || scanner.state === 'unknownSetup' ? 'result' : 'waiting'}
      symbol={success ? '✓' : failed ? '×' : repeat ? '!' : ''} staticFrame={staticFrame} />}
    {(cameraReady || showNotice || !!unresolvedLabel) && <ScrollView
      key={scanner.state} testID="scanner-notice-scroll"
      style={[s.noticeZone, { top: cameraReady ? top + size + 20 : height * 0.44, bottom: insets.bottom }]}
      contentContainerStyle={s.noticeContent}>
      {cameraReady && <Text style={s.caption}>{processing ? 'QR을 읽었어요' : result ? nextAction
        : scanner.ready ? '직원 QR을 스캔해주세요' : '사장님이나 점장님 앱의 등록 QR을 찍어주세요'}</Text>}
      {showNotice && <NoticeCard animate={result && !staticFrame} color={frameColor}>
        <View style={s.noticeText} accessible accessibilityLabel={noticeLabel} accessibilityLiveRegion="polite">
          <Text style={s.noticeTitle}>{scanner.title}</Text>
          {!!scanner.time && <Text style={s.time}>{scanner.time}</Text>}
          {!!scanner.body && <Text style={s.noticeBody}>{scanner.body}</Text>}
        </View>
        {recoveryNotice && <Pressable accessibilityRole="button" style={s.action} onPress={() => { void scanner.refresh(); }}>
          <Text style={s.whiteBody}>다시 확인</Text>
        </Pressable>}
        {scanner.state === 'unknownSetup' && <Pressable accessibilityRole="button" style={s.action} onPress={() => setRecovery(true)}>
          <Text style={s.whiteBody}>새 등록 준비하기</Text>
        </Pressable>}
        {result && <Pressable accessibilityRole="button" style={s.confirm} onPress={scanner.clearNotice}>
          <Text style={s.whiteTitle}>확인</Text>
        </Pressable>}
        {canLeave && <Pressable accessibilityRole="button" style={s.action} onPress={() => { void scanner.leave(onLeft); }}>
          <Text style={s.whiteBody}>일반 앱으로 돌아가기</Text>
        </Pressable>}
      </NoticeCard>}
      {!!unresolvedLabel && <View accessibilityLiveRegion="polite">
        <Text style={s.whiteBody}>{unresolvedLabel}</Text>
        <Text style={s.whiteBody}>해당 직원 휴대폰에서 기록을 확인해주세요</Text>
      </View>}
    </ScrollView>}
    <Modal visible={recovery} transparent animationType={staticFrame ? 'none' : 'fade'} onRequestClose={() => setRecovery(false)}><View style={s.shade}><View style={s.recoveryCard} accessibilityViewIsModal><Text style={s.recoveryTitle}>사장님이나 점장님 앱에서 확인했나요?</Text><Text style={s.recoveryBody}>등록돼 있다면 먼저 해제해주세요. 그다음 사장님이나 점장님 앱에서 새 등록 QR을 받아주세요.</Text><View style={s.actions}><Pressable accessibilityRole="button" style={s.action} onPress={() => setRecovery(false)}><Text style={s.recoveryAction}>닫기</Text></Pressable><Pressable accessibilityRole="button" style={s.action} onPress={() => { setRecovery(false); void scanner.confirmRegistrationRecovery(); }}><Text style={s.recoveryAction}>새 QR 찍기</Text></Pressable></View></View></View></Modal>
  </View>;
}
const s = StyleSheet.create({
  noticeText: { gap: 8 },
  cameraAboveNotice: { bottom: '56%' },
  confirm: { marginTop: 8, minHeight: 52, borderRadius: Radius.lg, backgroundColor: Colors.action, alignItems: 'center', justifyContent: 'center' },
  noticeTitle: { fontFamily: Fonts.wantedSemiBold, fontSize: 22, lineHeight: 30, color: Colors.white },
  noticeBody: { fontFamily: Fonts.wantedRegular, fontSize: 15, lineHeight: 23, color: Colors.gray300 },
  shade: { flex: 1, justifyContent: 'center', padding: Spacing.screenX, backgroundColor: Colors.overlayDetail }, recoveryCard: { padding: Spacing.screenX, gap: 16, borderRadius: Radius.xl, backgroundColor: Colors.white }, recoveryTitle: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.lg, color: Colors.black }, recoveryBody: { fontFamily: Fonts.wantedRegular, fontSize: Type.base, lineHeight: 22, color: Colors.gray600 }, recoveryAction: { color: Colors.action, fontFamily: Fonts.wantedMedium, fontSize: Type.base }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  root: { flex: 1, backgroundColor: Colors.black },
  caption: { textAlign: 'center', fontFamily: Fonts.wantedMedium, fontSize: Type.lg, color: Colors.white }, noticeZone: { position: 'absolute', left: 20, right: 20 },
  noticeContent: { flexGrow: 1, gap: 16, paddingBottom: 24 },
  notice: { backgroundColor: Colors.gray900, borderRadius: Radius.xl, padding: Spacing.screenX, gap: 12, borderTopWidth: 4, marginTop: 'auto', flexShrink: 0 },
  whiteTitle: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.lg, lineHeight: 26, textAlign: 'center', color: Colors.white }, whiteBody: { fontFamily: Fonts.wantedRegular, fontSize: Type.base, lineHeight: 22, textAlign: 'center', color: Colors.white }, time: { fontFamily: Fonts.geistMedium, fontSize: 32, color: Colors.white }, action: { minHeight: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  cameraFallback: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', padding: 32, gap: 12 } });

import { Component, ComponentType, ReactNode, memo, useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, AppState, Platform, Linking, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
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
      else { setStatus('denied'); if (request && !permission.canAskAgain) void Linking.openSettings(); }
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
  if (status === 'denied') return <View style={s.cameraFallback}><Text style={s.whiteTitle}>카메라를 허용해주세요</Text><Text style={s.whiteBody}>QR을 스캔하려면 설정에서 카메라를 허용해주세요</Text><Pressable accessibilityRole="button" style={s.action} onPress={() => { void readPermission(true); }}><Text style={s.whiteBody}>카메라 허용하기</Text></Pressable></View>;
  const Camera = camera;
  return <CameraBoundary fallback={unavailable}>{Camera && active && <Camera style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={qrSettings} onBarcodeScanned={onBarcodeScanned} onMountError={() => setStatus('missing')} />}</CameraBoundary>;
});
export default function AttendanceScannerScreen() {
  useKeepAwake('rattle-attendance-scanner');
  const scanner = useAttendanceScanner(); const insets = useSafeAreaInsets(); const { width, height } = useWindowDimensions();
  const [recovery, setRecovery] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(true);
  const reduceTransparency = useReducedTransparency();
  const staticFrame = reduceMotion || (Platform.OS === 'ios' && reduceTransparency);
  const opacity = useRef(new Animated.Value(1)).current;
  const success = scanner.state === 'saved' || scanner.state === 'registered';
  const failed = scanner.state === 'scanFailed' || scanner.state === 'wrongQr';
  const processing = scanner.state === 'processing' || scanner.state === 'pairing';
  const result = scanner.needsConfirmation;
  const waitingForQr = !processing && !result && scanner.canScan;
  const frameColor = success ? Colors.success : failed ? Colors.danger
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
    if (success || failed) {
      const feedback = success ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error;
      void Haptics.notificationAsync(feedback).catch(() => {});
    }
  }, [success, failed, scanner.notice]);
  useEffect(() => {
    opacity.setValue(1);
    if (!cameraReady || staticFrame || (!waitingForQr && !success)) return;
    const fade = (toValue: number, duration: number) =>
      Animated.timing(opacity, { toValue, duration, useNativeDriver: true, isInteraction: false });
    const animation = waitingForQr
      ? Animated.loop(Animated.sequence([fade(0.6, 900), fade(1, 900)]))
      : fade(1, 220);
    if (success) opacity.setValue(0.4);
    animation.start();
    return () => animation.stop();
  }, [cameraReady, staticFrame, waitingForQr, success, opacity]);
  const size = Math.min(width - 80, 280, height * 0.32), top = Math.max(insets.top + 86, height * 0.19);
  const path = 'M1 60V20Q1 1 20 1H60M220 1H260Q279 1 279 20V60M279 220V260Q279 279 260 279H220M60 279H20Q1 279 1 260V220';
  return <View style={s.root}>
    <CameraSurface onAvailability={setCameraReady} onScan={scanner.scan} />
    {cameraReady && <Animated.View pointerEvents="none" style={{ opacity, alignItems: 'center', justifyContent: 'center', position: 'absolute', width: size, height: size, left: (width - size) / 2, top }}><Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 280 280"><Path d={path} stroke={Colors.black} strokeWidth={4} fill="none" /><Path d={path} stroke={frameColor} strokeWidth={processing || result ? 5 : 3} fill="none" /></Svg>
      {processing && <ActivityIndicator size="large" color={Colors.white} />}
      {(success || failed) && <Text accessible={false} style={[s.symbol, { color: frameColor }]}>{success ? '✓' : '!'}</Text>}
    </Animated.View>}
    {cameraReady && <Text pointerEvents="none" style={[s.caption, { top: top + size + 20 }]}>{processing ? 'QR을 인식했어요' : result ? '다음 QR을 찍으려면 확인을 눌러주세요' : scanner.ready ? '직원 QR을 스캔해주세요' : '관리자 앱의 등록 QR을 찍어주세요'}</Text>}
    {cameraReady && !!scanner.title && <View style={[s.noticeZone, { top: top + size + 60, bottom: insets.bottom + (result && scanner.unresolvedCount ? 140 : 84) }]}><View style={s.notice} accessibilityLiveRegion="polite"><Text style={[s.whiteTitle, success && s.receipt]}>{scanner.title}</Text>{!!scanner.time && <Text style={s.time}>{scanner.time}</Text>}{!!scanner.body && <Text style={s.whiteBody}>{scanner.body}</Text>}
      {['error', 'unknownSetup'].includes(scanner.state) && <Pressable accessibilityRole="button" style={s.action} onPress={() => { void scanner.refresh(); }}><Text style={s.whiteBody}>다시 확인</Text></Pressable>}
      {scanner.state === 'unknownSetup' && <Pressable accessibilityRole="button" style={s.action} onPress={() => setRecovery(true)}><Text style={s.whiteBody}>새 등록 준비하기</Text></Pressable>}
    </View></View>}
    {!!scanner.unresolvedCount && <View style={[s.unresolved, { bottom: insets.bottom + (result ? 76 : 12) }]} accessibilityLiveRegion="polite"><Text style={s.whiteBody}>확인할 기록 {scanner.unresolvedCount}건이 있어요</Text><Text style={s.whiteBody}>해당 직원 휴대폰에서 기록을 확인해주세요</Text></View>}
    {result && <Pressable accessibilityRole="button" style={[s.confirm, { bottom: insets.bottom + 12 }]} onPress={scanner.clearNotice}>
      <Text style={s.whiteTitle}>확인</Text>
    </Pressable>}
    <Modal visible={recovery} transparent animationType={staticFrame ? 'none' : 'fade'} onRequestClose={() => setRecovery(false)}><View style={s.shade}><View style={s.recoveryCard} accessibilityViewIsModal><Text style={s.recoveryTitle}>관리자 앱에서 확인했나요?</Text><Text style={s.recoveryBody}>등록돼 있다면 먼저 해제해주세요. 그다음 관리자 앱에서 새 등록 QR을 받아주세요.</Text><View style={s.actions}><Pressable accessibilityRole="button" style={s.action} onPress={() => setRecovery(false)}><Text style={s.recoveryAction}>닫기</Text></Pressable><Pressable accessibilityRole="button" style={s.action} onPress={() => { setRecovery(false); void scanner.confirmRegistrationRecovery(); }}><Text style={s.recoveryAction}>새 QR 찍기</Text></Pressable></View></View></View></Modal>
  </View>;
}
const s = StyleSheet.create({
  confirm: { position: 'absolute', left: Spacing.screenX, right: Spacing.screenX, minHeight: 52, borderRadius: Radius.lg, backgroundColor: Colors.action, alignItems: 'center', justifyContent: 'center' },
  symbol: { fontSize: 42, fontFamily: Fonts.wantedSemiBold, backgroundColor: Colors.black, borderRadius: 32, width: 64, lineHeight: 64, textAlign: 'center', overflow: 'hidden' },
  receipt: { fontSize: 24, lineHeight: 32 },
  unresolved: { position: 'absolute', left: 20, right: 20, alignItems: 'center' },
  shade: { flex: 1, justifyContent: 'center', padding: Spacing.screenX, backgroundColor: Colors.overlayDetail }, recoveryCard: { padding: Spacing.screenX, gap: 16, borderRadius: Radius.xl, backgroundColor: Colors.white }, recoveryTitle: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.lg, color: Colors.black }, recoveryBody: { fontFamily: Fonts.wantedRegular, fontSize: Type.base, lineHeight: 22, color: Colors.gray600 }, recoveryAction: { color: Colors.action, fontFamily: Fonts.wantedMedium, fontSize: Type.base }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  root: { flex: 1, backgroundColor: Colors.black },
  caption: { position: 'absolute', left: 20, right: 20, textAlign: 'center', fontFamily: Fonts.wantedMedium, fontSize: Type.lg, color: Colors.white }, noticeZone: { position: 'absolute', left: 20, right: 20, justifyContent: 'center' }, notice: { backgroundColor: Colors.gray900, borderRadius: Radius.xl, padding: Spacing.screenX, gap: 8, alignItems: 'center' },
  whiteTitle: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.lg, lineHeight: 26, textAlign: 'center', color: Colors.white }, whiteBody: { fontFamily: Fonts.wantedRegular, fontSize: Type.base, lineHeight: 22, textAlign: 'center', color: Colors.white }, time: { fontFamily: Fonts.geistMedium, fontSize: 24, color: Colors.white }, action: { minHeight: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  cameraFallback: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', padding: 32, gap: 12 } });

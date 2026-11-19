import { Component, ComponentType, ReactNode, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Linking, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useKeepAwake } from 'expo-keep-awake';
import type { CameraViewProps } from 'expo-camera';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { Radius, Spacing, Type } from '../../constants/designTokens';
import { useAttendanceScanner } from '../../lib/hooks/useAttendanceScanner';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';

class CameraBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export function CameraSurface({ onScan, enabled, onAvailability }: { onScan: (data: string) => void; enabled: boolean; onAvailability: (ready: boolean) => void }) {
  const [camera, setCamera] = useState<ComponentType<CameraViewProps> | null>(null);
  const [status, setStatus] = useState('loading'); const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => { onAvailability(status === 'ready'); }, [status, onAvailability]);
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
  const unavailable = <View style={s.cameraFallback}><Text style={s.whiteTitle}>카메라를 사용할 수 없어요</Text><Text style={s.whiteBody}>앱을 최신 버전으로 설치한 뒤 다시 열어주세요</Text></View>;
  if (status === 'missing') return unavailable;
  if (status === 'loading') return <LoadingSpinner fullScreen={false} />;
  if (status === 'denied') return <View style={s.cameraFallback}><Text style={s.whiteTitle}>카메라를 허용해주세요</Text><Text style={s.whiteBody}>QR을 스캔하려면 설정에서 카메라를 허용해주세요</Text><Pressable accessibilityRole="button" style={s.action} onPress={() => { void readPermission(true); }}><Text style={s.whiteBody}>카메라 허용하기</Text></Pressable></View>;
  const Camera = camera;
  return <CameraBoundary fallback={unavailable}>{Camera && active && <Camera style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={enabled ? result => onScan(result.data) : undefined} onMountError={() => setStatus('missing')} />}</CameraBoundary>;
}
export default function AttendanceScannerScreen() {
  useKeepAwake('rattle-attendance-scanner');
  const scanner = useAttendanceScanner(); const insets = useSafeAreaInsets(); const { width, height } = useWindowDimensions();
  const [recovery, setRecovery] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [reader, setReader] = useState(true);
  useEffect(() => { let alive = true; void AccessibilityInfo.isScreenReaderEnabled().then(value => { if (alive) setReader(value); }).catch(() => {}); const listener = AccessibilityInfo.addEventListener('screenReaderChanged', setReader); return () => { alive = false; listener.remove(); }; }, []);
  useEffect(() => {
    // A status change or screen-reader activation can cancel the saved timer early.
    // Release the scan gate on those paths as well as normal timer completion.
    if (scanner.state !== 'saved' || reader) { setCooldown(false); return; }
    setCooldown(true);
    const timer = setTimeout(() => { setCooldown(false); scanner.clearNotice(); }, 4000);
    return () => clearTimeout(timer);
  }, [scanner.state, scanner.time, reader, scanner.clearNotice]);
  const size = Math.min(width - 80, 280, height * 0.32), top = Math.max(insets.top + 86, height * 0.19);
  const path = 'M1 60V20Q1 1 20 1H60M220 1H260Q279 1 279 20V60M279 220V260Q279 279 260 279H220M60 279H20Q1 279 1 260V220';
  return <View style={s.root}>
    {<CameraSurface onAvailability={setCameraReady} enabled={!cooldown && scanner.canScan} onScan={data => { void scanner.scan(data); }} />}
    {cameraReady && <View pointerEvents="none" style={{ position: 'absolute', width: size, height: size, left: (width - size) / 2, top }}><Svg width="100%" height="100%" viewBox="0 0 280 280"><Path d={path} stroke={Colors.black} strokeWidth={4} fill="none" /><Path d={path} stroke={Colors.white} strokeWidth={2} fill="none" /></Svg></View>}
    {cameraReady && <Text pointerEvents="none" style={[s.caption, { top: top + size + 20 }]}>{scanner.state === 'processing' ? 'QR을 잠시 그대로 보여주세요' : scanner.state === 'unknown' ? '같은 QR이나 다음 직원 QR을 보여주세요' : scanner.ready ? '직원 QR을 스캔해주세요' : '관리자 앱의 등록 QR을 찍어주세요'}</Text>}
    {cameraReady && scanner.title && <View style={[s.noticeZone, { top: top + size + 60, bottom: insets.bottom + 84 }]}><View style={s.notice} accessibilityLiveRegion="polite"><Text style={s.whiteTitle}>{scanner.title}</Text>{!!scanner.time && <Text style={s.time}>{scanner.time}</Text>}<Text style={s.whiteBody}>{scanner.body}</Text>
      {['error', 'unknownSetup'].includes(scanner.state) && <Pressable accessibilityRole="button" style={s.action} onPress={() => { void scanner.refresh(); }}><Text style={s.whiteBody}>다시 확인</Text></Pressable>}
      {scanner.state === 'unknownSetup' && <Pressable accessibilityRole="button" style={s.action} onPress={() => setRecovery(true)}><Text style={s.whiteBody}>새 등록 준비하기</Text></Pressable>}
    </View></View>}
    {!!scanner.unresolvedCount && <View style={[s.unresolved, { bottom: insets.bottom + 12 }]} accessibilityLiveRegion="polite"><Text style={s.whiteBody}>확인할 기록 {scanner.unresolvedCount}건이 있어요</Text><Text style={s.whiteBody}>해당 직원 휴대폰에서 기록을 확인해주세요</Text></View>}
    <Modal visible={recovery} transparent animationType="fade" onRequestClose={() => setRecovery(false)}><View style={s.shade}><View style={s.recoveryCard} accessibilityViewIsModal><Text style={s.recoveryTitle}>관리자 앱에서 확인했나요?</Text><Text style={s.recoveryBody}>등록돼 있다면 먼저 해제해주세요. 그다음 관리자 앱에서 새 등록 QR을 받아주세요.</Text><View style={s.actions}><Pressable accessibilityRole="button" style={s.action} onPress={() => setRecovery(false)}><Text style={s.recoveryAction}>닫기</Text></Pressable><Pressable accessibilityRole="button" style={s.action} onPress={() => { setRecovery(false); void scanner.confirmRegistrationRecovery(); }}><Text style={s.recoveryAction}>새 QR 찍기</Text></Pressable></View></View></View></Modal>
  </View>;
}
const s = StyleSheet.create({
  unresolved: { position: 'absolute', left: 20, right: 20, alignItems: 'center' },
  shade: { flex: 1, justifyContent: 'center', padding: Spacing.screenX, backgroundColor: Colors.overlayDetail }, recoveryCard: { padding: Spacing.screenX, gap: 16, borderRadius: Radius.xl, backgroundColor: Colors.white }, recoveryTitle: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.lg, color: Colors.black }, recoveryBody: { fontFamily: Fonts.wantedRegular, fontSize: Type.base, lineHeight: 22, color: Colors.gray600 }, recoveryAction: { color: Colors.action, fontFamily: Fonts.wantedMedium, fontSize: Type.base }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  root: { flex: 1, backgroundColor: Colors.black },
  caption: { position: 'absolute', left: 20, right: 20, textAlign: 'center', fontFamily: Fonts.wantedMedium, fontSize: Type.lg, color: Colors.white }, noticeZone: { position: 'absolute', left: 20, right: 20, justifyContent: 'center' }, notice: { backgroundColor: Colors.overlayDetail, borderRadius: Radius.xl, padding: Spacing.screenX, gap: 8, alignItems: 'center' },
  whiteTitle: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.lg, lineHeight: 26, textAlign: 'center', color: Colors.white }, whiteBody: { fontFamily: Fonts.wantedRegular, fontSize: Type.base, lineHeight: 22, textAlign: 'center', color: Colors.white }, time: { fontFamily: Fonts.geistMedium, fontSize: 24, color: Colors.white }, action: { minHeight: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  cameraFallback: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', padding: 32, gap: 12 } });

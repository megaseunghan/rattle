import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { Radius, Spacing, Type } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useScannerPairing } from '../../lib/hooks/useScannerPairing';
import { AppBar } from '../../lib/components/ui';
import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
import { AttendanceQrCode } from '../../lib/components/AttendanceQrCode';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';

/** No approved design exists for enrollment yet; reuses the S43 QR surface. */
export default function ScannerPairingScreen() {
  const { store } = useAuth(); const state = useScannerPairing();
  return <SafeAreaView style={s.root}><GlassBackdrop /><AppBar transparent title="매장폰 등록" onBack={() => router.back()} />
    {!state.allowed ? <ErrorMessage message="사장님이나 점장님에게 매장폰 등록을 요청해주세요" /> : <ScrollView contentContainerStyle={s.content}>
      <Text style={s.note}>{store?.name}</Text><Text style={s.title}>매장폰으로 등록 QR을 찍어주세요</Text>
      <Text style={s.note}>매장폰에서 스캐너를 열고 이 QR을 찍으면 등록돼요.</Text>
      <View style={s.qrArea}>{state.loading ? <LoadingSpinner fullScreen={false} /> : state.qr ? <AttendanceQrCode value={state.qr} label="매장폰 등록 QR" /> : null}</View>
      {state.expired && <Text style={s.note}>QR 시간이 지났어요. 새로 열어주세요.</Text>}
      {!!state.error && <ErrorMessage message={state.error} />}
      <Pressable accessibilityRole="button" disabled={state.loading} accessibilityState={{ disabled: state.loading }} style={[s.button, state.loading && { opacity: 0.5 }]} onPress={() => { void state.issue(); }}><Text style={s.buttonText}>{state.qr || state.expired ? '다시 열기' : '열어보기'}</Text></Pressable>
      <Text style={s.note}>등록됐는지 모르겠다면 매장폰 목록을 확인해주세요. 없으면 새 QR로 다시 등록해주세요.</Text>
      <Text style={s.note}>한 번만 등록할 수 있어요. 등록할 매장폰에만 보여주세요.</Text>
    </ScrollView>}
  </SafeAreaView>;
}
const s = StyleSheet.create({ root: { flex: 1, backgroundColor: Colors.homeCanvas }, content: { padding: Spacing.screenX, gap: 16, paddingBottom: 40 }, title: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.lg, lineHeight: 26, textAlign: 'center', color: Colors.black }, note: { fontFamily: Fonts.wantedRegular, fontSize: Type.base, lineHeight: 22, textAlign: 'center', color: Colors.gray600 }, qrArea: { minHeight: 244, alignItems: 'center', justifyContent: 'center', paddingTop: 24 }, button: { minHeight: 52, borderRadius: Radius.field, backgroundColor: Colors.action, alignItems: 'center', justifyContent: 'center' }, buttonText: { fontFamily: Fonts.wantedMedium, fontSize: Type.base, color: Colors.white } });

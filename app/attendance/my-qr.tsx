import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { CardStyle, Radius, Spacing, Type } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { useAttendanceToday } from '../../lib/hooks/useAttendanceToday';
import { useAttendanceQr } from '../../lib/hooks/useAttendanceQr';
import { resolveSelfEmployee } from '../../lib/utils/resolveSelfEmployee';
import { AppBar } from '../../lib/components/ui';
import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
import { AttendanceRecordCard } from '../../lib/components/AttendanceRecordCard';
import { Skeleton, SkeletonGroup } from '../../lib/components/skeleton';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { AppIcon } from '../../lib/icons/AppIcon';
import { AttendanceQrCode } from '../../lib/components/AttendanceQrCode';

const ATTENDANCE_POLL_MS = 5_000;

export default function MyAttendanceQrScreen() {
  const { store, user, devPreviewMode, devPreviewEmployeeId } = useAuth();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const employees = useEmployees();
  const employee = resolveSelfEmployee(employees.employees, user?.id, devPreviewEmployeeId);
  // 화면이 보이는 동안 5초마다 같은 출퇴근 키를 갱신한다. 홈 출퇴근 카드도 이 캐시를 함께 본다.
  const today = useAttendanceToday(employee?.id, focused, 0, ATTENDANCE_POLL_MS);
  const qr = useAttendanceQr(employee?.id, focused);
  const title = qr.state === 'rate_limited' ? '잠시 후 다시 시도해주세요' : qr.state === 'loading' ? 'QR을 불러오고 있어요' : qr.state === 'unknown' ? '등록됐는지 확인하고 있어요' : qr.state === 'error' ? 'QR을 불러오지 못했어요' : qr.state === 'pending' ? '기기 변경 승인을 기다리고 있어요' : qr.state === 'unregistered' ? '이 휴대폰으로 출퇴근할까요?' : qr.state === 'denied' ? '직원 등록 상태를 확인해주세요' : '매장폰에 QR을 보여주세요';
  return <SafeAreaView style={s.root}><GlassBackdrop /><AppBar transparent title="내 출퇴근 QR" onBack={() => router.back()} />
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.note}>{store?.name}</Text>
      {today.loading ? <SkeletonGroup label="오늘 내 기록 불러오는 중" style={s.recordSkeleton}>
        <Skeleton width="30%" height={14} />
        {[0, 1].map(i => <View key={i} style={s.recordRow}><Skeleton width={40} height={18} /><Skeleton width="36%" height={14} /></View>)}
      </SkeletonGroup> : today.error ? <ErrorMessage message={today.error} onRetry={() => { void today.refetch(); }} /> : <AttendanceRecordCard start={today.start} end={today.end} />}
      <Pressable accessibilityRole="button" style={s.menu} onPress={() => router.push('/attendance/corrections')}><Text style={s.label}>정정 요청한 기록</Text><AppIcon name="chevron-forward" size={16} color={Colors.gray600} /></Pressable>
      <View style={s.qrArea}>
        {qr.state === 'ready' && qr.qr && Date.now() < qr.expiresAt ? <AttendanceQrCode value={qr.qr} label="내 출퇴근 QR" /> : qr.state === 'loading' ? <SkeletonGroup label="QR 불러오는 중"><Skeleton width={220} height={220} radius={20} style={s.qrSkeleton} /></SkeletonGroup> : null}
        <Text style={s.title}>{title}</Text>
        <Text style={s.note}>{devPreviewMode !== 'self' ? '미리보기에서는 출퇴근을 기록할 수 없어요' : qr.state === 'pending' ? '사장님이나 점장님이 기기를 승인하면 QR을 보여줄 수 있어요' : qr.state === 'denied' ? '사장님에게 이 매장의 직원 등록 상태를 확인해주세요' : '출근·퇴근은 자동으로 기록돼요'}</Text>
        {qr.state === 'rate_limited' && <Text style={s.note}>{qr.retrySeconds}초 후 QR을 다시 불러올게요</Text>}
        {qr.state === 'unknown' && <Text style={s.note}>등록됐는지 확인하고 있어요. 사장님이나 점장님에게 기기 등록 상태를 확인해주세요</Text>}
        {qr.state === 'unregistered' && <Pressable style={s.action} accessibilityRole="button" onPress={() => { void qr.register(); }}><Text style={s.link}>이 휴대폰 등록하기</Text></Pressable>}
        {qr.state === 'error' && <ErrorMessage message="QR을 불러오지 못했어요. 인터넷 연결을 확인해주세요" onRetry={() => { void qr.refresh(); }} />}
      </View>
      {employee && (today.start || today.end) && !today.error && <Pressable accessibilityRole="button" style={s.menu} onPress={() => router.push('/attendance/correction')}><Text style={s.label}>정정 요청하기</Text><AppIcon name="chevron-forward" size={16} color={Colors.gray600} /></Pressable>}
    </ScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({ recordSkeleton: { ...CardStyle, padding: Spacing.cardPadding, gap: 14 }, recordRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, qrSkeleton: { marginBottom: 20 }, root: { flex: 1, backgroundColor: Colors.homeCanvas }, content: { padding: Spacing.screenX, paddingBottom: 40, gap: 16 },
  note: { fontFamily: Fonts.wantedRegular, fontSize: Type.base, lineHeight: 22, color: Colors.gray600, textAlign: 'center' },
  title: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.lg, lineHeight: 26, color: Colors.black, textAlign: 'center' },
  qrArea: { alignItems: 'center', paddingVertical: 24, gap: 12 }, qr: { width: 220, height: 220, backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  menu: { borderTopWidth: 1, borderColor: Colors.homeBorder, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, label: { fontFamily: Fonts.wantedMedium, fontSize: Type.lg, color: Colors.black },
  action: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: Radius.field }, link: { fontFamily: Fonts.wantedMedium, fontSize: Type.base, color: Colors.action }, });

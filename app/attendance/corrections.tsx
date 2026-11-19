import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { CardStyle, Spacing, Type } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { useAttendanceCorrections } from '../../lib/hooks/useAttendanceCorrections';
import { resolveSelfEmployee } from '../../lib/utils/resolveSelfEmployee';
import { AppBar } from '../../lib/components/ui';
import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
export default function AttendanceCorrectionsScreen() {
  const { user, devPreviewEmployeeId } = useAuth(); const { employees } = useEmployees();
  const employee = resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId);
  const state = useAttendanceCorrections(employee?.id);
  const [confirm, setConfirm] = useState<string | null>(null);
  const locked = ['saving', 'unknown'].includes(state.outcome);
  return <SafeAreaView style={s.root}><GlassBackdrop /><AppBar transparent title="정정 요청한 기록" onBack={() => router.back()} />
    {state.loading ? <LoadingSpinner /> : state.error ? <ErrorMessage message={state.error} onRetry={() => { void state.refetch(); }} /> : <ScrollView contentContainerStyle={s.content}>
      {!state.rows.length && <Text style={s.note}>정정 요청한 기록이 없어요</Text>}
      {state.rows.map(row => <View key={row.id} style={s.card}><Text style={s.title}>{row.kind === 'clock_out' ? '퇴근' : '출근'} · {{ pending: '확인 대기', approved: '승인했어요', rejected: '반려했어요', cancelled: '취소했어요' }[row.status]}</Text>
        <Text style={s.note}>{row.requested_time ? new Date(row.requested_time).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '기록 삭제 요청'}</Text><Text style={s.note}>{row.reason}</Text>{row.review_note && <Text style={s.note}>{row.review_note}</Text>}{row.status === 'pending' && <Pressable disabled={locked} accessibilityRole="button" style={s.action} onPress={() => setConfirm(row.id)}><Text style={s.link}>요청 취소하기</Text></Pressable>}</View>)}
      {!!state.outcome && <Text accessibilityLiveRegion="polite" style={s.note}>{{ saving: '요청을 취소하고 있어요', unknown: '취소됐는지 확인하고 있어요. 기록을 다시 확인해주세요', cancelled: '정정 요청을 취소했어요', failed: '취소하지 못했어요. 잠시 후 다시 시도해주세요' }[state.outcome]}</Text>}
      <Pressable accessibilityRole="button" style={s.action} onPress={() => { void state.refetch(); }}><Text style={s.link}>기록 다시 보기</Text></Pressable>
    </ScrollView>}
    <Modal visible={confirm !== null && !locked} transparent animationType="fade" onRequestClose={() => setConfirm(null)}><View style={s.shade}><View style={s.card} accessibilityViewIsModal><Text style={s.title}>정정 요청을 취소할까요?</Text><Text style={s.note}>승인을 기다리는 이 정정 요청만 취소해요. 기존 출퇴근 기록은 바뀌지 않아요.</Text><View style={s.actions}><Pressable accessibilityRole="button" style={s.action} onPress={() => setConfirm(null)}><Text style={s.link}>닫기</Text></Pressable><Pressable accessibilityRole="button" style={s.action} onPress={() => { const id = confirm; setConfirm(null); if (id) void state.cancel(id); }}><Text style={s.link}>요청 취소하기</Text></Pressable></View></View></View></Modal>
  </SafeAreaView>;
}
const s = StyleSheet.create({ shade: { flex: 1, backgroundColor: Colors.overlayDetail, justifyContent: 'center', padding: Spacing.screenX }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20 }, root: { flex: 1, backgroundColor: Colors.homeCanvas }, content: { padding: Spacing.screenX, gap: 14 }, card: { ...CardStyle, padding: Spacing.cardPadding, gap: 10 }, title: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.lg, color: Colors.black }, note: { fontFamily: Fonts.wantedRegular, fontSize: Type.base, lineHeight: 22, color: Colors.gray600 }, action: { minHeight: 44, justifyContent: 'center' }, link: { color: Colors.action, fontSize: Type.base } });

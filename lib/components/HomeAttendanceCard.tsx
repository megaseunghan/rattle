import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { CardStyle, Radius, Spacing, Type } from '../../constants/designTokens';
import type { Employee } from '../../types';
import { useAuth } from '../contexts/AuthContext';
import { attendanceTime, useAttendanceToday } from '../hooks/useAttendanceToday';
import { ErrorMessage } from './ErrorMessage';
import { LoadingSpinner } from './LoadingSpinner';

export function HomeAttendanceCard({ employee, active, refreshKey }: { employee?: Employee | null; active: boolean; refreshKey: number }) {
  const { user, store, storeRole } = useAuth();
  const record = useAttendanceToday(employee?.id, active, refreshKey);
  useFocusEffect(useCallback(() => { if (active) void record.refetch(true); }, [active, record.refetch]));
  const role = storeRole ? { owner: '사장', manager: '점장', employee: '직원', part_timer: '파트타이머' }[storeRole] : '역할 확인 중';
  return <View style={s.card}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <Pressable accessibilityRole="button" accessibilityLabel="내 정보 보기" onPress={() => router.push('/mypage')} style={s.identity}>
        <Text style={s.name}>{employee?.name || user?.user_metadata?.full_name || '내 정보'}님</Text><Text style={s.divider}>|</Text>
        <Text style={s.badge}>{role}</Text>{employee?.is_probation && <Text style={[s.badge, s.probation]}>수습중</Text>}
        <Text style={s.divider}>|</Text><Text style={s.affiliation}>{store?.name}</Text>
      </Pressable>
    </ScrollView>
    {record.loading && employee ? <LoadingSpinner fullScreen={false} /> : record.error ? <ErrorMessage message={record.error} onRetry={() => { void record.refetch(); }} /> : <View style={s.times}>
      <View style={s.row}><Text style={s.label}>{record.start ? '출근' : '출근 예정'}</Text><Text style={s.time}>{attendanceTime(record.start?.punched_at) || record.schedule?.start_time?.slice(0, 5) || '미정'}</Text></View>
      <View style={s.row}><Text style={s.label}>{record.end ? '퇴근' : '퇴근 예정'}</Text><Text style={s.time}>{attendanceTime(record.end?.punched_at) || record.schedule?.end_time?.slice(0, 5) || '미정'}</Text></View>
      {record.scheduleError && <Text style={s.label}>예정 시간을 불러오지 못했어요</Text>}
    </View>}
    <Pressable accessibilityRole="button" accessibilityHint="내 출퇴근 QR을 열어요" onPress={() => router.push('/attendance/my-qr')} style={s.action}><Text style={s.actionText}>{record.start && !record.end ? '퇴근' : '출근'}</Text></Pressable>
  </View>;
}
const s = StyleSheet.create({
  card: { ...CardStyle, padding: Spacing.cardPadding, gap: 12 }, identity: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  name: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.lg, lineHeight: 24, color: Colors.black }, divider: { color: Colors.gray300 },
  badge: { fontFamily: Fonts.wantedMedium, fontSize: 12, lineHeight: 18, color: Colors.action, backgroundColor: Colors.tinted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm },
  probation: { backgroundColor: Colors.contextBg, color: Colors.gray700 }, affiliation: { fontFamily: Fonts.wantedRegular, fontSize: 12, color: Colors.gray600 },
  times: { borderTopWidth: 1, borderColor: Colors.homeBorder, paddingTop: 12, gap: 12 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  label: { fontFamily: Fonts.wantedRegular, fontSize: Type.base, lineHeight: 24, color: Colors.gray600 }, time: { fontFamily: Fonts.geistMedium, fontSize: Type.lg, lineHeight: 24, color: Colors.black },
  action: { minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.tinted, borderRadius: Radius.field }, actionText: { fontFamily: Fonts.wantedMedium, fontSize: Type.base, color: Colors.action },
});

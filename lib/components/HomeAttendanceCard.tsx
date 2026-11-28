/* S04 홈 출퇴근 칸(2026-11-27 확정 시안): 이름·직책, 출근 시각·근무 시간, 출근/퇴근 버튼(QR 화면으로 이동). */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { CardStyle, Radius, Spacing, Type } from '../../constants/designTokens';
import type { Employee } from '../../types';
import { useAuth } from '../contexts/AuthContext';
import { useAttendanceToday } from '../hooks/useAttendanceToday';
import { ErrorMessage } from './ErrorMessage';
import { Skeleton, SkeletonGroup } from './skeleton';
import { NumericText } from './ui/NumericText';
import { attendanceDisplay } from './home/attendance/attendanceDisplay';

const ROLE_LABELS = { owner: '사장님', manager: '점장', employee: '직원', part_timer: '파트타이머' } as const;

/** 근무 중일 때만 1분마다 다시 그린다(근무 시간 표시). */
function useMinuteClock(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

export function HomeAttendanceCard({ employeeId, employee, active, refreshKey }: { employeeId?: string; employee?: Employee | null; active: boolean; refreshKey: number }) {
  const { user, storeRole } = useAuth();
  const record = useAttendanceToday(employeeId, active, refreshKey);
  const working = !!record.start && !record.end;
  const now = useMinuteClock(active && working);
  const role = storeRole ? ROLE_LABELS[storeRole] : '역할 확인 중';
  const display = attendanceDisplay(record, now);
  const name = employee?.name || user?.user_metadata?.full_name || '내 정보';
  return <View style={s.card}>
    <Pressable accessibilityRole="button" accessibilityLabel="내 정보 보기" onPress={() => router.push('/mypage')} style={s.identity}>
      <Text style={s.name} numberOfLines={1}>{name}님</Text>
      <Text style={s.pill}>{role}</Text>
      {employee?.is_probation && <Text style={[s.pill, s.probation]}>수습중</Text>}
    </Pressable>
    {employeeId && (record.loading ? <SkeletonGroup label="출퇴근 기록 불러오는 중" style={s.row}>
      <View style={s.info}><Skeleton width={110} height={13} /><Skeleton width={120} height={22} style={s.gap} /></View>
      <Skeleton width={88} height={44} radius={Radius.field} />
    </SkeletonGroup> : record.error ? <ErrorMessage message={record.error} onRetry={() => { void record.refetch(); }} /> : <View style={s.row}>
      <View style={s.info}>
        <NumericText style={s.label}>{display.label}</NumericText>
        <NumericText style={s.value}>{display.value}</NumericText>
        {record.scheduleError && <Text style={s.label}>예정 시간을 불러오지 못했어요</Text>}
      </View>
      {display.action && <Pressable accessibilityRole="button" accessibilityHint="내 출퇴근 QR을 열어요" onPress={() => router.push('/attendance/my-qr')}
        style={({ pressed }) => [s.action, pressed && s.pressed]}>
        <Text style={s.actionText}>{display.action === 'out' ? '퇴근하기' : '출근하기'}</Text>
      </Pressable>}
    </View>)}
  </View>;
}

const s = StyleSheet.create({
  card: { ...CardStyle, padding: Spacing.cardPadding + 2, gap: 6 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start', maxWidth: '100%' },
  name: { flexShrink: 1, fontFamily: Fonts.wantedBold, fontSize: Type.md, lineHeight: 22, color: Colors.black },
  pill: { fontFamily: Fonts.wantedMedium, fontSize: 12, lineHeight: 16, color: Colors.action, backgroundColor: Colors.tinted, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill, overflow: 'hidden' },
  probation: { backgroundColor: Colors.contextBg, color: Colors.gray700 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  info: { flex: 1, minWidth: 0 },
  gap: { marginTop: 8 },
  label: { fontSize: Type.sm, fontWeight: '500', lineHeight: 19, color: Colors.gray500 },
  value: { fontSize: Type.xl, fontWeight: '700', lineHeight: 28, color: Colors.black, marginTop: 2 },
  action: { minHeight: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.action, borderRadius: Radius.field },
  actionText: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.md, color: Colors.white },
  pressed: { opacity: 0.85 },
});

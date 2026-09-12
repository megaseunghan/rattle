import { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { useSchedule } from '../../lib/hooks/useSchedule';
import { resolveSelfEmployee } from '../../lib/utils/resolveSelfEmployee';
import { AppBar } from '../../lib/components/ui';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function fmtHHmm(t: string | null): string {
  if (!t) return '';
  return t.slice(0, 5);
}

function MenuRow({ icon, label, onPress, withBorder }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; withBorder?: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.menuRow, withBorder && styles.menuRowBorder]} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.menuIconWrap}>
        <Ionicons name={icon} size={17} color={Colors.gray600} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
    </TouchableOpacity>
  );
}

export default function MyPageScreen() {
  const { user, store, currentRole, realRole, devPreviewMode, devPreviewEmployeeId } = useAuth();
  const { employees, refetch: refetchEmployees } = useEmployees();
  const isPreviewing = realRole === 'admin' && devPreviewMode !== 'self';
  const myEmployee = resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId);

  useEffect(() => { refetchEmployees(); }, [refetchEmployees]);

  const { schedule, refetch } = useSchedule(myEmployee?.id);
  useEffect(() => { refetch(); }, [refetch]);

  const meta = (user?.user_metadata ?? {}) as { full_name?: string };
  const displayName = myEmployee?.name || meta.full_name || user?.email || '';
  const initial = displayName.slice(0, 1);
  const roleLabel = !isPreviewing && currentRole === 'admin'
    ? '사장님'
    : myEmployee?.employment_type === 'part_time' ? '파트타이머' : '직원';

  return (
    <SafeAreaView style={styles.container}>
      <AppBar title="마이페이지" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {isPreviewing && (
          <View style={styles.previewBanner}>
            <Ionicons name="eye-outline" size={16} color={Colors.warningStroke} />
            <Text style={styles.previewBannerText}>
              {myEmployee ? `${myEmployee.name}님 화면을 미리 보는 중이에요` : '오른쪽 아래 테스트 보기 버튼에서 직원을 선택해주세요'}
            </Text>
          </View>
        )}

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.profileRole}>{roleLabel}{store?.name ? ` · ${store.name}` : ''}</Text>
          </View>
        </View>

        {myEmployee && (
          <View style={styles.weekGrid}>
            {WEEKDAYS.map((label, i) => {
              const row = schedule.find(s => s.day_of_week === i);
              const working = row?.is_working;
              return (
                <View key={label} style={styles.weekCol}>
                  <Text style={styles.weekDayLabel}>{label}</Text>
                  {working ? (
                    <View style={styles.weekChip}>
                      <Text style={styles.weekChipText}>{fmtHHmm(row?.start_time ?? null)}-{fmtHHmm(row?.end_time ?? null)}</Text>
                    </View>
                  ) : (
                    <View style={styles.weekChipOff} />
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.menuCard}>
          {myEmployee && (
            <MenuRow icon="calendar-outline" label="스케줄 설정" onPress={() => router.push('/mypage/schedule')} />
          )}
          {myEmployee && (
            <MenuRow
              icon="time-outline" label="근태 기록" withBorder
              onPress={() => router.push(`/attendance/${myEmployee.id}?name=${encodeURIComponent(myEmployee.name)}`)}
            />
          )}
          {myEmployee && (
            <MenuRow icon="document-text-outline" label="급여 명세서" withBorder onPress={() => router.push('/mypage/payslip')} />
          )}
          {!isPreviewing && (
            <MenuRow icon="person-outline" label="개인정보 수정" withBorder={!!myEmployee} onPress={() => router.push('/settings/account')} />
          )}
          {realRole === 'admin' && (
            <MenuRow icon="checkmark-done-outline" label="요청함 (스케줄·근태 정정)" withBorder onPress={() => router.push('/attendance/requests')} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  scroll: { padding: Spacing.screenX, paddingBottom: 40, gap: 16 },

  previewBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.warningBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
  },
  previewBannerText: { flex: 1, fontSize: 12, fontWeight: '500', color: Colors.warningStroke },

  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.tinted, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 17, fontWeight: '700', color: Colors.primary },
  profileName: { fontSize: 16, fontWeight: '700', color: Colors.black },
  profileRole: { fontSize: 12, fontWeight: '500', color: Colors.gray400, marginTop: 2 },

  weekGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  weekCol: { alignItems: 'center', gap: 6, flex: 1 },
  weekDayLabel: { fontSize: 11, fontWeight: '600', color: Colors.gray400 },
  weekChip: { backgroundColor: Colors.tinted, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 4 },
  weekChipText: { fontSize: 9, fontWeight: '600', color: Colors.primary },
  weekChipOff: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.gray200, marginTop: 8 },

  menuCard: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.gray100, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  menuRowBorder: { borderTopWidth: 0.5, borderTopColor: Colors.gray100 },
  menuIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.gray50, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: Colors.black },
});

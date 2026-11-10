import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../../lib/icons/AppIcon';
import { Illustration, IllustrationName } from '../../lib/icons/Illustration';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { useSchedule } from '../../lib/hooks/useSchedule';
import { resolveSelfEmployee } from '../../lib/utils/resolveSelfEmployee';
import { AppBar } from '../../lib/components/ui';
import { NumericText } from '../../lib/components/ui/NumericText';
import { EmployeeSchedule } from '../../types';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DISPLAY_DAYS = [1, 2, 3, 4, 5, 6, 0];
const kstDay = () => new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay();
function scheduleLabel(row: EmployeeSchedule | undefined): string {
  if (!row) return '미설정';
  if (!row.is_working) return '휴무';
  if (!row.start_time || !row.end_time) return '시간 미설정';
  return `${row.start_time.slice(0, 5)} – ${row.end_time < row.start_time ? '익일 ' : ''}${row.end_time.slice(0, 5)}`;
}
function MenuRow({ illustration, label, onPress, withBorder }: {
  illustration: IllustrationName; label: string; onPress: () => void; withBorder?: boolean;
}) {
  return <TouchableOpacity style={[styles.menuRow, withBorder && styles.rowBorder]} onPress={onPress}
    activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label}>
    <Illustration name={illustration} size={32} />
    <Text style={styles.menuLabel}>{label}</Text>
    <AppIcon name="chevron-forward" size={16} color={Colors.gray500} />
  </TouchableOpacity>;
}

function ScheduleSummary({ employeeId }: { employeeId: string }) {
  const { schedule, loading, refetch } = useSchedule(employeeId);
  const [expanded, setExpanded] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [today, setToday] = useState(kstDay);
  useFocusEffect(useCallback(() => {
    let current = true;
    void refetch().then(() => { if (current) { setReady(true); setFailed(false); } })
      .catch(() => { if (current) { setReady(true); setFailed(true); } });
    return () => { current = false; };
  }, [refetch]));
  useEffect(() => {
    const update = () => setToday(kstDay());
    const timer = setInterval(update, 60_000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') update(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, []);
  async function retry() {
    if (loading) return;
    setReady(false);
    try { await refetch(); setFailed(false); }
    catch { setFailed(true); }
    finally { setReady(true); }
  }
  const todaySchedule = schedule.find(row => row.day_of_week === today);
  const todayText = todaySchedule && !todaySchedule.is_working ? '오늘은 쉬는 날이에요' : scheduleLabel(todaySchedule);
  return <View style={styles.scheduleSection}>
    <Text style={styles.sectionTitle}>근무 일정</Text>
    {!ready || loading ? <ActivityIndicator accessibilityLabel="스케줄 불러오는 중" color={Colors.primary} style={styles.status} />
      : failed ? <View style={styles.status}>
        <Text style={styles.note}>스케줄을 불러오지 못했어요</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="스케줄 다시 불러오기" onPress={() => { void retry(); }} style={styles.textAction}>
          <Text style={styles.actionText}>다시 불러오기</Text>
        </TouchableOpacity>
      </View>
        : <>
          {schedule.length === 0 && <Text style={styles.note}>등록된 스케줄이 없어요. 요일을 눌러 설정해주세요.</Text>}
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }}
            accessibilityLabel={`오늘 근무 ${WEEKDAYS[today]}요일 ${todayText}, 이번 주 ${expanded ? '접기' : '펼치기'}`}
            onPress={() => setExpanded(value => !value)} style={styles.summary} activeOpacity={0.7}>
            <View style={styles.summaryText}>
              <Text style={styles.note}>오늘 근무 · {WEEKDAYS[today]}요일</Text>
              <NumericText style={[styles.summaryTime, !todaySchedule?.is_working && styles.summaryOff]}>{todayText}</NumericText>
            </View>
            <AppIcon name={expanded ? 'chevron-down' : 'chevron-forward'} size={18} color={Colors.gray500} />
          </TouchableOpacity>
          {expanded && <View style={styles.week} testID="mypage-weekly-schedule">
            {DISPLAY_DAYS.map(day => {
              const row = schedule.find(item => item.day_of_week === day);
              const label = scheduleLabel(row);
              return <TouchableOpacity key={day} style={styles.scheduleRow} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={`${WEEKDAYS[day]}요일 ${label} 수정`}
                onPress={() => router.push({ pathname: '/mypage/schedule', params: { day: String(day) } })}>
                <Text style={[styles.scheduleDay, day === today && styles.today]}>{WEEKDAYS[day]}요일</Text>
                {day === today && <Text style={styles.todayLabel}>오늘</Text>}
                <NumericText style={[styles.scheduleTime, !row?.is_working && styles.note]}>{label}</NumericText>
                <AppIcon name="chevron-forward" size={14} color={Colors.gray500} />
              </TouchableOpacity>;
            })}
          </View>}
        </>}
  </View>;
}

export default function MyPageScreen() {
  const { user, store, currentRole, realRole, devPreviewMode, devPreviewEmployeeId, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  function handleSignOut() {
    Alert.alert('로그아웃', '로그아웃할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', onPress: async () => {
        setSigningOut(true);
        try { await signOut(); router.replace('/(auth)/login'); }
        catch { Alert.alert('로그아웃', '로그아웃하지 못했어요. 다시 시도해주세요.'); }
        finally { setSigningOut(false); }
      } },
    ]);
  }
  const { employees, refetch: refetchEmployees } = useEmployees();
  const isPreviewing = realRole === 'admin' && devPreviewMode !== 'self';
  const myEmployee = resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId);
  useEffect(() => { void refetchEmployees().catch(() => {}); }, [refetchEmployees]);
  const meta = (user?.user_metadata ?? {}) as { full_name?: string };
  const displayName = myEmployee?.name || meta.full_name || user?.email || '';
  const roleLabel = !isPreviewing && currentRole === 'admin' ? '사장님'
    : myEmployee?.employment_type === 'part_time' ? '파트타이머' : '직원';
  const scope = `${user?.id}:${store?.id}:${myEmployee?.id}:${devPreviewMode}:${devPreviewEmployeeId}`;
  return <SafeAreaView style={styles.container}><GlassBackdrop />
    <AppBar transparent title="마이페이지" onBack={() => router.back()} />
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {isPreviewing && <View style={styles.previewBanner}>
        <AppIcon name="eye-outline" size={16} color={Colors.warningStroke} />
        <Text style={styles.previewBannerText}>{myEmployee ? `${myEmployee.name}님 화면을 미리 보는 중이에요` : '오른쪽 아래 테스트 보기 버튼에서 직원을 선택해주세요'}</Text>
      </View>}
      <View>
        <Text style={styles.sectionTitle}>내 정보</Text>
        <View style={styles.profile}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{displayName.slice(0, 1)}</Text></View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.profileRole}>{roleLabel}{store?.name ? ` · ${store.name}` : ''}</Text>
          </View>
        </View>
      </View>
      {myEmployee && <ScheduleSummary key={scope} employeeId={myEmployee.id} />}
      <View>
        <Text style={styles.sectionTitle}>내 메뉴</Text>
        {myEmployee?.employment_type === 'part_time' && <MenuRow illustration="work-time" label="근무시간 제출" onPress={() => router.push('/mypage/work-minutes')} />}
        {myEmployee && <MenuRow illustration="payroll" label="급여 명세서" withBorder={myEmployee.employment_type === 'part_time'} onPress={() => router.push('/mypage/payslip')} />}
        {!isPreviewing && <MenuRow illustration="staff" label="개인정보 수정" withBorder={!!myEmployee} onPress={() => router.push('/settings/account')} />}
        {realRole === 'admin' && <MenuRow illustration="review-pending" label="요청함 (스케줄)" withBorder onPress={() => router.push('/mypage/requests')} />}
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="로그아웃" accessibilityState={{ disabled: signingOut }} disabled={signingOut} onPress={handleSignOut} style={styles.logout}>
        <Text style={styles.note}>{signingOut ? '로그아웃 중...' : '로그아웃'}</Text>
      </TouchableOpacity>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas },
  scroll: { padding: Spacing.screenX, paddingBottom: 40, gap: 24 },
  sectionTitle: { fontSize: 12, color: Colors.gray500, marginBottom: 10 },
  note: { fontSize: 12, color: Colors.gray500, lineHeight: 19 },
  previewBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.warningBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  previewBannerText: { flex: 1, fontSize: 12, fontWeight: '500', color: Colors.warningStroke },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  profileInfo: { flex: 1, minWidth: 0 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '600', color: Colors.primary },
  profileName: { fontSize: 16, fontWeight: '600', color: Colors.black },
  profileRole: { fontSize: 12, fontWeight: '500', color: Colors.gray500, marginTop: 5 },
  scheduleSection: { paddingBottom: 4 },
  summary: { minHeight: 90, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, paddingTop: 10, paddingBottom: 20 },
  summaryText: { flex: 1, minWidth: 0, gap: 8 },
  summaryTime: { fontSize: 20, fontWeight: '500', color: Colors.black },
  summaryOff: { fontSize: 19, fontWeight: '600' },
  week: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.homeBorder, paddingVertical: 8, paddingHorizontal: 4 },
  scheduleRow: { minHeight: 47, flexDirection: 'row', alignItems: 'center', gap: 8 },
  scheduleDay: { fontSize: 13, color: Colors.gray600 },
  today: { color: Colors.action },
  todayLabel: { fontSize: 10, color: Colors.action },
  scheduleTime: { flex: 1, textAlign: 'right', fontSize: 15, fontWeight: '500', color: Colors.black },
  status: { minHeight: 90, justifyContent: 'center', gap: 4 },
  textAction: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  actionText: { color: Colors.action, fontSize: 13 },
  menuRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.homeBorder },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: Colors.black },
  logout: { minHeight: 50, justifyContent: 'center', paddingHorizontal: 4 },
});

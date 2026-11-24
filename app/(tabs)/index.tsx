import { scheduleIdleTask } from '../../lib/utils/scheduleIdleTask';
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md · designed-as-app */
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { DailyOperationsHome } from '../../lib/components/DailyOperationsHome';
import { HomeAlertsPanel } from '../../lib/components/HomeAlertsPanel';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { useTossSync } from '../../lib/hooks/useTossSync';
import { useHomeFinancialCard } from '../../lib/hooks/useHomeFinancialCard';
import { HomeFinancialCard } from '../../lib/components/HomeFinancialCard';
import { useTabPager } from '../../lib/contexts/TabPagerContext';

import { resolveSelfEmployee, resolveSelfEmployeeId } from '../../lib/utils/resolveSelfEmployee';
import { HomeAttendanceCard } from '../../lib/components/HomeAttendanceCard';
import { useRefreshOnReturn } from '../../lib/query/useRefreshOnReturn';

/** 홈이 보여주는 자료. 스택 화면에서 돌아오면 이 중 오래된 활성 쿼리만 다시 받는다. */
const HOME_SCREEN_DOMAINS = ['home-workflow', 'cleaning', 'attendance-punches', 'schedule', 'home-alerts', 'financial', 'employees'] as const;


export function HomeScreen({ active = true }: { active?: boolean }) {
  const { store, user, storeRole, canManageStore, devPreviewEmployeeId, devPreviewMode, canReadFinancials, access } = useAuth();
  const { goToTab, innerGestureActive } = useTabPager();
  const { refetch: refetchNotifications } = useNotifications();
  const { employees, refetch: refetchEmp } = useEmployees();

  const today = new Date();
  const realYear = today.getFullYear();
  const realMonth = today.getMonth() + 1;

  const { todaySales, loadTodaySales, autoSyncOnForeground } = useTossSync();
  const financial = useHomeFinancialCard(active);
  const fetchTrend = financial.refetch;
  // 로그인 본인에 연결된 직원 → 파트타이머 여부 판별 (관리자 테스트 미리보기 시엔 선택된 직원)
  const myEmployee = resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId);
  // 출퇴근 조회는 직원 목록·시급을 기다리지 않고 권한 응답의 본인 직원 ID로 바로 시작한다.
  const myEmployeeId = resolveSelfEmployeeId(access?.employee_id, devPreviewEmployeeId, employees);
  const effectiveRole: 'admin' | 'member' | 'part_time' =
    canManageStore ? 'admin'
    : storeRole === 'part_timer' ? 'part_time'
    : 'member';

  const [refreshing, setRefreshing] = useState(false);
  const [alertRefreshKey, setAlertRefreshKey] = useState(0);

  async function loadAll(forceFinancial = false) {
    await Promise.all([
      // 직원 목록은 useEmployees(useQuery, 30분)가 자동으로 받는다. 당겨서 새로고침에서만 강제로 다시 받는다.
      ...(forceFinancial ? [refetchEmp(true)] : []),
      ...(forceFinancial ? [refetchNotifications()] : []),
      ...(forceFinancial && canReadFinancials ? [fetchTrend()] : []),
      ...(canManageStore ? [loadTodaySales(forceFinancial)] : []),
    ]);
  }

  async function onRefresh() {
    setRefreshing(true);
    setAlertRefreshKey(value => value + 1);
    try { await loadAll(true); } finally { setRefreshing(false); }
  }

  useEffect(() => {
    if (!active) return;
    return scheduleIdleTask(() => { void loadAll(); });
  }, [active, refetchEmp, refetchNotifications, loadTodaySales, fetchTrend, canManageStore]);

  // Returning from another tab is also a refresh opportunity while AppState stays
  // active. The shared coordinator deduplicates this with root foreground sync.
  useEffect(() => {
    if (active) void autoSyncOnForeground();
  }, [active, autoSyncOnForeground]);

  useRefreshOnReturn({ active, storeId: store?.id, domains: HOME_SCREEN_DOMAINS });

  const monthLabel = `${realYear}년 ${realMonth}월`;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>

      <ScrollView
        scrollEnabled={!innerGestureActive}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <HomeAttendanceCard employeeId={myEmployeeId} employee={myEmployee} active={active} refreshKey={alertRefreshKey} />
        <HomeAlertsPanel active={active} refreshKey={alertRefreshKey} todaySales={todaySales} financial={canManageStore} />
        {canReadFinancials && <>
        <HomeFinancialCard key={`${store?.id}-${user?.id}-${canManageStore}`} data={financial.data} loading={financial.loading} refreshing={financial.refreshing} error={!!financial.error} onRetry={financial.refetch} />
        {financial.data?.totals.labor === null && canManageStore && <TouchableOpacity onPress={() => goToTab('payroll')} accessibilityRole="button" style={{ minHeight: 44, padding: 12 }}><Text style={{ color: Colors.action }}>확인할 직원 보기 →</Text></TouchableOpacity>}

        </>}
        <DailyOperationsHome active={active} refreshKey={alertRefreshKey} isAdmin={canManageStore} isPartTime={effectiveRole === 'part_time'} canUseFinancialTabs={canReadFinancials && effectiveRole !== 'part_time'} />
        <Text style={styles.footerCaption}>{store?.name ?? ''} · {monthLabel}</Text>
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 18, paddingBottom: 100 },
  footerCaption: { fontSize: 12, fontWeight: '500', color: Colors.gray400, textAlign: 'center' },
});
export default HomeScreen;

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
import { useIngredients } from '../../lib/hooks/useIngredients';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { DailyOperationsHome } from '../../lib/components/DailyOperationsHome';
import { HomeAlertsPanel } from '../../lib/components/HomeAlertsPanel';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { useTossSync } from '../../lib/hooks/useTossSync';
import { useHomeFinancialCard } from '../../lib/hooks/useHomeFinancialCard';
import { HomeFinancialCard } from '../../lib/components/HomeFinancialCard';
import { useTabPager } from '../../lib/contexts/TabPagerContext';

import { resolveSelfEmployee } from '../../lib/utils/resolveSelfEmployee';


export function HomeScreen({ active = true }: { active?: boolean }) {
  const { store, user, currentRole, devPreviewEmployeeId, devPreviewMode, canReadFinancials } = useAuth();
  const { goToTab, innerGestureActive } = useTabPager();
  const { refetch: refetchNotifications } = useNotifications();
  const { data: ingredients, refetch } = useIngredients();
  const { employees, refetch: refetchEmp } = useEmployees();

  const today = new Date();
  const realYear = today.getFullYear();
  const realMonth = today.getMonth() + 1;

  const { todaySales, autoSyncOnForeground, loadTodaySales } = useTossSync();
  const financial = useHomeFinancialCard(active);
  const fetchTrend = financial.refetch;
  // 로그인 본인에 연결된 직원 → 파트타이머 여부 판별 (관리자 테스트 미리보기 시엔 선택된 직원)
  const myEmployee = resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId);
  const effectiveRole: 'admin' | 'member' | 'part_time' =
    currentRole === 'admin' ? 'admin'
    : devPreviewMode === 'part_time' || myEmployee?.employment_type === 'part_time' ? 'part_time'
    : 'member';

  const [refreshing, setRefreshing] = useState(false);
  const [alertRefreshKey, setAlertRefreshKey] = useState(0);

  async function loadAll(forceFinancial = false) {
    await Promise.all([
      refetch(forceFinancial),
      refetchEmp(forceFinancial),
      ...(forceFinancial ? [refetchNotifications()] : []),
      ...(forceFinancial && canReadFinancials ? [fetchTrend()] : []),
      ...(currentRole === 'admin' ? [loadTodaySales()] : []),
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
  }, [active, refetch, refetchEmp, refetchNotifications, loadTodaySales, fetchTrend, currentRole]);

  useEffect(() => {
    if (!active) return;
    autoSyncOnForeground();
  }, [active, autoSyncOnForeground]);

  const monthLabel = `${realYear}년 ${realMonth}월`;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>

      <ScrollView
        scrollEnabled={!innerGestureActive}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <HomeAlertsPanel active={active} refreshKey={alertRefreshKey} todaySales={todaySales} financial={currentRole === 'admin'} />
        {canReadFinancials && <>
        <HomeFinancialCard key={`${store?.id}-${user?.id}-${currentRole}`} data={financial.data} loading={financial.loading} refreshing={financial.refreshing} error={!!financial.error} onRetry={financial.refetch} />
        {financial.data?.totals.labor === null && currentRole === 'admin' && <TouchableOpacity onPress={() => goToTab('payroll')} accessibilityRole="button" style={{ minHeight: 44, padding: 12 }}><Text style={{ color: Colors.action }}>확인할 직원 보기 →</Text></TouchableOpacity>}

        </>}
        <DailyOperationsHome active={active} refreshKey={alertRefreshKey} isAdmin={currentRole === 'admin'} isPartTime={effectiveRole === 'part_time'} canUseFinancialTabs={canReadFinancials && effectiveRole !== 'part_time'} />
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

import { scheduleIdleTask } from '../../lib/utils/scheduleIdleTask';
/* S04 매장 홈 · 2026-11-27 확정 시안: 알림 → 출퇴근 → 근무표 → 오늘 할 일 → 손익 → 내 근무 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Text, StyleSheet, ScrollView, RefreshControl, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { DailyOperationsHome } from '../../lib/components/DailyOperationsHome';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { useTossSync } from '../../lib/hooks/useTossSync';
import { useTabPager } from '../../lib/contexts/TabPagerContext';
import { useStoreFillPrompt } from '../../lib/hooks/useStoreFillPrompt';
import { resolveSelfEmployee, resolveSelfEmployeeId } from '../../lib/utils/resolveSelfEmployee';
import { HomeAttendanceCard } from '../../lib/components/HomeAttendanceCard';
import { HomeAlertStack } from '../../lib/components/home/alerts/HomeAlertStack';
import { HomeWeekSchedule } from '../../lib/components/home/schedule/HomeWeekSchedule';
import { HomeProfitSection } from '../../lib/components/home/profit/HomeProfitSection';
import { HomeMyWork } from '../../lib/components/home/HomeMyWork';
import { HomeGreeting } from '../../lib/components/home/HomeGreeting';
import { HomeFillPromptSheet, fillAlertCards } from '../../lib/components/home/HomeFillPrompt';
import { useRefreshOnReturn } from '../../lib/query/useRefreshOnReturn';

/** 홈이 보여주는 자료. 스택 화면에서 돌아오면 이 중 오래된 활성 쿼리만 다시 받는다. */
const HOME_SCREEN_DOMAINS = ['home-workflow', 'cleaning', 'attendance-punches', 'schedule', 'home-alerts', 'financial', 'employees'] as const;
/** 펼친 알림 아래로 이만큼 내려가면 자동으로 접는다(확정 시안과 같은 기준). */
const FOLD_OFFSET = 60;

/** 펼친 알림을 스크롤로 지나치면 접고, 줄어든 높이만큼 스크롤 위치를 보정한다. */
function useAlertAutoFold(identity: string) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const layout = useRef({ y: 0, height: 0 });
  const folding = useRef<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setExpanded(false); }, [identity]);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    scrollY.current = y;
    if (expanded && folding.current == null && y > layout.current.y + layout.current.height * 0.6 - FOLD_OFFSET) {
      folding.current = layout.current.height;
      setExpanded(false);
    }
  }, [expanded]);
  const onAlertLayout = useCallback((event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    layout.current = { y, height };
    if (folding.current == null) return;
    const shrink = folding.current - height;
    folding.current = null;
    if (shrink > 0 && scrollY.current > 0) scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current - shrink), animated: false });
  }, []);
  return { scrollRef, expanded, setExpanded, onScroll, onAlertLayout };
}

export function HomeScreen({ active = true }: { active?: boolean }) {
  const { store, user, storeRole, canManageStore, devPreviewEmployeeId, canReadFinancials, access } = useAuth();
  const { goToTab, innerGestureActive } = useTabPager();
  const { refetch: refetchNotifications } = useNotifications();
  const { employees, loading: employeesLoading, error: employeesError, denied: employeesDenied, refetch: refetchEmp } = useEmployees();
  const fillPrompt = useStoreFillPrompt(store?.id ?? null, { active });

  const today = new Date();
  const { todaySales, loadTodaySales, autoSyncOnForeground } = useTossSync();
  // 로그인 본인에 연결된 직원 → 출퇴근·내 근무(관리자 테스트 미리보기 시엔 선택된 직원)
  const myEmployee = resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId);
  // 출퇴근 조회는 직원 목록·시급을 기다리지 않고 권한 응답의 본인 직원 ID로 바로 시작한다.
  const myEmployeeId = resolveSelfEmployeeId(access?.employee_id, devPreviewEmployeeId, employees);
  const fold = useAlertAutoFold(`${store?.id}:${user?.id}`);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  async function loadAll(force = false) {
    await Promise.all([
      // 직원 목록은 useEmployees(useQuery, 30분)가 자동으로 받는다. 당겨서 새로고침에서만 강제로 다시 받는다.
      ...(force ? [refetchEmp(true)] : []),
      ...(force ? [refetchNotifications()] : []),
      ...(canManageStore ? [loadTodaySales(force)] : []),
    ]);
  }

  async function onRefresh() {
    setRefreshing(true);
    // 각 칸(알림·출퇴근·근무표·할 일·손익)은 refreshKey가 바뀌면 재사용 시간과 무관하게 다시 받는다.
    setRefreshKey(value => value + 1);
    try { await loadAll(true); } finally { setRefreshing(false); }
  }

  useEffect(() => {
    if (!active) return;
    return scheduleIdleTask(() => { void loadAll(); });
  }, [active, refetchEmp, refetchNotifications, loadTodaySales, canManageStore]);

  // Returning from another tab is also a refresh opportunity while AppState stays
  // active. The shared coordinator deduplicates this with root foreground sync.
  useEffect(() => {
    if (active) void autoSyncOnForeground();
  }, [active, autoSyncOnForeground]);

  useRefreshOnReturn({ active, storeId: store?.id, domains: HOME_SCREEN_DOMAINS });

  const monthLabel = `${today.getFullYear()}년 ${today.getMonth() + 1}월`;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView
        ref={fold.scrollRef}
        scrollEnabled={!innerGestureActive}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        onScroll={fold.onScroll}
        scrollEventThrottle={32}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* 매장 근무가 없으면(연결된 직원 기록 없음) 출퇴근 칸 대신 알림 위 인사말(S04 확정 시안). */}
        {!myEmployeeId && <HomeGreeting />}
        <HomeAlertStack active={active} refreshKey={refreshKey} todaySales={todaySales} financial={canManageStore}
          expanded={fold.expanded} onExpandedChange={fold.setExpanded} leadingCards={fillAlertCards(fillPrompt)} onLayout={fold.onAlertLayout} />
        {!!myEmployeeId && <HomeAttendanceCard employeeId={myEmployeeId} employee={myEmployee} active={active} refreshKey={refreshKey} />}
        <HomeWeekSchedule active={active} refreshKey={refreshKey} employees={employees}
          employeesState={employeesLoading ? 'loading' : employeesError && !employeesDenied && !employees.length ? 'error' : 'ready'}
          onRetryEmployees={() => { void refetchEmp(true); }} />
        <DailyOperationsHome active={active} refreshKey={refreshKey} isAdmin={canManageStore}
          canUseFinancialTabs={canReadFinancials && storeRoleAllowsFinancialTabs(canManageStore, storeRole)} />
        {canReadFinancials && <HomeProfitSection key={`${store?.id}-${user?.id}-${canManageStore}`} active={active} refreshKey={refreshKey}
          onOpenPayroll={() => goToTab('payroll')} />}
        {!!myEmployeeId && <HomeMyWork />}
        <Text style={styles.footerCaption}>{store?.name ?? ''} · {monthLabel}</Text>
      </ScrollView>
      <HomeFillPromptSheet prompt={fillPrompt} />
    </SafeAreaView>
  );
}

/** 파트타이머는 재무 바로가기(매입·레시피·매출·비용)를 쓰지 않는다(기존 홈과 같음). */
function storeRoleAllowsFinancialTabs(canManageStore: boolean, role?: string | null): boolean {
  return canManageStore || role !== 'part_timer';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 14, paddingBottom: 100 },
  footerCaption: { fontSize: 12, fontWeight: '500', color: Colors.gray400, textAlign: 'center' },
});
export default HomeScreen;

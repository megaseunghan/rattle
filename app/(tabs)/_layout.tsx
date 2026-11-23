import { StoreAppBar } from '../../lib/components/StoreAppBar';
import Constants from 'expo-constants';
import { isQaLoginEnabled } from '../../lib/services/qaLogin';
import { useNotifications } from '../../lib/hooks/useNotifications';
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md · designed-as-app */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, AppState } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AppIcon } from '../../lib/icons/AppIcon';
import PagerView from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '../../lib/components/GlassCard';
import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { resolveSelfEmployee } from '../../lib/utils/resolveSelfEmployee';
import { TabPagerContext, TabName, HomeMode, useTabPager } from '../../lib/contexts/TabPagerContext';
import { StoreScopePicker } from '../../lib/components/StoreScopeHeader';
import { MoreDrawer } from '../../lib/components/MoreDrawer';
import { HomeScreen } from './index';
import { StockScreen } from './stock';
import { PurchasesScreen } from './purchases';
import { PayrollScreen } from './payroll';
import { AdminDashboardScreen } from '../admin/index';
import { PosScreen } from '../pos/index';

const TAB_CONFIG: Record<TabName, { label: string; icon: keyof typeof AppIcon.glyphMap; iconActive: keyof typeof AppIcon.glyphMap }> = {
  home:      { label: '홈',   icon: 'home-outline',        iconActive: 'home' },
  stock:     { label: '재고', icon: 'cube-outline',         iconActive: 'cube' },
  purchases: { label: '매입', icon: 'cart-outline',         iconActive: 'cart' },
  payroll:   { label: '인건비', icon: 'people-outline',     iconActive: 'people' },
  sales:     { label: '매출', icon: 'stats-chart-outline',  iconActive: 'stats-chart' },
  more:      { label: '설정', icon: 'ellipsis-horizontal',  iconActive: 'ellipsis-horizontal' },
};

function TabIcon({ tab, focused, badge }: { tab: TabName; focused: boolean; badge?: number }) {
  const cfg = TAB_CONFIG[tab];
  const showBadge = !!badge && badge > 0;
  return (
    <View style={styles.iconWrap}>
      {focused && <View style={styles.indicator} />}
      <AppIcon name={focused ? cfg.iconActive : cfg.icon} size={22} color={focused ? Colors.primary : Colors.gray400} />
      <View style={styles.labelRow}>
        <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1} adjustsFontSizeToFit>{cfg.label}</Text>
        {showBadge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText} numberOfLines={1}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { user, store, stores, switchStore, currentRole, realRole, canViewOwnerDashboard, storeRole, devPreviewMode, devPreviewEmployeeId, canReadFinancials } = useAuth();
  const { employees, refetch } = useEmployees();
  const { unreadCount } = useNotifications();

  useEffect(() => { refetch(); }, [refetch]);

  // 파트타이머는 하단 탭을 홈·재고·설정으로 간소화 (관리자 테스트 미리보기도 반영)
  const myEmployee = resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId);
  const isPartTime = storeRole === 'part_timer';

  // 사장님 본인(미리보기 아님)일 때만 홈 탭이 통합 대시보드/매장 홈을 오갈 수 있음
  const insets = useSafeAreaInsets();
  const [tabBarHeight, setTabBarHeight] = useState(66 + Math.max(insets.bottom, 8));
  const isOwnerAdminSelf = canViewOwnerDashboard && devPreviewMode === 'self';
  const [homeMode, setHomeModeState] = useState<HomeMode>(() => isQaLoginEnabled() && Constants.platform?.ios?.buildNumber === '900001' ? 'dashboard' : 'store');
  const effectiveHomeMode: HomeMode = isOwnerAdminSelf ? homeMode : 'store';
  const setHomeMode = useCallback((mode: HomeMode) => { requestedPage.current = null; setHomeModeState(mode); if (mode === 'dashboard') { setActiveIndex(0); pagerRef.current?.setPageWithoutAnimation(0); } }, []);

  // 스와이프 가능한 탭 순서 — 더보기는 이제 페이지가 아니라 드로어라 여기 없음
  const tabs: TabName[] = useMemo(
    () => !canReadFinancials ? ['home', 'stock'] : isPartTime ? ['home', 'stock'] : ['home', 'stock', 'purchases', 'payroll', 'sales'],
    [isPartTime, canReadFinancials]
  );

  const tabRouter = useRouter();
  const pagerRef = useRef<PagerView>(null);
  const requestedPage = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));
  const [moreOpen, setMoreOpen] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pendingTab, setPendingTab] = useState<TabName | undefined>();
  const [containerHeight, setContainerHeight] = useState<number>();
  const [switching, setSwitching] = useState(false);
  const [innerGestureActive, setInnerGestureActive] = useState(false);
  const gestureOwners = useRef(new Set<string>());
  const pagerCanScroll = effectiveHomeMode !== 'dashboard' && !switching && !moreOpen;
  const pagerCanScrollRef = useRef(pagerCanScroll); pagerCanScrollRef.current = pagerCanScroll;
  const setPagerGestureActive = useCallback((owner: string, active: boolean, allTouchesEnded = false) => {
    if (allTouchesEnded) gestureOwners.current.clear();
    else if (active) gestureOwners.current.add(owner);
    else gestureOwners.current.delete(owner);
    const locked = gestureOwners.current.size > 0;
    // Stop native page capture immediately, without waiting for a React render.
    pagerRef.current?.setScrollEnabled(!locked && pagerCanScrollRef.current);
    setInnerGestureActive(locked);
  }, []);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') setPagerGestureActive('', false, true); });
    return () => listener.remove();
  }, [setPagerGestureActive]);
  useEffect(() => { setPagerGestureActive('', false, true); }, [store?.id, currentRole, setPagerGestureActive]);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [returnScope, setReturnScope] = useState<'all' | 'store'>('store');
  const [viewState, setViewStateData] = useState<Record<string, string>>({});
  const setViewState = useCallback((key: string, value: string) => {
    setViewStateData(previous => previous[key] === value ? previous : { ...previous, [key]: value });
  }, []);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
  const openStorePicker = useCallback((targetTab?: TabName) => {
    setPendingTab(targetTab); setSwitchError(null); setPickerVisible(true);
  }, []);
  const selectStoreScope = useCallback(async (storeId: string, targetTab?: TabName) => {
    if (switching) return;
    setSwitching(true); setSwitchError(null);
    try {
      await switchStore(storeId);
      setReturnScope(effectiveHomeMode === 'dashboard' && targetTab === 'payroll' ? 'all' : 'store');
      setHomeMode('store');
      setPickerVisible(false);
      const destination = targetTab ?? pendingTab;
      if (destination) {
        const index = tabs.indexOf(destination);
        if (index >= 0) { setVisited(prev => new Set(prev).add(index)); setActiveIndex(index); pagerRef.current?.setPageWithoutAnimation(index); }
      }
      setPendingTab(undefined);
    } catch (error) {
      setSwitchError('매장을 바꾸지 못했어요. 다시 선택해 주세요.');
      throw error;
    } finally { setSwitching(false); }
  }, [switching, switchStore, effectiveHomeMode, setHomeMode, pendingTab, tabs]);
  const routeParams = useLocalSearchParams<{ targetTab?: string; homeScope?: string; month?: string }>();
  useEffect(() => {
    if (!routeParams.targetTab) return;
    if (routeParams.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(routeParams.month)) setSelectedMonth(routeParams.month);
    const restoringAll = routeParams.homeScope === 'all' && isOwnerAdminSelf;
    if (restoringAll) setHomeMode('dashboard');
    else if (routeParams.homeScope === 'store') setHomeMode('store');
    const index = tabs.indexOf(routeParams.targetTab as TabName);
    if (index > 0 && effectiveHomeMode === 'dashboard' && routeParams.homeScope !== 'store') { openStorePicker(routeParams.targetTab as TabName); }
    else if (index >= 0) {
      setVisited(prev => new Set(prev).add(index));
      setActiveIndex(index);
      pagerRef.current?.setPageWithoutAnimation(index);
    }
    tabRouter.setParams({ targetTab: undefined, homeScope: undefined, month: undefined });
  }, [routeParams.targetTab, tabs, tabRouter]);

  // 파트타이머 여부가 바뀌어 탭 개수가 줄면 인덱스 보정
  useEffect(() => {
    if (activeIndex >= tabs.length) {
      setActiveIndex(0);
      setVisited(new Set([0]));
      pagerRef.current?.setPageWithoutAnimation(0);
    }
  }, [tabs.length, activeIndex]);

  const goToTab = useCallback((tab: TabName) => {
    if (tab === 'more') { setMoreOpen(true); return; }
    if (tab !== 'home' && effectiveHomeMode === 'dashboard') { openStorePicker(tab); return; }
    setReturnScope('store');
    const idx = tabs.indexOf(tab);
    if (idx === -1) return;
    if (idx === activeIndex) return;
    requestedPage.current = idx;
    setActiveIndex(idx);
    setVisited(previous => previous.has(idx) ? previous : new Set(previous).add(idx));
    pagerRef.current?.setPageWithoutAnimation(idx);
  }, [effectiveHomeMode, openStorePicker, tabs, activeIndex]);

  function handlePageSelected(idx: number) {
    if (requestedPage.current !== null) {
      if (idx !== requestedPage.current) return;
      requestedPage.current = null;
    }
    if (idx > 0 && effectiveHomeMode === 'dashboard') { pagerRef.current?.setPageWithoutAnimation(0); openStorePicker(tabs[idx]); return; }
    setActiveIndex(idx);
    setVisited(prev => prev.has(idx) ? prev : new Set(prev).add(idx));
  }

  const activeTab = tabs[activeIndex] ?? 'home';
  const pagerValue = useMemo(() => ({ activeTab, goToTab, homeMode: effectiveHomeMode, setHomeMode, openStorePicker, selectStoreScope, selectedMonth, setSelectedMonth, returnScope, viewState, setViewState, innerGestureActive, setPagerGestureActive, setAlertGestureActive: setPagerGestureActive }), [activeTab, goToTab, effectiveHomeMode, setHomeMode, openStorePicker, selectStoreScope, selectedMonth, returnScope, viewState, setViewState, innerGestureActive, setPagerGestureActive]);

  return (
    <TabPagerContext.Provider value={pagerValue}>
      <View style={styles.shell} testID="tab-shell" onLayout={event => setContainerHeight(event.nativeEvent.layout.height)}
        onTouchEnd={event => { if (event.nativeEvent.touches.length === 0) setPagerGestureActive('', false, true); }}
        onTouchCancel={event => { if (event.nativeEvent.touches.length === 0) setPagerGestureActive('', false, true); }}>
        <GlassBackdrop />
        <View style={{ paddingTop: insets.top }}>
          <StoreAppBar name={effectiveHomeMode === 'dashboard' ? '전체 매장' : store?.name ?? '매장 선택'} unreadCount={unreadCount}
            onMenu={() => setMoreOpen(true)}
            onNotifications={() => tabRouter.push('/notifications')} />
        </View>
        <PagerView
          ref={pagerRef}
          style={styles.flex}
          initialPage={0}
          scrollEnabled={pagerCanScroll && !innerGestureActive}
          onPageSelected={e => handlePageSelected(e.nativeEvent.position)}
        >
          {tabs.map((tab, idx) => (
            <View key={tab} style={styles.flex}>
              {visited.has(idx) ? <TabPage key={store?.id} tab={tab} active={activeIndex === idx} /> : null}
            </View>
          ))}
        </PagerView>

        <View onLayout={event => setTabBarHeight(event.nativeEvent.layout.height)}>
        <GlassCard style={{ marginHorizontal: 12, marginBottom: Math.max(insets.bottom, 8), marginTop: 4 }} contentStyle={styles.tabBar}>
          {tabs.map((tab) => (
            <Pressable key={tab} style={styles.tabBarItem} accessibilityRole="tab" accessibilityLabel={TAB_CONFIG[tab].label} accessibilityState={{ selected: activeTab === tab }} onPress={() => goToTab(tab)}>
              <TabIcon tab={tab} focused={activeTab === tab} />
            </Pressable>
          ))}
        </GlassCard>
        </View>

        <StoreScopePicker key={pickerVisible ? 'open' : 'closed'} visible={pickerVisible} stores={stores} selectedId={store?.id} allSelected={effectiveHomeMode === 'dashboard'} allowAll={isOwnerAdminSelf} required={!!pendingTab} busy={switching} error={switchError}
          onSelect={id => { void selectStoreScope(id).catch(() => {}); }}
          onAll={() => { setHomeMode('dashboard'); setPickerVisible(false); goToTab('home'); }}
          onClose={() => { if (!switching) { setPickerVisible(false); setPendingTab(undefined); } }} />

        <MoreDrawer visible={moreOpen} onOpen={pickerVisible ? undefined : () => setMoreOpen(true)} onClose={() => setMoreOpen(false)}
          allSelected={effectiveHomeMode === 'dashboard'}
          onSelectStore={id => selectStoreScope(id)}
          onAllStores={isOwnerAdminSelf ? () => { setHomeMode('dashboard'); goToTab('home'); } : undefined} />
      </View>
    </TabPagerContext.Provider>
  );
}

function TabPage({ tab, active }: { tab: TabName; active: boolean }) {
  const { homeMode } = useTabPager();
  switch (tab) {
    case 'home': return homeMode === 'dashboard' ? <AdminDashboardScreen embedded /> : <HomeScreen active={active} />;
    case 'stock': return <StockScreen active={active} />;
    case 'purchases': return <PurchasesScreen active={active} />;
    case 'payroll': return <PayrollScreen active={active} />;
    case 'sales': return <PosScreen active={active} />;
    case 'more': return null;
  }
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: Colors.homeCanvas },
  flex: { flex: 1 },
  tabBar: { flexDirection: 'row', height: 60, padding: 0, paddingTop: 6 },
  tabBarItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconWrap: { alignItems: 'center' },
  indicator: {
    position: 'absolute',
    top: -10,
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  label: { fontSize: 13, fontWeight: '500', color: Colors.gray400 },
  labelActive: { color: Colors.action, fontWeight: '700' },
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: Colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: { fontSize: 9, fontWeight: '700', color: Colors.white },
});

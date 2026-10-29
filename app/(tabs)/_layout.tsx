import { StoreAppBar } from '../../lib/components/StoreAppBar';
import { useNotifications } from '../../lib/hooks/useNotifications';
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md · designed-as-app */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PagerView from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '../../lib/components/GlassCard';
import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { resolveSelfEmployee } from '../../lib/utils/resolveSelfEmployee';
import { TabPagerContext, TabName, HomeMode, useTabPager } from '../../lib/contexts/TabPagerContext';
import { DraggableFab } from '../../lib/components/DraggableFab';
import { StoreScopePicker } from '../../lib/components/StoreScopeHeader';
import { MoreDrawer } from '../../lib/components/MoreDrawer';
import { HomeScreen } from './index';
import { StockScreen } from './stock';
import { PurchasesScreen } from './purchases';
import { PayrollScreen } from './payroll';
import { AdminDashboardScreen } from '../admin/index';
import { PosScreen } from '../pos/index';

type QuickAddAction = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; route: string } | { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; tab: TabName };

const QUICK_ADD_ITEMS: QuickAddAction[] = [
  { key: 'sales', label: '매출 등록', icon: 'stats-chart-outline', route: '/pos/new' },
  { key: 'purchase', label: '매입 등록', icon: 'cart-outline', route: '/purchases/new' },
  { key: 'stock', label: '재고 등록', icon: 'cube-outline', route: '/stock/new' },
  { key: 'recipe', label: '레시피 등록', icon: 'restaurant-outline', route: '/recipes/new' },
  { key: 'employee', label: '직원 등록', icon: 'people-outline', tab: 'payroll' },
];

const MENU_WIDTH = 168;
const FAB_SIZE = 52;

/** 화면 26 · FAB 팝업 메뉴 — 버튼 바로 위에 뜨는 작은 박스, 화면을 가리지 않음. FAB가 옮겨진 위치를 따라간다 */
function QuickAddMenu({
  visible, onClose, goToTab, fabPos, onRoute, onEmployee, onResetPosition,
}: {
  visible: boolean; onClose: () => void; goToTab: (tab: TabName) => void; onRoute: (route: string) => void; onEmployee: () => void; onResetPosition: () => void; fabPos: { x: number; y: number };
}) {
  const router = useRouter();
  const { currentRole } = useAuth();
  const { width, height } = useWindowDimensions();
  if (!visible) return null;

  function handleSelect(item: QuickAddAction) {
    onClose();
    if (item.key === 'employee') { onEmployee(); return; }
    if ('tab' in item) goToTab(item.tab);
    else onRoute(item.route);
  }

  // FAB 오른쪽 끝에 메뉴 오른쪽 끝을 맞추고, FAB 바로 위(아래에서부터 거리 기준)에 띄운다. 화면 밖으로 안 나가게 clamp
  const menuLeft = Math.min(Math.max(fabPos.x + FAB_SIZE - MENU_WIDTH, 8), width - MENU_WIDTH - 8);
  const menuHeight = (QUICK_ADD_ITEMS.length + 1) * 44 + 12;
  const menuTop = Math.max(8, Math.min(fabPos.y - menuHeight - 8, height - menuHeight - 100));

  return (
    <>
      <Pressable style={styles.menuOverlay} onPress={onClose} accessibilityLabel="빠른 등록 닫기" />
      <View style={[styles.menuBox, { left: menuLeft, top: menuTop }]}>
        {QUICK_ADD_ITEMS.filter(item => item.key !== 'employee' || currentRole === 'admin').map((item) => (
          <Pressable key={item.key} style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: Colors.focusBg }]} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => handleSelect(item)}>
            <Ionicons name={item.icon} size={16} color={Colors.primary} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
            <Text style={styles.menuItemText}>{item.label}</Text>
          </Pressable>
        ))}
        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: Colors.focusBg }]} accessibilityRole="button" accessibilityLabel="버튼 위치 초기화" onPress={() => { onResetPosition(); onClose(); }}>
          <Ionicons name="refresh-outline" size={16} color={Colors.gray600} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          <Text style={styles.menuItemText}>버튼 위치 초기화</Text>
        </Pressable>
      </View>
    </>
  );
}

const TAB_CONFIG: Record<TabName, { label: string; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap }> = {
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
      <Ionicons name={focused ? cfg.iconActive : cfg.icon} size={22} color={focused ? Colors.primary : Colors.gray400} />
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
  const { user, store, stores, switchStore, currentRole, realRole, devPreviewMode, devPreviewEmployeeId, canReadFinancials } = useAuth();
  const { employees, refetch } = useEmployees();
  const { unreadCount } = useNotifications();

  useEffect(() => { refetch(); }, [refetch]);

  // 파트타이머는 하단 탭을 홈·재고·설정으로 간소화 (관리자 테스트 미리보기도 반영)
  const myEmployee = resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId);
  const isPartTime = currentRole !== 'admin' && (devPreviewMode === 'part_time' || myEmployee?.employment_type === 'part_time');

  // 사장님 본인(미리보기 아님)일 때만 홈 탭이 통합 대시보드/매장 홈을 오갈 수 있음
  const insets = useSafeAreaInsets();
  const [tabBarHeight, setTabBarHeight] = useState(66 + Math.max(insets.bottom, 8));
  const isOwnerAdminSelf = realRole === 'admin' && devPreviewMode === 'self';
  const [homeMode, setHomeModeState] = useState<HomeMode>('store');
  const effectiveHomeMode: HomeMode = isOwnerAdminSelf ? homeMode : 'store';
  function setHomeMode(mode: HomeMode) { requestedPage.current = null; setHomeModeState(mode); if (mode === 'dashboard') { setActiveIndex(0); pagerRef.current?.setPageWithoutAnimation(0); } }

  // 스와이프 가능한 탭 순서 — 더보기는 이제 페이지가 아니라 드로어라 여기 없음
  const tabs: TabName[] = useMemo(
    () => !canReadFinancials ? ['home', 'stock'] : isPartTime ? ['home', 'stock'] : ['home', 'stock', 'purchases', 'payroll', 'sales'],
    [isPartTime, canReadFinancials]
  );

  const pagerRef = useRef<PagerView>(null);
  const requestedPage = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));
  const [quickAddVisible, setQuickAddVisible] = useState(false);
  const [fabPos, setFabPos] = useState({ x: 0, y: 0 });
  const [fabResetRequest, setFabResetRequest] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pendingTab, setPendingTab] = useState<TabName | undefined>();
  const [pendingRoute, setPendingRoute] = useState<string | undefined>();
  const [pendingEmployee, setPendingEmployee] = useState(false);
  const [employeeRegistration, setEmployeeRegistration] = useState<{ storeId: string; id: number }>();
  const [containerHeight, setContainerHeight] = useState<number>();
  const [switching, setSwitching] = useState(false);
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
  function openStorePicker(targetTab?: TabName) {
    setPendingTab(targetTab); setPendingRoute(undefined); setPendingEmployee(false); setSwitchError(null); setPickerVisible(true);
  }
  async function selectStoreScope(storeId: string, targetTab?: TabName) {
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
      if (pendingRoute) tabRouter.push(pendingRoute as any);
      if (pendingEmployee && currentRole === 'admin') setEmployeeRegistration({ storeId, id: Date.now() });
      setPendingEmployee(false);
      setPendingTab(undefined); setPendingRoute(undefined);
    } catch (error) {
      setSwitchError('매장을 바꾸지 못했어요. 다시 선택해 주세요.');
      throw error;
    } finally { setSwitching(false); }
  }
  function openQuickRoute(route: string) {
    if (effectiveHomeMode === 'dashboard') {
      openStorePicker(); setPendingRoute(route);
    } else tabRouter.push(route as any);
  }
  function openEmployeeRegistration() {
    if (currentRole !== 'admin') return;
    if (effectiveHomeMode === 'dashboard') {
      openStorePicker('payroll'); setPendingEmployee(true);
    } else if (store) {
      goToTab('payroll');
      setEmployeeRegistration({ storeId: store.id, id: Date.now() });
    }
  }

  const routeParams = useLocalSearchParams<{ targetTab?: string; homeScope?: string; month?: string }>();
  const tabRouter = useRouter();
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

  function goToTab(tab: TabName) {
    if (tab === 'more') { setMoreOpen(true); return; }
    if (tab !== 'home' && effectiveHomeMode === 'dashboard') { openStorePicker(tab); return; }
    setReturnScope('store');
    const idx = tabs.indexOf(tab);
    if (idx === -1) return;
    if (idx === activeIndex) return;
    requestedPage.current = idx;
    setActiveIndex(idx);
    setVisited(previous => previous.has(idx) ? previous : new Set(previous).add(idx));
    setQuickAddVisible(false);
    pagerRef.current?.setPageWithoutAnimation(idx);
  }

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
  const costShelf = activeTab === 'purchases' && viewState['purchase.section'] === '비용';

  return (
    <TabPagerContext.Provider value={{ activeTab, goToTab, homeMode: effectiveHomeMode, setHomeMode, openStorePicker, selectStoreScope, selectedMonth, setSelectedMonth, returnScope, viewState, setViewState, employeeRegistration, consumeEmployeeRegistration: () => setEmployeeRegistration(undefined) }}>
      <View style={styles.flex} onLayout={event => setContainerHeight(event.nativeEvent.layout.height)}>
        <GlassBackdrop />
        <PagerView
          ref={pagerRef}
          style={styles.flex}
          initialPage={0}
          scrollEnabled={effectiveHomeMode !== 'dashboard' && !switching}
          onPageSelected={e => handlePageSelected(e.nativeEvent.position)}
        >
          {tabs.map((tab, idx) => (
            <View key={tab} style={styles.flex}>
              {tab !== 'home' && <View accessibilityElementsHidden={activeIndex !== idx} importantForAccessibility={activeIndex !== idx ? 'no-hide-descendants' : 'auto'}>
                <StoreAppBar includeTopInset name={store?.name ?? '매장 선택'} unreadCount={unreadCount}
                  onMenu={() => goToTab('more')} onStore={() => openStorePicker()}
                  onNotifications={() => tabRouter.push('/notifications')} onProfile={() => tabRouter.push('/mypage')} />
              </View>}
              {visited.has(idx) ? <TabPage key={store?.id} tab={tab} active={activeIndex === idx} reserveFab={!isPartTime && canReadFinancials} /> : null}
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

        <MoreDrawer visible={moreOpen} onClose={() => setMoreOpen(false)} />

        <StoreScopePicker key={pickerVisible ? 'open' : 'closed'} visible={pickerVisible} stores={stores} selectedId={store?.id} allSelected={effectiveHomeMode === 'dashboard'} allowAll={isOwnerAdminSelf} required={!!pendingTab || !!pendingRoute} busy={switching} error={switchError}
          onSelect={id => { void selectStoreScope(id).catch(() => {}); }}
          onAll={() => { setHomeMode('dashboard'); setPickerVisible(false); goToTab('home'); }}
          onClose={() => { if (!switching) { setPickerVisible(false); setPendingTab(undefined); setPendingRoute(undefined); setPendingEmployee(false); } }} />

        {!isPartTime && canReadFinancials && (
          <>
            <QuickAddMenu visible={quickAddVisible} onClose={() => setQuickAddVisible(false)} goToTab={goToTab} onRoute={openQuickRoute} onEmployee={openEmployeeRegistration} onResetPosition={() => setFabResetRequest(value => value + 1)} fabPos={fabPos} />
            <DraggableFab
              visible
              iconName={quickAddVisible ? 'close' : 'add'}
              onPress={() => setQuickAddVisible(v => !v)}
              onDragEnd={(x, y) => setFabPos({ x, y })}
              bottomInset={activeTab === 'purchases' && !costShelf ? 88 : 0}
              dockBottom={costShelf || activeTab === 'sales'}
              containerHeight={containerHeight}
              tabBarHeight={tabBarHeight}
              resetRequest={fabResetRequest}
            />
          </>
        )}
      </View>
    </TabPagerContext.Provider>
  );
}

function TabPage({ tab, active, reserveFab }: { tab: TabName; active: boolean; reserveFab: boolean }) {
  const { homeMode } = useTabPager();
  switch (tab) {
    case 'home': return homeMode === 'dashboard' ? <AdminDashboardScreen /> : <HomeScreen active={active} />;
    case 'stock': return <StockScreen active={active} />;
    case 'purchases': return <PurchasesScreen active={active} />;
    case 'payroll': return <PayrollScreen active={active} />;
    case 'sales': return <PosScreen active={active} reserveFab={reserveFab} />;
    case 'more': return null;
  }
}

const styles = StyleSheet.create({
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
  menuOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 10,
  },
  menuBox: {
    position: 'absolute',
    zIndex: 11,
    width: MENU_WIDTH,
    backgroundColor: Colors.white,
    borderRadius: 14,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.black,
  },
});

import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PagerView from 'react-native-pager-view';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { resolveSelfEmployee } from '../../lib/utils/resolveSelfEmployee';
import { TabPagerContext, TabName, HomeMode, useTabPager } from '../../lib/contexts/TabPagerContext';
import { DraggableFab } from '../../lib/components/DraggableFab';
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
  visible, onClose, goToTab, fabPos,
}: {
  visible: boolean; onClose: () => void; goToTab: (tab: TabName) => void; fabPos: { x: number; y: number };
}) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  if (!visible) return null;

  function handleSelect(item: QuickAddAction) {
    onClose();
    if ('tab' in item) goToTab(item.tab);
    else router.push(item.route as any);
  }

  // FAB 오른쪽 끝에 메뉴 오른쪽 끝을 맞추고, FAB 바로 위(아래에서부터 거리 기준)에 띄운다. 화면 밖으로 안 나가게 clamp
  const menuLeft = Math.min(Math.max(fabPos.x + FAB_SIZE - MENU_WIDTH, 8), width - MENU_WIDTH - 8);
  const menuBottom = height - fabPos.y + 8;

  return (
    <>
      <Pressable style={styles.menuOverlay} onPress={onClose} />
      <View style={[styles.menuBox, { left: menuLeft, bottom: menuBottom }]}>
        {QUICK_ADD_ITEMS.map((item) => (
          <Pressable key={item.key} style={styles.menuItem} onPress={() => handleSelect(item)}>
            <Ionicons name={item.icon} size={16} color={Colors.primary} />
            <Text style={styles.menuItemText}>{item.label}</Text>
          </Pressable>
        ))}
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
  const { user, currentRole, realRole, devPreviewMode, devPreviewEmployeeId } = useAuth();
  const { employees, refetch } = useEmployees();

  useEffect(() => { refetch(); }, [refetch]);

  // 파트타이머는 하단 탭을 홈·재고·설정으로 간소화 (관리자 테스트 미리보기도 반영)
  const myEmployee = resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId);
  const isPartTime = currentRole !== 'admin' && myEmployee?.employment_type === 'part_time';

  // 사장님 본인(미리보기 아님)일 때만 홈 탭이 통합 대시보드/매장 홈을 오갈 수 있음
  const isOwnerAdminSelf = realRole === 'admin' && devPreviewMode === 'self';
  const [homeMode, setHomeModeState] = useState<HomeMode>(isOwnerAdminSelf ? 'dashboard' : 'store');
  const effectiveHomeMode: HomeMode = isOwnerAdminSelf ? homeMode : 'store';
  function setHomeMode(mode: HomeMode) { setHomeModeState(mode); }

  // 스와이프 가능한 탭 순서 — 더보기는 이제 페이지가 아니라 드로어라 여기 없음
  const tabs: TabName[] = useMemo(
    () => isPartTime ? ['home', 'stock'] : ['home', 'stock', 'purchases', 'payroll', 'sales'],
    [isPartTime]
  );

  const pagerRef = useRef<PagerView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));
  const [quickAddVisible, setQuickAddVisible] = useState(false);
  const [fabPos, setFabPos] = useState({ x: 0, y: 0 });
  const [moreOpen, setMoreOpen] = useState(false);

  const routeParams = useLocalSearchParams<{ targetTab?: string }>();
  const tabRouter = useRouter();
  useEffect(() => {
    if (!routeParams.targetTab) return;
    const index = tabs.indexOf(routeParams.targetTab as TabName);
    if (index >= 0) {
      setVisited(prev => new Set(prev).add(index));
      setActiveIndex(index);
      pagerRef.current?.setPageWithoutAnimation(index);
    }
    tabRouter.setParams({ targetTab: undefined });
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
    const idx = tabs.indexOf(tab);
    if (idx === -1) return;
    pagerRef.current?.setPage(idx);
  }

  function handlePageSelected(idx: number) {
    setActiveIndex(idx);
    setVisited(prev => prev.has(idx) ? prev : new Set(prev).add(idx));
  }

  const activeTab = tabs[activeIndex] ?? 'home';

  return (
    <TabPagerContext.Provider value={{ activeTab, goToTab, homeMode: effectiveHomeMode, setHomeMode }}>
      <View style={styles.flex}>
        <PagerView
          ref={pagerRef}
          style={styles.flex}
          initialPage={0}
          onPageSelected={e => handlePageSelected(e.nativeEvent.position)}
        >
          {tabs.map((tab, idx) => (
            <View key={tab} style={styles.flex}>
              {visited.has(idx) ? <TabPage tab={tab} active={activeIndex === idx} /> : null}
            </View>
          ))}
        </PagerView>

        <View style={styles.tabBar}>
          {tabs.map((tab) => (
            <Pressable key={tab} style={styles.tabBarItem} onPress={() => goToTab(tab)}>
              <TabIcon tab={tab} focused={activeTab === tab} />
            </Pressable>
          ))}
        </View>

        <MoreDrawer visible={moreOpen} onClose={() => setMoreOpen(false)} />

        {!isPartTime && (
          <>
            <QuickAddMenu visible={quickAddVisible} onClose={() => setQuickAddVisible(false)} goToTab={goToTab} fabPos={fabPos} />
            <DraggableFab
              visible
              iconName={quickAddVisible ? 'close' : 'add'}
              onPress={() => setQuickAddVisible(v => !v)}
              onDragEnd={(x, y) => setFabPos({ x, y })}
            />
          </>
        )}
      </View>
    </TabPagerContext.Provider>
  );
}

function TabPage({ tab, active }: { tab: TabName; active: boolean }) {
  const { homeMode } = useTabPager();
  switch (tab) {
    case 'home': return homeMode === 'dashboard' ? <AdminDashboardScreen /> : <HomeScreen active={active} />;
    case 'stock': return <StockScreen active={active} />;
    case 'purchases': return <PurchasesScreen active={active} />;
    case 'payroll': return <PayrollScreen active={active} />;
    case 'sales': return <PosScreen active={active} />;
    case 'more': return null;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    height: 80,
    paddingTop: 10,
    backgroundColor: Colors.white,
    borderTopWidth: 0.5,
    borderTopColor: Colors.gray200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
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
  labelActive: { color: Colors.primary, fontWeight: '700' },
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
  },
  menuBox: {
    position: 'absolute',
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

import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import PagerView from 'react-native-pager-view';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { useLowStockCount } from '../../lib/hooks/useLowStockCount';
import { TabPagerContext, TabName } from '../../lib/contexts/TabPagerContext';
import { HomeScreen } from './index';
import { StockScreen } from './stock';
import { PurchasesScreen } from './purchases';
import { PayrollScreen } from './payroll';
import { MoreScreen } from './more';

const TAB_CONFIG: Record<TabName, {
  active: keyof typeof Ionicons.glyphMap;
  inactive: keyof typeof Ionicons.glyphMap;
  label: string;
}> = {
  home:      { active: 'home',        inactive: 'home-outline',        label: '홈' },
  stock:     { active: 'cube',        inactive: 'cube-outline',        label: '재고' },
  purchases: { active: 'cart',        inactive: 'cart-outline',        label: '매입' },
  payroll:   { active: 'people',      inactive: 'people-outline',      label: '인건비' },
  more:      { active: 'settings',    inactive: 'settings-outline',    label: '설정' },
};

function TabIcon({ tab, focused, badge }: { tab: TabName; focused: boolean; badge?: number }) {
  const cfg = TAB_CONFIG[tab];
  const showBadge = !!badge && badge > 0;
  return (
    <View style={styles.iconWrap}>
      {focused && <View style={styles.indicator} />}
      <View>
        <Ionicons
          name={focused ? cfg.active : cfg.inactive}
          size={22}
          color={focused ? Colors.primary : Colors.gray400}
        />
        {showBadge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText} numberOfLines={1}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1} adjustsFontSizeToFit>{cfg.label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { user, currentRole } = useAuth();
  const { employees, refetch } = useEmployees();
  const { count: lowStockCount } = useLowStockCount();

  useEffect(() => { refetch(); }, [refetch]);

  // 파트타이머는 하단 탭을 홈·재고·설정으로 간소화
  const isPartTime = currentRole !== 'admin'
    && employees.some(e => e.user_id === user?.id && e.employment_type === 'part_time');

  // 스와이프 가능한 탭 순서 (파트타이머는 매입/인건비 제외)
  const tabs: TabName[] = useMemo(
    () => isPartTime ? ['home', 'stock', 'more'] : ['home', 'stock', 'purchases', 'payroll', 'more'],
    [isPartTime]
  );

  const pagerRef = useRef<PagerView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));

  // 파트타이머 여부가 바뀌어 탭 개수가 줄면 인덱스 보정
  useEffect(() => {
    if (activeIndex >= tabs.length) {
      setActiveIndex(0);
      setVisited(new Set([0]));
      pagerRef.current?.setPageWithoutAnimation(0);
    }
  }, [tabs.length, activeIndex]);

  function goToTab(tab: TabName) {
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
    <TabPagerContext.Provider value={{ activeTab, goToTab }}>
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
          {tabs.map((tab, idx) => (
            <Pressable key={tab} style={styles.tabBarItem} onPress={() => pagerRef.current?.setPage(idx)}>
              <TabIcon tab={tab} focused={activeIndex === idx} badge={tab === 'stock' ? lowStockCount : undefined} />
            </Pressable>
          ))}
        </View>
      </View>
    </TabPagerContext.Provider>
  );
}

function TabPage({ tab, active }: { tab: TabName; active: boolean }) {
  switch (tab) {
    case 'home': return <HomeScreen active={active} />;
    case 'stock': return <StockScreen active={active} />;
    case 'purchases': return <PurchasesScreen active={active} />;
    case 'payroll': return <PayrollScreen active={active} />;
    case 'more': return <MoreScreen />;
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
  tabBarItem: { flex: 1, alignItems: 'center' },
  iconWrap: { alignItems: 'center', gap: 3 },
  indicator: {
    position: 'absolute',
    top: -10,
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  label: { fontSize: 10, fontWeight: '500', color: Colors.gray400 },
  labelActive: { color: Colors.primary, fontWeight: '700' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
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

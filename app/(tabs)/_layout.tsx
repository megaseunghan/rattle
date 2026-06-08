import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';

type TabName = 'home' | 'pos' | 'purchases' | 'payroll' | 'stock' | 'more';

const TAB_CONFIG: Record<TabName, {
  active: keyof typeof Ionicons.glyphMap;
  inactive: keyof typeof Ionicons.glyphMap;
  label: string;
}> = {
  home:      { active: 'home',        inactive: 'home-outline',        label: '홈' },
  pos:       { active: 'bar-chart',   inactive: 'bar-chart-outline',   label: '매출' },
  purchases: { active: 'cart',        inactive: 'cart-outline',        label: '매입/비용' },
  payroll:   { active: 'people',      inactive: 'people-outline',      label: '인건비' },
  stock:     { active: 'cube',        inactive: 'cube-outline',        label: '재고' },
  more:      { active: 'settings',    inactive: 'settings-outline',    label: '설정' },
};

function TabIcon({ tab, focused }: { tab: TabName; focused: boolean }) {
  const cfg = TAB_CONFIG[tab];
  return (
    <View style={styles.iconWrap}>
      {focused && <View style={styles.indicator} />}
      <Ionicons
        name={focused ? cfg.active : cfg.inactive}
        size={22}
        color={focused ? Colors.primary : Colors.gray400}
      />
      <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1} adjustsFontSizeToFit>{cfg.label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { user, currentRole } = useAuth();
  const { employees } = useEmployees();

  // 파트타이머는 하단 탭을 홈·재고·설정으로 간소화
  const myEmployee = employees.find(e => e.user_id === user?.id);
  const isPartTime = currentRole !== 'admin' && myEmployee?.employment_type === 'part_time';

  // href: null 이면 탭바에서 숨김
  const hidden = { href: null as null };
  const visible = {};

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen name="index"     options={{ tabBarIcon: ({ focused }) => <TabIcon tab="home"      focused={focused} /> }} />
      <Tabs.Screen name="pos"       options={{ ...(isPartTime ? hidden : visible), tabBarIcon: ({ focused }) => <TabIcon tab="pos"       focused={focused} /> }} />
      <Tabs.Screen name="purchases" options={{ ...(isPartTime ? hidden : visible), tabBarIcon: ({ focused }) => <TabIcon tab="purchases" focused={focused} /> }} />
      <Tabs.Screen name="payroll"   options={{ ...(isPartTime ? hidden : visible), tabBarIcon: ({ focused }) => <TabIcon tab="payroll"   focused={focused} /> }} />
      {/* 재고: 파트타이머에게만 탭으로 노출 */}
      <Tabs.Screen name="stock"     options={{ ...(isPartTime ? visible : hidden),  tabBarIcon: ({ focused }) => <TabIcon tab="stock"     focused={focused} /> }} />
      <Tabs.Screen name="more"      options={{ tabBarIcon: ({ focused }) => <TabIcon tab="more"      focused={focused} /> }} />
      {/* 숨김 라우트 */}
      <Tabs.Screen name="expenses"  options={{ href: null }} />
      <Tabs.Screen name="orders"    options={{ href: null }} />
      <Tabs.Screen name="recipes"   options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
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
});

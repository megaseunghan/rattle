import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

type TabName = 'pos' | 'purchases' | 'home' | 'expenses' | 'payroll';

const TAB_CONFIG: Record<TabName, {
  active: keyof typeof Ionicons.glyphMap;
  inactive: keyof typeof Ionicons.glyphMap;
  label: string;
}> = {
  pos:       { active: 'bar-chart',   inactive: 'bar-chart-outline',   label: '매출' },
  purchases: { active: 'cart',        inactive: 'cart-outline',        label: '매입' },
  home:      { active: 'home',        inactive: 'home-outline',        label: '홈' },
  expenses:  { active: 'wallet',      inactive: 'wallet-outline',      label: '비용' },
  payroll:   { active: 'people',      inactive: 'people-outline',      label: '직원관리' },
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
      <Text style={[styles.label, focused && styles.labelActive]}>{cfg.label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen name="pos"       options={{ tabBarIcon: ({ focused }) => <TabIcon tab="pos"       focused={focused} /> }} />
      <Tabs.Screen name="purchases" options={{ tabBarIcon: ({ focused }) => <TabIcon tab="purchases" focused={focused} /> }} />
      <Tabs.Screen name="index"     options={{ tabBarIcon: ({ focused }) => <TabIcon tab="home"      focused={focused} /> }} />
      <Tabs.Screen name="expenses"  options={{ tabBarIcon: ({ focused }) => <TabIcon tab="expenses"  focused={focused} /> }} />
      <Tabs.Screen name="payroll"   options={{ tabBarIcon: ({ focused }) => <TabIcon tab="payroll"   focused={focused} /> }} />
      {/* 하단 탭에서 숨기되 라우트는 유지 */}
      <Tabs.Screen name="stock"     options={{ href: null }} />
      <Tabs.Screen name="more"      options={{ href: null }} />
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
  label: { fontSize: 11, fontWeight: '500', color: Colors.gray400 },
  labelActive: { color: Colors.primary, fontWeight: '700' },
});

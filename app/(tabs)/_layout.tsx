import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

type TabIconName = 'home' | 'orders' | 'stock' | 'recipes' | 'pos';

const TAB_ICONS: Record<TabIconName, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap; label: string }> = {
  home:    { active: 'home',          inactive: 'home-outline',          label: '홈' },
  orders:  { active: 'document-text', inactive: 'document-text-outline', label: '발주' },
  stock:   { active: 'bar-chart',     inactive: 'bar-chart-outline',     label: '재고' },
  recipes: { active: 'restaurant',    inactive: 'restaurant-outline',    label: '레시피' },
  pos:     { active: 'storefront',    inactive: 'storefront-outline',    label: '포스' },
};

function TabIcon({ tab, focused }: { tab: TabIconName; focused: boolean }) {
  const { active, inactive, label } = TAB_ICONS[tab];
  return (
    <View style={styles.tabIconWrap}>
      {focused && <View style={styles.tabIndicator} />}
      <Ionicons
        name={focused ? active : inactive}
        size={22}
        color={focused ? Colors.primary : Colors.gray400}
      />
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
        {label}
      </Text>
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
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.gray400,
      }}
    >
      <Tabs.Screen
        name="orders"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon tab="orders" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon tab="stock" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon tab="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="pos"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon tab="pos" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon tab="recipes" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 80,
    paddingTop: 10,
    backgroundColor: Colors.white,
    borderTopWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  tabIconWrap: {
    alignItems: 'center',
    gap: 3,
  },
  tabIndicator: {
    position: 'absolute',
    top: -10,
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.gray400,
  },
  tabLabelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
});

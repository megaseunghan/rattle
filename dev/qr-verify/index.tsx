/** Offline verification only. Production entrypoints and providers are never modified. */
import { registerRootComponent } from 'expo';
import { useEffect } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { FONT_ASSETS } from '../../constants/fonts';
import { Colors } from '../../constants/colors';
import { applyGlobalFont } from '../../lib/utils/applyGlobalFont';
import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
import { HomeAttendanceCard } from '../../lib/components/HomeAttendanceCard';
import { DailyOperationsHome } from '../../lib/components/DailyOperationsHome';
import { HomeScreen } from '../../app/(tabs)/index';
import { PosScreen } from '../../app/pos';
import { TabPagerContext } from './fixtures';
import MyQr from '../../app/attendance/my-qr';
import Correction from '../../app/attendance/correction';
import Visibility from '../../app/settings/store-visibility';
import Manager from '../../app/settings/store-manager';
import Scanner from '../../app/attendance/scanner';
import Pairing from '../../app/settings/scanner-pairing';
import { change, useEmployees, useFixture } from './fixtures';
import { supabaseCalls } from './network-guard';
applyGlobalFont();
function App() {
  const [fonts] = useFonts(FONT_ASSETS); const state = useFixture(); const employees = useEmployees();
  useEffect(() => {
    let last = ''; let active = true;
    const timer = setInterval(() => { void fetch(`http://localhost:8090/fixture-state.json?v=${Date.now()}`).then(response => response.text()).then(text => { if (active && text !== last) { last = text; change(JSON.parse(text)); console.info('QR_VERIFY', JSON.parse(text).scene, 'supabaseCalls', supabaseCalls); } }).catch(() => {}); }, 500);
    return () => { active = false; clearInterval(timer); };
  }, []);
  if (!fonts) return null;
  if (supabaseCalls !== 0) throw new Error('Verification attempted network access');
  const screen = state.scene === 'performance' ? <PerformanceScreens /> : state.scene === 'qr' || state.scene === '/attendance/my-qr' ? <MyQr /> : state.scene === 'correction' || state.scene === '/attendance/correction' ? <Correction /> : state.scene === 'sharing' ? <Visibility /> : state.scene === 'manager' ? <Manager /> : state.scene === 'scanner' ? <Scanner /> : state.scene === 'pairing' ? <Pairing /> : <SafeAreaView style={styles.root}><GlassBackdrop /><ScrollView contentContainerStyle={styles.content}><HomeAttendanceCard employee={employees.employees[0] as any} active refreshKey={0} /><DailyOperationsHome active refreshKey={0} isAdmin={['owner', 'manager'].includes(state.role)} isPartTime={state.role === 'part_timer'} canUseFinancialTabs={['owner', 'manager'].includes(state.role)} /></ScrollView></SafeAreaView>;
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider>{screen}</SafeAreaProvider></GestureHandlerRootView>;
}
function PerformanceScreens() {
  const state = useFixture(); const tab = state.performanceTab ?? 'home';
  const value = { activeTab: tab, goToTab: (next: string) => change({ performanceTab: next }), selectedMonth: '2026-11', setSelectedMonth: () => {}, innerGestureActive: false, setPagerGestureActive: () => {} };
  return <TabPagerContext.Provider value={value}><SafeAreaView style={styles.root}><GlassBackdrop /><View style={{ flex: 1 }}><View style={{ flex: 1, display: tab === 'home' ? 'flex' : 'none' }}><HomeScreen active={tab === 'home'} /></View><View style={{ flex: 1, display: tab === 'sales' ? 'flex' : 'none' }}><PosScreen active={tab === 'sales'} /></View></View><View style={{ flexDirection: 'row', backgroundColor: Colors.white }}>{(['home', 'sales'] as const).map(next => <Pressable key={next} accessibilityRole="button" accessibilityLabel={next === 'home' ? '검증 홈 탭' : '검증 매출 탭'} onPress={() => change({ performanceTab: next })} style={{ flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center' }}><Text>{next === 'home' ? '홈' : '매출'}</Text></Pressable>)}</View></SafeAreaView></TabPagerContext.Provider>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: Colors.homeCanvas }, content: { padding: 20, gap: 18, paddingBottom: 100 } });
registerRootComponent(App);

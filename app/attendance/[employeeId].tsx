import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { AttendanceCalendar } from '../../lib/components/AttendanceCalendar';
import { AppBar } from '../../lib/components/ui';

/** 화면 24 · 근태 기록 전체보기 — 월 캘린더 + 일자별 출퇴근 기록 */
export default function AttendanceHistoryScreen() {
  const { employeeId, name } = useLocalSearchParams<{ employeeId: string; name?: string }>();
  const { store } = useAuth();

  if (!store || !employeeId) return null;

  return (
    <SafeAreaView style={styles.container}>
      <AppBar title={name ? `${name} · 근태 기록` : '근태 기록'} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.body}>
          <AttendanceCalendar storeId={store.id} employeeId={employeeId} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  scroll: { paddingBottom: 40 },
  body: { padding: Spacing.screenX },
});

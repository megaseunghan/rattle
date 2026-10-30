import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { GlassBackdrop } from '../lib/components/GlassBackdrop';
import { ExpensesPanel } from '../lib/components/ExpensesPanel';
import { AppBar } from '../lib/components/ui';
import { Colors } from '../constants/colors';

export default function ExpensesScreen() {
  return (
    <SafeAreaView style={styles.safeArea}><GlassBackdrop />
      <AppBar title="비용 등록" onBack={() => router.back()} />
      <ExpensesPanel />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.homeCanvas },
});

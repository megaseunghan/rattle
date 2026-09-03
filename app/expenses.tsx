import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { ExpensesPanel } from '../lib/components/ExpensesPanel';

export default function ExpensesScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ExpensesPanel />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
});

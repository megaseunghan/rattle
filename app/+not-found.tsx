import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '../constants/colors';
import { AppBar, Button } from '../lib/components/ui';
import { useAuth } from '../lib/contexts/AuthContext';

export default function NotFoundScreen() {
  const { user, store, loading } = useAuth();
  return <SafeAreaView style={styles.page}>
    <AppBar title="화면을 찾을 수 없어요" />
    <View style={styles.content}>
      <Text style={styles.body}>주소가 변경되었거나 사용할 수 없는 화면이에요. 홈에서 다시 이동해주세요.</Text>
      <Button label="홈으로 돌아가기" disabled={loading} onPress={() => { if (!loading) router.replace(!user ? '/(auth)/login' : !store ? '/(auth)/select-store' : '/(tabs)'); }} />
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.homeCanvas },
  content: { padding: 24, gap: 24 },
  body: { fontSize: 16, lineHeight: 24, color: Colors.gray600 },
});

import { SplashScreen, Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState, Alert } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AuthProvider, useAuth } from '../lib/contexts/AuthContext';
import { useTossSync } from '../lib/hooks/useTossSync';
import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

SplashScreen.preventAutoHideAsync();

const PENDING_CHECK_INTERVAL = 30 * 60 * 1000; // 30분

function RootNavigator() {
  const { user, store, currentRole, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const { autoSync } = useTossSync();
  const lastCheckedAt = useRef<number>(0);

  async function checkPendingMembers() {
    if (!store || currentRole !== 'admin') return;
    const now = Date.now();
    if (now - lastCheckedAt.current < PENDING_CHECK_INTERVAL) return;
    lastCheckedAt.current = now;

    const { count } = await supabase
      .from('store_members')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', store.id)
      .eq('status', 'pending');

    if (count && count > 0) {
      Alert.alert(
        '멤버 승인 요청',
        `${count}건의 매장 참여 요청이 있습니다.`,
        [
          { text: '나중에', style: 'cancel' },
          { text: '확인하기', onPress: () => router.push('/settings/members') },
        ],
      );
    }
  }

  useEffect(() => {
    if (loading) return;

    SplashScreen.hideAsync();

    const inAuth = segments[0] === '(auth)';

    if (!user) {
      if (!inAuth) router.replace('/(auth)/login');
    } else if (!store) {
      if (!segments.includes('select-store')) router.replace('/(auth)/select-store');
    } else {
      if (inAuth && !segments.includes('select-store')) router.replace('/(tabs)');
    }
  }, [loading, user, store]);

  // 로그인 + 매장 준비 완료 시 최초 1회 체크
  useEffect(() => {
    if (!loading && user && store) {
      checkPendingMembers();
    }
  }, [user?.id, store?.id]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        autoSync();
        checkPendingMembers();
      }
    });
    return () => subscription.remove();
  }, [autoSync, store, currentRole]);

  // OAuth 콜백 딥링크 처리 (카카오 로그인)
  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      if (!url.includes('code=')) return;
      await supabase.auth.exchangeCodeForSession(url);
    };

    const subscription = Linking.addEventListener('url', handleUrl);
    return () => subscription.remove();
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.white },
      }}
    >
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="orders/new"
        options={{
          headerShown: true,
          title: '발주 등록',
          headerTintColor: Colors.black,
          headerStyle: { backgroundColor: Colors.white },
        }}
      />
      <Stack.Screen
        name="recipes/new"
        options={{
          headerShown: true,
          title: '레시피 등록',
          headerTintColor: Colors.black,
          headerStyle: { backgroundColor: Colors.white },
        }}
      />
      <Stack.Screen name="orders/ocr-review" options={{ headerShown: false }} />
      <Stack.Screen name="orders/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="recipes/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="settings/profile" options={{ headerShown: false }} />
      <Stack.Screen name="settings/members" options={{ headerShown: false }} />
<Stack.Screen name="pos/[date]" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AuthProvider>
  );
}

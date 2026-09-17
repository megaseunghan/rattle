import { SplashScreen, Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AppState, Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AuthProvider, useAuth } from '../lib/contexts/AuthContext';
import { DevRoleSwitcher } from '../lib/components/DevRoleSwitcher';
import { completeAuthCallback } from '../lib/services/authCallback';
import { SplashAnimation } from '../lib/components/SplashAnimation';
import { useTossSync } from '../lib/hooks/useTossSync';
import { Colors } from '../constants/colors';
import { FONT_ASSETS } from '../constants/fonts';
import { applyGlobalFont } from '../lib/utils/applyGlobalFont';
import { supabase } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

SplashScreen.preventAutoHideAsync();

applyGlobalFont();

const PENDING_CHECK_INTERVAL = 30 * 60 * 1000; // 30분

function RootNavigator() {
  const { user, store, currentRole, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const { autoSyncOnForeground } = useTossSync();
  const lastCheckedAt = useRef<number>(0);
  const [showIntro, setShowIntro] = useState(true);
  const [introReady, setIntroReady] = useState(false);

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

    SplashScreen.hideAsync().then(() => setIntroReady(true)).catch(() => setIntroReady(true));

    const inAuth = segments[0] === '(auth)';
    const onLoginFlow = segments.includes('login');

    if (!user) {
      // 로그인 화면이 아니면 로그인으로 (select-store에서 로그아웃 시 빈 화면 방지)
      if (!onLoginFlow) router.replace('/(auth)/login');
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
        autoSyncOnForeground();
        checkPendingMembers();
      }
    });
    return () => subscription.remove();
  }, [autoSyncOnForeground, store, currentRole]);

  // OAuth 콜백 딥링크 처리 (카카오 로그인)
  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      try {
        await completeAuthCallback(url, Linking.createURL('/'));
      } catch {
        Alert.alert('로그인 오류', '인증을 완료하지 못했습니다. 다시 로그인해주세요.');
      }
    };

    const subscription = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then(url => { if (url) void handleUrl({ url }); }).catch(() => {});
    return () => subscription.remove();
  }, []);

  return (
    <>
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
      <Stack.Screen name="settings/account" options={{ headerShown: false }} />
      <Stack.Screen name="settings/password" options={{ headerShown: false }} />
      <Stack.Screen name="settings/store" options={{ headerShown: false }} />
      <Stack.Screen name="settings/members" options={{ headerShown: false }} />
<Stack.Screen name="pos/[date]" options={{ headerShown: false }} />
      <Stack.Screen name="pos/new" options={{ headerShown: false }} />
      <Stack.Screen name="profit-loss/index" options={{ headerShown: false }} />
      <Stack.Screen name="attendance/index" options={{ headerShown: false }} />
      <Stack.Screen name="attendance/correction" options={{ headerShown: false }} />
      <Stack.Screen name="attendance/requests" options={{ headerShown: false }} />
      <Stack.Screen name="mypage/index" options={{ headerShown: false }} />
      <Stack.Screen name="mypage/schedule" options={{ headerShown: false }} />
      <Stack.Screen name="mypage/payslip" options={{ headerShown: false }} />
      <Stack.Screen name="payroll/settlement" options={{ headerShown: false }} />
      <Stack.Screen name="notifications/index" options={{ headerShown: false }} />
      <Stack.Screen name="notifications/settings" options={{ headerShown: false }} />
      <Stack.Screen name="legal/terms" options={{ headerShown: false }} />
      <Stack.Screen name="legal/privacy" options={{ headerShown: false }} />
    </Stack>
    {!loading && user && store && <DevRoleSwitcher />}
    {showIntro && <SplashAnimation ready={introReady} onDone={() => setShowIntro(false)} />}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);

  if (!fontsLoaded && !fontError) {
    // 스플래시가 떠 있는 동안 로드되므로 별도 로딩 화면 불필요
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

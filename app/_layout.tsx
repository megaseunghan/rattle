import { SplashScreen, Stack, useRouter, useSegments, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
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
import { isFinancialRoute } from '../lib/utils/financialSharing';
import { RattleQueryProvider } from '../lib/query';

WebBrowser.maybeCompleteAuthSession();

SplashScreen.preventAutoHideAsync();

applyGlobalFont();

function RootNavigator() {
  const { user, store, loading, canReadFinancials, currentRole } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const { autoSyncOnForeground } = useTossSync();
  const [showIntro, setShowIntro] = useState(true);
  const [introReady, setIntroReady] = useState(false);
  const finishIntro = useCallback(() => setShowIntro(false), []);

  useEffect(() => {
    let mounted = true;
    const start = () => { if (mounted) setIntroReady(true); };
    SplashScreen.hideAsync().then(start).catch(start);
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    const onLoginFlow = segments.includes('login');

    if (!user) {
      // 로그인 화면이 아니면 로그인으로 (select-store에서 로그아웃 시 빈 화면 방지)
      if (!onLoginFlow) router.replace('/(auth)/login');
    } else if (!store) {
      if (!segments.includes('select-store') && !segments.includes('join-store')) router.replace('/(auth)/select-store');
    } else {
      if (inAuth && !segments.includes('select-store') && !segments.includes('join-store')) router.replace('/(tabs)');
    }
  }, [loading, user, store]);

  useEffect(() => {
    if (!loading && user && store && ((!canReadFinancials && isFinancialRoute(pathname)) ||
      (currentRole !== 'admin' && (pathname.startsWith('/admin') || pathname.startsWith('/profit-loss') || pathname.startsWith('/settings/pos-sync'))))) router.replace('/(tabs)');
  }, [loading, user?.id, store?.id, canReadFinancials, currentRole, pathname]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        autoSyncOnForeground();
      }
    });
    return () => subscription.remove();
  }, [autoSyncOnForeground]);

  // 브라우저 OAuth 콜백 딥링크 처리 (카카오·Google)
  useEffect(() => {
    let active = true;
    const handleUrl = async ({ url }: { url: string }) => {
      if (!active) return;
      try {
        await completeAuthCallback(url, Linking.createURL('/'));
      } catch {
        if (active) Alert.alert('로그인 오류', '인증을 완료하지 못했습니다. 다시 로그인해주세요.');
      }
    };

    const subscription = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then(url => { if (url) void handleUrl({ url }); }).catch(() => {});
    return () => { active = false; subscription.remove(); };
  }, []);

  if (!loading && user && store && ((!canReadFinancials && isFinancialRoute(pathname)) ||
    (currentRole !== 'admin' && (pathname.startsWith('/admin') || pathname.startsWith('/profit-loss') || pathname.startsWith('/settings/pos-sync'))))) return null;

  return (
    <>
    <Stack
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        contentStyle: { backgroundColor: Colors.white },
      }}
    >
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="recipes/new" />
      <Stack.Screen name="recipes/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="settings/account" options={{ headerShown: false }} />
      <Stack.Screen name="settings/password" options={{ headerShown: false }} />
      <Stack.Screen name="settings/store" options={{ headerShown: false }} />
      <Stack.Screen name="settings/members" options={{ headerShown: false }} />
      <Stack.Screen name="pos/[date]" options={{ headerShown: false }} />
      <Stack.Screen name="pos/new" options={{ headerShown: false }} />
      <Stack.Screen name="profit-loss/index" options={{ headerShown: false }} />
      <Stack.Screen name="mypage/index" options={{ headerShown: false }} />
      <Stack.Screen name="mypage/requests" options={{ headerShown: false }} />
      <Stack.Screen name="mypage/schedule" options={{ headerShown: false }} />
      <Stack.Screen name="mypage/payslip" options={{ headerShown: false }} />
      <Stack.Screen name="payroll/settlement" options={{ headerShown: false }} />
      <Stack.Screen name="notifications/index" options={{ headerShown: false }} />
      <Stack.Screen name="notifications/settings" options={{ headerShown: false }} />
      <Stack.Screen name="legal/terms" options={{ headerShown: false }} />
      <Stack.Screen name="legal/privacy" options={{ headerShown: false }} />
    </Stack>
    {__DEV__ && !loading && user && store && segments[0] !== '(auth)' && <DevRoleSwitcher />}
    {showIntro && <SplashAnimation ready={introReady} canExit={!loading} onDone={finishIntro} />}
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
      <RattleQueryProvider><AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider></RattleQueryProvider>
    </GestureHandlerRootView>
  );
}

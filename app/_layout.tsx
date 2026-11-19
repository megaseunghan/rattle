import { Navigator, router, SplashScreen, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { FONT_ASSETS } from '../constants/fonts';
import { applyGlobalFont } from '../lib/utils/applyGlobalFont';
import { useScannerLaunch } from '../lib/hooks/useScannerLaunch';
import AttendanceScannerScreen from './attendance/scanner';
import { LoadingSpinner } from '../lib/components/LoadingSpinner';
import { ErrorMessage } from '../lib/components/ErrorMessage';

SplashScreen.preventAutoHideAsync();
applyGlobalFont();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  const pathname = usePathname();
  const scannerLaunch = useScannerLaunch(pathname);
  useEffect(() => {
    if ((fontsLoaded || fontError) && (scannerLaunch.scanner || scannerLaunch.error)) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError, scannerLaunch.scanner, scannerLaunch.error]);

  if (!fontsLoaded && !fontError) {
    // 스플래시가 떠 있는 동안 로드되므로 별도 로딩 화면 불필요
    return null;
  }

  if (scannerLaunch.checking) return <LoadingSpinner />;
  if (scannerLaunch.error) return <ErrorMessage message="매장폰 등록 상태를 확인하지 못했어요. 다시 확인해주세요" onRetry={() => { void scannerLaunch.refetch(); }} />;
  // Scanner mode has a navigator for replace(), with no route slot or app sync effects.
  // Rendering this surface for every incoming path also blocks links into other screens.
  if (scannerLaunch.scanner) {
    return <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Navigator>
        <AttendanceScannerScreen onLeft={() => {
          router.replace('/(auth)/login');
          scannerLaunch.afterLeave();
        }} />
      </Navigator>
    </GestureHandlerRootView>;
  }

  // Metro defers evaluating this branch: scanner startup never imports app auth/query clients.
  const ApplicationRoot = (require('../lib/components/ApplicationRoot') as typeof import('../lib/components/ApplicationRoot')).default;
  return <GestureHandlerRootView style={{ flex: 1 }}><ApplicationRoot /></GestureHandlerRootView>;
}

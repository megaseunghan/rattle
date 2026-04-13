import { SplashScreen, Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { AuthProvider, useAuth } from '../lib/contexts/AuthContext';
import { useTossSync } from '../lib/hooks/useTossSync';
import { Colors } from '../constants/colors';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { user, store, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const { autoSync } = useTossSync();

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

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        autoSync();
      }
    });
    return () => subscription.remove();
  }, [autoSync]);

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

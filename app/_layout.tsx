import { SplashScreen, Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../lib/contexts/AuthContext';
import { Colors } from '../constants/colors';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { user, store, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;

    SplashScreen.hideAsync();

    const inAuth = segments[0] === '(auth)';

    if (!user) {
      if (!inAuth) router.replace('/(auth)/login');
    } else if (!store) {
      if (segments[1] !== 'select-store') router.replace('/(auth)/select-store');
    } else {
      if (inAuth) router.replace('/(tabs)');
    }
  }, [loading, user, store]);

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

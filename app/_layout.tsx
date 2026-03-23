import { Redirect, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../lib/contexts/AuthContext';
import { Colors } from '../constants/colors';

function RootNavigator() {
  const { user, store, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.white }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!store) {
    return <Redirect href="/(auth)/select-store" />;
  }

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

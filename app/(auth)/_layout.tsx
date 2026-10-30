import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, freezeOnBlur: true }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="select-store" />
      <Stack.Screen name="join-store" />
    </Stack>
  );
}

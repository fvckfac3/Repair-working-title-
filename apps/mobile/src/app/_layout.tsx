import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { StoreProvider, useStore } from '@/state/store';

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { state } = useStore();
  useEffect(() => {
    if (state.hydrated) SplashScreen.hideAsync();
  }, [state.hydrated]);
  if (!state.hydrated) return null;

  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="module/[slug]" options={{ title: '' }} />
      <Stack.Screen name="activity/[id]" options={{ title: '', presentation: 'fullScreenModal' }} />
      <Stack.Screen name="safety" options={{ title: 'Safety & Support' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StoreProvider>
        <RootStack />
      </StoreProvider>
    </ThemeProvider>
  );
}

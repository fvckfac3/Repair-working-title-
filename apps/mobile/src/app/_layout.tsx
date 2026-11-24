import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { ThemedText } from '../components/themed-text';
import { Button, Screen } from '../components/ui';
import { deferRootScreen, rootNavigationAccess } from '../state/access';
import { StoreProvider, useStore } from '../state/store';

void SplashScreen.preventAutoHideAsync().catch(() => {});

function RootStack() {
  const { state, storageStatus, retryStorage } = useStore();
  // Support remains available even if storage is slow or unreadable.
  useEffect(() => { void SplashScreen.hideAsync().catch(() => {}); }, []);

  const access = rootNavigationAccess(__DEV__, state, storageStatus);

  return (
    <View style={styles.root}>
      {(storageStatus === 'read-error' || storageStatus === 'write-error') && (
        <View style={styles.warning} accessibilityRole="alert">
          <Text style={styles.warningText}>
            {storageStatus === 'read-error'
              ? 'Saved data could not be read. It has not been replaced. Support is still available.'
              : 'Changes could not be saved. Previous data and safety settings may return after restarting.'}
          </Text>
          <Pressable accessibilityRole="button" onPress={retryStorage} style={styles.retry}>
            <Text style={styles.warningText}>Retry</Text>
          </Pressable>
        </View>
      )}
      <Stack
        screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}
        screenLayout={({ children, route }) => (
          deferRootScreen(access.awaitingRead, route.name) ? (
            <Screen padTop={route.name === '(tabs)'}>
              <ThemedText type="subtitle">
                {storageStatus === 'read-error' ? 'Saved data could not be read' : 'Reading saved data'}
              </ThemedText>
              <ThemedText>Activities remain unavailable until saved data can be read. Support is available now.</ThemedText>
              {storageStatus === 'read-error' && <Button label="Retry reading data" onPress={retryStorage} />}
              <Button label="Safety & Support" variant="secondary" onPress={() => router.push('/safety')} />
            </Screen>
          ) : children
        )}>
        <Stack.Protected guard={access.normalRouteRegistered} redirectTo="/safety">
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="module/[slug]" options={{ title: '' }} />
        </Stack.Protected>
        <Stack.Protected guard={access.activityRouteRegistered} redirectTo="/safety">
          <Stack.Screen name="activity/[id]" options={{ title: '', presentation: 'fullScreenModal' }} />
        </Stack.Protected>
        <Stack.Screen name="safety" options={{ title: 'Safety & Support' }} />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StoreProvider><RootStack /></StoreProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  warning: { backgroundColor: '#ffe5ce', padding: 12, gap: 6 },
  warningText: { color: '#512a12' },
  retry: { alignSelf: 'flex-start', padding: 4 },
});

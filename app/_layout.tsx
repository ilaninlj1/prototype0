import { Stack } from 'expo-router';
import { DarkTheme, ThemeProvider } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { Colors } from '@/constants/theme';
import { PlaybackProvider } from '@/hooks/use-playback';

export const unstable_settings = {
  anchor: '(tabs)',
};

const customTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.text,
    border: Colors.border,
  },
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ThemeProvider value={customTheme}>
        <PlaybackProvider>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: Colors.surface },
              headerTintColor: Colors.text,
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Liked Tracks' }} />
            <Stack.Screen name="export-history" options={{ presentation: 'modal', title: 'Export History' }} />
          </Stack>
          <StatusBar style="light" />
        </PlaybackProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
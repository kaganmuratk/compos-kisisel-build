import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { modalScreenLayout } from '@/components/keyboard-done-bar';

export default function RunLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenLayout={modalScreenLayout}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
      }}>
      <Stack.Screen name="start" />
      <Stack.Screen name="manual" options={{ presentation: 'modal' }} />
      <Stack.Screen name="routes/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="[sessionId]" />
      <Stack.Screen name="summary/[id]" />
      <Stack.Screen name="share/[id]" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

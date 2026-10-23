import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { modalScreenLayout } from '@/components/keyboard-done-bar';

export default function ProgramsLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenLayout={modalScreenLayout}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="day/[dayId]" />
      <Stack.Screen name="day/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="day/add-exercise" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

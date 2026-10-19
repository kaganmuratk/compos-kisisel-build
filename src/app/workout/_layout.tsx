import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function WorkoutLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
      }}>
      <Stack.Screen name="start" />
      <Stack.Screen name="manual" options={{ presentation: 'modal' }} />
      <Stack.Screen name="[sessionId]" />
      <Stack.Screen name="add-exercise" options={{ presentation: 'modal' }} />
      <Stack.Screen name="exercise-history" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

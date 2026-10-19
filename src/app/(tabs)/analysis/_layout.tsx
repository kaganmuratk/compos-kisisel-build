import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function AnalysisLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="nutrition" />
      <Stack.Screen name="run" />
      <Stack.Screen name="body/index" />
      <Stack.Screen name="body/[metric]" />
      <Stack.Screen name="exercises/index" />
      <Stack.Screen name="exercises/[id]" />
    </Stack>
  );
}

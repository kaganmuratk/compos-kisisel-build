import { Stack } from 'expo-router';

import { useNutritionPalette } from '@/components/nutrition-ui';
import { modalScreenLayout } from '@/components/keyboard-done-bar';

export default function NutritionLayout() {
  const palette = useNutritionPalette();
  return (
    <Stack
      screenLayout={modalScreenLayout}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.background },
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="plans/index" />
      <Stack.Screen name="plans/[id]" />
      <Stack.Screen name="plans/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="plans/add-food" options={{ presentation: 'modal' }} />
      <Stack.Screen name="plans/meal/[mealId]" />
    </Stack>
  );
}

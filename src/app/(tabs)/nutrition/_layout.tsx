import { Stack } from 'expo-router';

import { useNutritionPalette } from '@/components/nutrition-ui';

export default function NutritionLayout() {
  const palette = useNutritionPalette();
  return (
    <Stack
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

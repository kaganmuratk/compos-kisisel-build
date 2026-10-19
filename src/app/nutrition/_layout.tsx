import { Stack } from 'expo-router';

import { useNutritionPalette } from '@/components/nutrition-ui';

// Top-level (tab-independent) so these are reachable from both the Beslenme
// tab and the History tab without a tab-switch side effect: pushing a route
// that lives inside a tab's own stack switches the active tab to match, and
// router.back() then pops within that tab's stack rather than returning to
// wherever the navigation actually started from.
export default function NutritionLayout() {
  const palette = useNutritionPalette();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.background },
      }}>
      <Stack.Screen name="add-food" options={{ presentation: 'modal' }} />
      <Stack.Screen name="new-food" options={{ presentation: 'modal' }} />
      <Stack.Screen name="log/[id]" />
      <Stack.Screen name="share" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

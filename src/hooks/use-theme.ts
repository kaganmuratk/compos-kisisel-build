/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useSettings } from '@/db/queries/settings';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Settings' theme picker can't call Appearance.setColorScheme on web —
// react-native-web's useColorScheme only ever reflects the OS/browser
// prefers-color-scheme, never the in-app choice. Reading settings.themeMode
// directly here is what makes "Açık"/"Koyu" actually take effect on web; on
// native, Appearance.setColorScheme already updates what useColorScheme()
// itself reports, so this is just a superset. (Same pattern as
// useNutritionPalette in nutrition-ui.tsx and useTodayTheme in the Today
// screen — this is the version everything else that calls useTheme() falls
// back to, e.g. ThemedView's web outer gutter.)
export function useTheme() {
  const nativeScheme = useColorScheme();
  const { data: settings } = useSettings();
  const mode = settings?.themeMode;
  const resolved = mode === 'light' || mode === 'dark' ? mode : nativeScheme === 'dark' ? 'dark' : 'light';

  return Colors[resolved];
}

// Shadows don't read on a black surface, so cards get elevation only in light mode.
export function useCardShadow() {
  const scheme = useColorScheme();
  if (scheme === 'dark') {
    return {};
  }
  return {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  };
}

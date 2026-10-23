import { useWindowDimensions } from 'react-native';

import { MAX_FONT_SCALE } from '@/constants/theme';

// The text-size factor text is actually rendered at (the OS setting, capped
// like ThemedText caps it). Multiply any fixed width/height that has to fit
// text by this, so the box grows with the text instead of clipping or
// overlapping it on a phone set to a larger text size.
export function useFontScale() {
  const { fontScale } = useWindowDimensions();
  return Math.min(Math.max(fontScale, 1), MAX_FONT_SCALE);
}

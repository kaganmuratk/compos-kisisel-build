import { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useNutritionPalette } from '@/components/nutrition-ui';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius } from '@/constants/theme';

// Shared pill button for header row actions (SHARE / DELETE / PLANS / …) —
// history/day, history/workout, nutrition and run/summary each grew their
// own near-identical copy of this with drifting sizes (44-48 min dimensions,
// 8-12 border radius); this is the one definition all of them use now.
export function HeaderActionButton({
  label,
  onPress,
  accessibilityLabel,
  tone = 'default',
  hitSlop = 10,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  tone?: 'default' | 'danger';
  hitSlop?: number;
}) {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable accessibilityLabel={accessibilityLabel} onPress={onPress} hitSlop={hitSlop} style={styles.button}>
      <ThemedText style={[styles.text, tone === 'danger' && styles.textDanger]}>{label.toUpperCase()}</ThemedText>
    </Pressable>
  );
}

function cardShadowFor(palette: ReturnType<typeof useNutritionPalette>) { return palette.background === '#FAFAF8' ? { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 } : {}; }
const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({
  button: {
    ...cardShadowFor(palette),
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
    backgroundColor: palette.card,
  },
  text: { color: palette.text, fontFamily: Fonts.technical, fontSize: 8, letterSpacing: 0.6 },
  textDanger: { color: palette.red },
});

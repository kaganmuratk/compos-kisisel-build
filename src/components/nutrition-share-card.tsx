import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { nutritionPalette } from '@/components/nutrition-ui';
import { POSTER_HEIGHT, POSTER_WIDTH, SharePosterCard, themeTextShadow } from '@/components/share-poster-card';
import { Fonts } from '@/constants/theme';
import { useT } from '@/lib/i18n';

// Full-bleed export size — matches SharePosterCard's fixed poster canvas
// (kept exported under the old names so nutrition/share.tsx's captureRef
// call and preview scaling don't need to change).
export const SHARE_CARD_WIDTH = POSTER_WIDTH;
export const SHARE_CARD_HEIGHT = POSTER_HEIGHT;

export type NutritionShareCardProps = {
  title: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  backgroundUri?: string | null;
  textTheme?: 'light' | 'dark';
};

function textColor(alpha: number | undefined, theme: 'light' | 'dark' = 'light'): string {
  if (alpha === undefined || alpha === 1) {
    return theme === 'dark' ? '#14141A' : '#FFFFFF';
  }
  return theme === 'dark' ? `rgba(20,20,24,${alpha})` : `rgba(255,255,255,${alpha})`;
}

// Editorial poster, not a dashboard tile: the number is the design. A
// picked photo (or, without one, SharePosterCard's brand-tinted gradient)
// fills the whole frame; every stat sits directly on it, bottom-anchored,
// no boxes or grid dividers competing with the photo for attention.
export const NutritionShareCard = forwardRef<View, NutritionShareCardProps>(function NutritionShareCard(
  { title, kcal, protein, carbs, fat, backgroundUri, textTheme = 'light' },
  ref
) {
  const { t } = useT();
  return (
    <SharePosterCard ref={ref} accentColor={nutritionPalette.yellow} backgroundUri={backgroundUri} textTheme={textTheme}>
      <Text style={[styles.eyebrow, { color: textColor(0.75, textTheme) }, themeTextShadow(textTheme)]}>{title.toUpperCase()}</Text>
      <View style={styles.kcalRow}>
        <Text style={[styles.kcal, { color: textColor(undefined, textTheme) }, themeTextShadow(textTheme)]}>{Math.round(kcal)}</Text>
        <Text style={[styles.kcalUnit, { color: textColor(0.75, textTheme) }, themeTextShadow(textTheme)]}>{t('kcal').toUpperCase()}</Text>
      </View>
      <View style={styles.macroRow}>
        <Macro value={protein} label={t('protein').toUpperCase()} textTheme={textTheme} />
        <View style={styles.macroDivider} />
        <Macro value={carbs} label={t('carbs').toUpperCase()} textTheme={textTheme} />
        <View style={styles.macroDivider} />
        <Macro value={fat} label={t('fat').toUpperCase()} textTheme={textTheme} />
      </View>
    </SharePosterCard>
  );
});

function Macro({ value, label, textTheme = 'light' }: { value: number; label: string; textTheme?: 'light' | 'dark' }) {
  return (
    <View style={styles.macro}>
      <Text style={[styles.macroValue, { color: textColor(undefined, textTheme) }, themeTextShadow(textTheme)]}>
        {Math.round(value)}<Text style={[styles.macroUnit, { color: textColor(0.75, textTheme) }, themeTextShadow(textTheme)]}>G</Text>
      </Text>
      <Text style={[styles.macroLabel, { color: textColor(0.68, textTheme) }, themeTextShadow(textTheme)]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: Fonts.technicalBold,
    fontSize: 40,
    letterSpacing: 4,
  },
  kcalRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 18,
  },
  kcal: {
    fontFamily: Fonts.metric,
    fontSize: 220,
    lineHeight: 212,
    fontVariant: ['tabular-nums'],
  },
  kcalUnit: {
    fontFamily: Fonts.technicalBold,
    fontSize: 42,
    letterSpacing: 1,
    marginBottom: 30,
  },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
  },
  macroDivider: {
    width: 1,
    height: 56,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: 38,
  },
  macro: {
    gap: 8,
  },
  macroValue: {
    fontFamily: Fonts.metric,
    fontSize: 56,
    fontVariant: ['tabular-nums'],
  },
  macroUnit: {
    fontFamily: Fonts.technicalBold,
    fontSize: 26,
  },
  macroLabel: {
    fontFamily: Fonts.technicalBold,
    fontSize: 22,
    letterSpacing: 1.6,
  },
});

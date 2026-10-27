import { forwardRef } from 'react';
import { Text, View } from 'react-native';

import { nutritionPalette } from '@/components/nutrition-ui';
import { POSTER_WIDTH, SharePosterCard, themeTextShadow } from '@/components/share-poster-card';
import { Fonts } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { softSheet } from '@/constants/soft-sheet';

// Same fixed poster canvas as the summary card (nutrition-share-card.tsx) —
// kept under the old name so nutrition/share.tsx's preview scaling doesn't
// need a second constant. Height is also the same fixed POSTER_HEIGHT, so
// both share modes keep the same Instagram Story (9:16) shape.
export const SHARE_CARD_WIDTH = POSTER_WIDTH;

export type NutritionShareCardDetailedMeal = {
  label: string;
  items: { name: string; amountGrams: number; kcal: number }[];
};

export type NutritionShareCardDetailedProps = {
  title: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  meals: NutritionShareCardDetailedMeal[];
  backgroundUri?: string | null;
  textTheme?: 'light' | 'dark';
};

function textColor(alpha: number | undefined, theme: 'light' | 'dark' = 'light'): string {
  if (alpha === undefined || alpha === 1) {
    return theme === 'dark' ? '#14141A' : '#FFFFFF';
  }
  return theme === 'dark' ? `rgba(20,20,24,${alpha})` : `rgba(255,255,255,${alpha})`;
}

export const NutritionShareCardDetailed = forwardRef<View, NutritionShareCardDetailedProps>(
  function NutritionShareCardDetailed({ title, kcal, protein, carbs, fat, meals, backgroundUri, textTheme = 'light' }, ref) {
    const { t } = useT();
    return (
      <SharePosterCard ref={ref} accentColor={nutritionPalette.yellow} backgroundUri={backgroundUri} contentAlign="start" textTheme={textTheme}>
        <Text style={[styles.eyebrow, { color: textColor(0.75, textTheme) }, themeTextShadow(textTheme)]}>{title.toUpperCase()}</Text>
        <View style={styles.totalsRow}>
          <Text style={[styles.kcal, { color: textColor(undefined, textTheme) }, themeTextShadow(textTheme)]}>{Math.round(kcal)}</Text>
          <Text style={[styles.kcalUnit, { color: textColor(0.75, textTheme) }, themeTextShadow(textTheme)]}>{t('kcal').toUpperCase()}</Text>
        </View>
        <Text style={[styles.macroInline, { color: textColor(0.6, textTheme) }, themeTextShadow(textTheme)]}>
          {Math.round(protein)}G {t('protein').toUpperCase()} · {Math.round(carbs)}G {t('carbs').toUpperCase()} · {Math.round(fat)}G {t('fat').toUpperCase()}
        </Text>

        <View style={styles.mealList}>
          {meals.map((meal) => (
            <View key={meal.label} style={styles.mealBlock}>
              <Text style={[styles.mealLabel, { color: textColor(0.55, textTheme) }, themeTextShadow(textTheme)]}>{meal.label.toUpperCase()}</Text>
              {meal.items.map((item, index) => (
                <View key={`${item.name}-${index}`} style={styles.itemRow}>
                  <Text style={[styles.itemName, { color: textColor(undefined, textTheme) }, themeTextShadow(textTheme)]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.itemMeta, { color: textColor(0.6, textTheme) }, themeTextShadow(textTheme)]}>{Math.round(item.kcal)} {t('kcal').toUpperCase()}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        <Text style={[styles.footer, { color: textColor(0.5, textTheme) }, themeTextShadow(textTheme)]}>{t('trackedWithCompos').toUpperCase()}</Text>
      </SharePosterCard>
    );
  }
);

const styles = softSheet({
  eyebrow: {
    fontFamily: Fonts.technicalBold,
    fontSize: 32,
    letterSpacing: 4,
  },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 16,
    marginTop: 8,
  },
  kcal: {
    fontFamily: Fonts.metric,
    fontSize: 108,
    lineHeight: 104,
    fontVariant: ['tabular-nums'],
  },
  kcalUnit: {
    fontFamily: Fonts.technicalBold,
    fontSize: 30,
    marginBottom: 14,
  },
  macroInline: {
    fontFamily: Fonts.technicalBold,
    fontSize: 22,
    letterSpacing: 0.6,
    marginBottom: 16,
    width: '100%',
  },
  mealList: {
    marginTop: 36,
    gap: 30,
  },
  mealBlock: {
    gap: 12,
  },
  // Deliberately not the yellow accent — meal names are a sub-heading
  // under the card's real headline (the kcal number), consistent with
  // the same muted treatment on day-share's meal columns.
  mealLabel: {
    fontFamily: Fonts.technicalBold,
    fontSize: 22,
    letterSpacing: 2,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingBottom: 12,
  },
  itemName: {
    flex: 1,
    fontFamily: Fonts.metricMedium,
    fontSize: 26,
  },
  itemMeta: {
    fontFamily: Fonts.technicalBold,
    fontSize: 20,
  },
  footer: {
    fontFamily: Fonts.technicalBold,
    fontSize: 18,
    letterSpacing: 2,
    marginTop: 40,
  },
});

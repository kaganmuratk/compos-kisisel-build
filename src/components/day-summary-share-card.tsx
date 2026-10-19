import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { nutritionPalette } from '@/components/nutrition-ui';
import { POSTER_HEIGHT, POSTER_WIDTH, SharePosterCard, themeTextShadow } from '@/components/share-poster-card';
import { Fonts } from '@/constants/theme';

// Fixed 9:16 (Instagram Story) aspect ratio matching SharePosterCard's fixed
// 1080x1920 poster canvas — same convention as nutrition share cards.
export const SHARE_CARD_WIDTH = POSTER_WIDTH;
export const SHARE_CARD_HEIGHT = POSTER_HEIGHT;

export type DaySummaryMealColumn = { label: string; items: string[] };

export type DaySummaryBlock = {
  title: string;
  summary: string;
  details?: string[];
  /** Nutrition-only: renders as side-by-side per-meal columns instead of
   * `details`' flat stacked lines — a single run-on "Kahvaltı: Yumurta
   * (80g), Tavuk (150g), …" line reads as clutter once there are more than
   * a couple of items; a column per meal keeps each food on its own line
   * without the block growing arbitrarily tall. */
  mealColumns?: DaySummaryMealColumn[];
};

export type DaySummaryShareCardProps = {
  dateLabel: string;
  blocks: DaySummaryBlock[];
  backgroundUri?: string | null;
  textTheme?: 'light' | 'dark';
};

function textColor(alpha: number | undefined, theme: 'light' | 'dark' = 'light'): string {
  if (alpha === undefined || alpha === 1) {
    return theme === 'dark' ? '#14141A' : '#FFFFFF';
  }
  return theme === 'dark' ? `rgba(20,20,24,${alpha})` : `rgba(255,255,255,${alpha})`;
}

// Full-bleed editorial poster for day summaries — replaces the old 320x568
// dashboard-box look with SharePosterCard's full-canvas layout. A picked
// photo (or fallback brand-tinted gradient) fills the frame, with dateLabel
// and labeled blocks flowing top-to-bottom.
export const DaySummaryShareCard = forwardRef<View, DaySummaryShareCardProps>(function DaySummaryShareCard(
  { dateLabel, blocks, backgroundUri, textTheme = 'light' },
  ref
) {
  return (
    <SharePosterCard
      ref={ref}
      accentColor={nutritionPalette.yellow}
      backgroundUri={backgroundUri}
      contentAlign="start"
      textTheme={textTheme}
    >
      <Text style={[styles.dateLabel, { color: textColor(0.75, textTheme) }, themeTextShadow(textTheme)]}>{dateLabel.toUpperCase()}</Text>

      <View style={styles.blockList}>
        {blocks.map((block) => (
          <View key={block.title} style={styles.block}>
            <Text style={[styles.blockTitle, themeTextShadow(textTheme)]}>{block.title.toUpperCase()}</Text>
            <Text style={[styles.blockSummary, { color: textColor(undefined, textTheme) }, themeTextShadow(textTheme)]}>{block.summary}</Text>
            {block.mealColumns && block.mealColumns.length > 0 ? (
              <View style={styles.mealColumns}>
                {block.mealColumns.map((column) => (
                  <View key={column.label} style={styles.mealColumn}>
                    <Text style={[styles.mealColumnLabel, { color: textColor(0.55, textTheme) }, themeTextShadow(textTheme)]}>
                      {column.label.toUpperCase()}
                    </Text>
                    {column.items.map((item, index) => (
                      <Text
                        key={index}
                        style={[styles.mealColumnItem, { color: textColor(0.7, textTheme) }, themeTextShadow(textTheme)]}
                        numberOfLines={1}
                      >
                        {item}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            ) : (
              block.details &&
              block.details.length > 0 && (
                <View style={styles.blockDetails}>
                  {block.details.map((line, index) => (
                    <Text key={index} style={[styles.blockDetail, { color: textColor(0.6, textTheme) }, themeTextShadow(textTheme)]}>
                      {line}
                    </Text>
                  ))}
                </View>
              )
            )}
          </View>
        ))}
      </View>
    </SharePosterCard>
  );
});

const styles = StyleSheet.create({
  dateLabel: {
    fontFamily: Fonts.technicalBold,
    fontSize: 32,
    letterSpacing: 4,
  },
  blockList: {
    marginTop: 36,
    gap: 32,
  },
  block: {
    gap: 8,
  },
  blockTitle: {
    color: nutritionPalette.yellow,
    fontFamily: Fonts.technicalBold,
    fontSize: 22,
    letterSpacing: 2,
  },
  blockSummary: {
    fontFamily: Fonts.semiBold,
    fontSize: 34,
    lineHeight: 42,
  },
  blockDetails: {
    gap: 6,
    marginTop: 4,
  },
  blockDetail: {
    fontFamily: Fonts.medium,
    fontSize: 22,
    lineHeight: 30,
  },
  mealColumns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    rowGap: 20,
    columnGap: 24,
  },
  mealColumn: {
    flexBasis: '46%',
    flexGrow: 1,
    gap: 6,
  },
  // Deliberately NOT nutritionPalette.yellow — that's reserved for the
  // block title (BESLENME) above it, so the meal name reads as a lower-
  // level sub-heading rather than competing with it at the same weight.
  mealColumnLabel: {
    fontFamily: Fonts.technicalBold,
    fontSize: 16,
    letterSpacing: 1.4,
  },
  mealColumnItem: {
    fontFamily: Fonts.medium,
    fontSize: 19,
    lineHeight: 25,
  },
});

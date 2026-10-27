import { forwardRef } from 'react';
import { Text, View } from 'react-native';

import { nutritionPalette } from '@/components/nutrition-ui';
import { POSTER_WIDTH, SharePosterCard, themeTextShadow } from '@/components/share-poster-card';
import { Fonts } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { softSheet } from '@/constants/soft-sheet';

// Same fixed poster canvas as the summary card (workout-share-card.tsx) —
// kept under the old name so workout/share/[sessionId].tsx's preview
// scaling doesn't need a second constant.
export const SHARE_CARD_WIDTH = POSTER_WIDTH;

export type WorkoutShareCardDetailedExercise = {
  name: string;
  setLabels: string[];
};

export type WorkoutShareCardDetailedProps = {
  title: string;
  durationLabel: string;
  totalSets: number;
  exercises: WorkoutShareCardDetailedExercise[];
  backgroundUri?: string | null;
  textTheme?: 'light' | 'dark';
};

function textColor(alpha: number | undefined, theme: 'light' | 'dark' = 'light'): string {
  if (alpha === undefined || alpha === 1) {
    return theme === 'dark' ? '#14141A' : '#FFFFFF';
  }
  return theme === 'dark' ? `rgba(20,20,24,${alpha})` : `rgba(255,255,255,${alpha})`;
}

export const WorkoutShareCardDetailed = forwardRef<View, WorkoutShareCardDetailedProps>(
  function WorkoutShareCardDetailed({ title, durationLabel, totalSets, exercises, backgroundUri, textTheme = 'light' }, ref) {
    const { t } = useT();
    return (
      <SharePosterCard ref={ref} accentColor={nutritionPalette.blue} backgroundUri={backgroundUri} contentAlign="start" textTheme={textTheme}>
        <Text style={[styles.eyebrow, { color: textColor(0.75, textTheme) }, themeTextShadow(textTheme)]}>{title.toUpperCase()}</Text>
        <View style={styles.totalsRow}>
          <Text style={[styles.setCount, { color: textColor(undefined, textTheme) }, themeTextShadow(textTheme)]}>{totalSets}</Text>
          <Text style={[styles.setCountUnit, { color: textColor(0.75, textTheme) }, themeTextShadow(textTheme)]}>{t('setsLogged').toUpperCase()}</Text>
        </View>
        <Text style={[styles.metaInline, { color: textColor(0.6, textTheme) }, themeTextShadow(textTheme)]}>
          {durationLabel.toUpperCase()} · {exercises.length} {t('workout').toUpperCase()}
        </Text>

        <View style={styles.exerciseList}>
          {exercises.map((exercise, index) => (
            <View key={`${exercise.name}-${index}`} style={styles.exerciseBlock}>
              <Text style={[styles.exerciseLabel, { color: textColor(0.55, textTheme) }, themeTextShadow(textTheme)]}>{exercise.name.toUpperCase()}</Text>
              {exercise.setLabels.map((label, setIndex) => (
                <Text key={setIndex} style={[styles.setLine, { color: textColor(undefined, textTheme) }, themeTextShadow(textTheme)]} numberOfLines={1}>
                  {label}
                </Text>
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
  setCount: {
    fontFamily: Fonts.metric,
    fontSize: 108,
    lineHeight: 104,
    fontVariant: ['tabular-nums'],
  },
  setCountUnit: {
    fontFamily: Fonts.technicalBold,
    fontSize: 30,
    marginBottom: 14,
  },
  metaInline: {
    fontFamily: Fonts.technicalBold,
    fontSize: 22,
    letterSpacing: 0.6,
    marginBottom: 16,
    width: '100%',
  },
  exerciseList: {
    marginTop: 36,
    gap: 28,
  },
  exerciseBlock: {
    gap: 10,
  },
  exerciseLabel: {
    fontFamily: Fonts.technicalBold,
    fontSize: 22,
    letterSpacing: 2,
  },
  setLine: {
    fontFamily: Fonts.metricMedium,
    fontSize: 22,
  },
  footer: {
    fontFamily: Fonts.technicalBold,
    fontSize: 18,
    letterSpacing: 2,
    marginTop: 40,
  },
});

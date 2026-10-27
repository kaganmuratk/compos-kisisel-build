import { forwardRef } from 'react';
import { Text, View } from 'react-native';

import { nutritionPalette } from '@/components/nutrition-ui';
import { POSTER_HEIGHT, POSTER_WIDTH, SharePosterCard, themeTextShadow } from '@/components/share-poster-card';
import { Fonts } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { softSheet } from '@/constants/soft-sheet';

// Full-bleed export size — matches SharePosterCard's fixed poster canvas,
// same migration as nutrition-share-card.tsx: the old bordered dashboard
// card (Colors.dark.backgroundElement box, fixed 320x568) is replaced by
// the shared photo/gradient poster shell so this card gets the same
// background-photo + light/dark text support as Nutrition and Day share.
export const SHARE_CARD_WIDTH = POSTER_WIDTH;
export const SHARE_CARD_HEIGHT = POSTER_HEIGHT;

export type WorkoutShareCardProps = {
  title: string;
  durationLabel: string;
  exerciseNames: string[];
  totalSets: number;
  backgroundUri?: string | null;
  textTheme?: 'light' | 'dark';
};

function textColor(alpha: number | undefined, theme: 'light' | 'dark' = 'light'): string {
  if (alpha === undefined || alpha === 1) {
    return theme === 'dark' ? '#14141A' : '#FFFFFF';
  }
  return theme === 'dark' ? `rgba(20,20,24,${alpha})` : `rgba(255,255,255,${alpha})`;
}

export const WorkoutShareCard = forwardRef<View, WorkoutShareCardProps>(function WorkoutShareCard(
  { title, durationLabel, exerciseNames, totalSets, backgroundUri, textTheme = 'light' },
  ref
) {
  const { t } = useT();
  return (
    <SharePosterCard ref={ref} accentColor={nutritionPalette.blue} backgroundUri={backgroundUri} textTheme={textTheme}>
      <Text style={[styles.eyebrow, { color: textColor(0.75, textTheme) }, themeTextShadow(textTheme)]}>{title.toUpperCase()}</Text>
      <View style={styles.statsRow}>
        <Stat value={String(totalSets)} label={t('setsLogged').toUpperCase()} textTheme={textTheme} />
        <View style={styles.statsDivider} />
        <Stat value={String(exerciseNames.length)} label={t('workout').toUpperCase()} textTheme={textTheme} />
        <View style={styles.statsDivider} />
        <Stat value={durationLabel} label={t('duration').toUpperCase()} textTheme={textTheme} />
      </View>
      <View style={styles.exerciseList}>
        {exerciseNames.map((name, index) => (
          <Text key={`${name}-${index}`} style={[styles.exerciseName, { color: textColor(undefined, textTheme) }, themeTextShadow(textTheme)]} numberOfLines={1}>
            {name}
          </Text>
        ))}
      </View>
    </SharePosterCard>
  );
});

function Stat({ value, label, textTheme = 'light' }: { value: string; label: string; textTheme?: 'light' | 'dark' }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: textColor(undefined, textTheme) }, themeTextShadow(textTheme)]}>{value}</Text>
      <Text style={[styles.statLabel, { color: textColor(0.68, textTheme) }, themeTextShadow(textTheme)]}>{label}</Text>
    </View>
  );
}

const styles = softSheet({
  eyebrow: {
    fontFamily: Fonts.technicalBold,
    fontSize: 40,
    letterSpacing: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
  },
  statsDivider: {
    width: 1,
    height: 44,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: 30,
  },
  stat: {
    gap: 8,
  },
  statValue: {
    fontFamily: Fonts.metric,
    fontSize: 44,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontFamily: Fonts.technicalBold,
    fontSize: 20,
    letterSpacing: 1.4,
  },
  exerciseList: {
    marginTop: 32,
    gap: 10,
  },
  exerciseName: {
    fontFamily: Fonts.metricMedium,
    fontSize: 28,
  },
});

import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PaletteText as ThemedText, useNutritionPalette } from '@/components/nutrition-ui';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useExercise, useRecentExerciseSets } from '@/db/queries/exercises';
import { useSettings } from '@/db/queries/settings';
import { formatShortDate } from '@/lib/date';
import { useT } from '@/lib/i18n';
import { fromKg } from '@/lib/units';
import { softSheet } from '@/constants/soft-sheet';

export default function ExerciseHistoryModal() {
  const { t } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { exerciseId, exerciseName, sessionId } = useLocalSearchParams<{
    exerciseId: string;
    exerciseName: string;
    sessionId?: string;
  }>();
  const id = exerciseId;
  const { data: sets = [] } = useRecentExerciseSets(id, sessionId, 5);
  const { data: exercise } = useExercise(id);
  const { data: settings } = useSettings();
  const unit = settings?.unit ?? 'kg';
  const repMetric = settings?.repMetric ?? 'rir';
  const [expandedSetIds, setExpandedSetIds] = useState<Set<string>>(new Set());

  const toggleNotes = (setId: string) => {
    setExpandedSetIds((prev) => {
      const next = new Set(prev);
      if (next.has(setId)) {
        next.delete(setId);
      } else {
        next.add(setId);
      }
      return next;
    });
  };

  return (
    <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>{exerciseName}</ThemedText>
          <ThemedText style={styles.subtitle}>{t('last').toUpperCase()} {sets.length} {t('setsLabel').toUpperCase()}</ThemedText>
        </View>

        <View style={styles.card}>
          {sets.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('noPreviousSetsForExercise').toUpperCase()}
            </ThemedText>
          ) : (
            sets.map((set) => {
              const repValue = repMetric === 'rir' ? set.rir : set.rpe;
              const hasNotes = !!(set.setNotes || set.exerciseNotes || set.sessionNotes);
              const notesShown = expandedSetIds.has(set.setId);
              return (
                <View key={set.setId} style={styles.setEntry}>
                  <View style={styles.row}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.dateColumn}>
                      {formatShortDate(set.date)}
                    </ThemedText>
                    <ThemedText type="small" style={styles.setValue}>
                      <ThemedText type="smallBold" style={{ color: palette.muted }}>
                        {t('set').toUpperCase()} {set.setNumber}
                        {set.side ? ` · ${set.side.toUpperCase()}` : ''}
                      </ThemedText>
                      {'  '}
                      {exercise?.weightMode === 'pin'
                        ? `${set.weight ?? '–'} PIN`
                        : `${set.weight != null ? fromKg(set.weight, unit) : '–'} ${unit}`}{' '}
                      × {set.reps ?? '–'}
                      {repValue != null ? ` · ${repMetric.toUpperCase()} ${repValue}` : ''}
                    </ThemedText>
                    {hasNotes && (
                      <Pressable accessibilityLabel={t('showNotes')} onPress={() => toggleNotes(set.setId)} hitSlop={8}>
                        <ThemedText style={[styles.noteSymbol, { color: notesShown ? palette.blue : palette.muted }]}>{t('note').toUpperCase()}</ThemedText>
                      </Pressable>
                    )}
                  </View>
                  {notesShown && (
                    <>
                      {set.setNotes && (
                        <ThemedText type="small" themeColor="textSecondary" style={styles.noteLine}>
                          {t('setNote').toUpperCase()}: {set.setNotes}
                        </ThemedText>
                      )}
                      {set.exerciseNotes && (
                        <ThemedText type="small" themeColor="textSecondary" style={styles.noteLine}>
                          {t('exerciseNote').toUpperCase()}: {set.exerciseNotes}
                        </ThemedText>
                      )}
                      {set.sessionNotes && (
                        <ThemedText type="small" themeColor="textSecondary" style={styles.noteLine}>
                          {t('sessionNote').toUpperCase()}: {set.sessionNotes}
                        </ThemedText>
                      )}
                    </>
                  )}
                </View>
              );
            })
          )}
        </View>

        <Pressable accessibilityLabel={t('close')} onPress={() => router.back()} style={styles.closeButton}>
          <ThemedText style={[styles.closeText, { color: palette.blue }]}>{t('close').toUpperCase()}</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => softSheet({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.one,
  },
  title: {
    fontFamily: Fonts.technical,
    fontSize: 24,
    lineHeight: 30,
  },
  subtitle: {
    color: palette.muted,
    fontFamily: Fonts.technical,
    fontSize: 11,
    letterSpacing: 0.7,
  },
  card: {
    backgroundColor: palette.card,
    borderColor: palette.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.four,
  },
  setEntry: {
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderBottomColor: palette.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dateColumn: {
    width: 64,
    color: palette.muted,
    fontFamily: Fonts.technical,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  setValue: {
    flex: 1,
    fontFamily: Fonts.technical,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  noteLine: {
    paddingLeft: 64 + Spacing.two,
    color: palette.muted,
  },
  closeButton: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  closeText: {
    textAlign: 'center',
    fontFamily: Fonts.technical,
    fontSize: 12,
    letterSpacing: 0.7,
  },
  noteSymbol: { fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.5 },
});

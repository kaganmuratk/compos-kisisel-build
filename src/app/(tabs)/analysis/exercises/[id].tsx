import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { getExerciseCategoryColor, SetRow } from '@/components/set-row';
import { PaletteText as ThemedText, useNutritionPalette } from '@/components/nutrition-ui';
import { ThemedView } from '@/components/themed-view';
import { TimeSeriesChart } from '@/components/time-series-chart';
import { Fonts, Spacing } from '@/constants/theme';
import { useCheckinHistory } from '@/db/queries/daily';
import {
  useAddHistoricalSet,
  useExercise,
  useExerciseHistory,
  useUpdateExercise,
  useUpdateExerciseImage,
  useUpdateHistoricalSet,
} from '@/db/queries/exercises';
import { useSettings } from '@/db/queries/settings';
import { alertMessage } from '@/lib/alert';
import { formatDayMonth as formatDate, formatShortDate } from '@/lib/date';
import { persistPickedAsset } from '@/lib/media';
import { estimatedOneRepMax, nearestBodyweightKg } from '@/lib/strength';
import { fromKg } from '@/lib/units';
import { getExerciseCategoryLabel } from '@/lib/exercise-category';
import { useT } from '@/lib/i18n';
import { TextInput } from '@/components/text-input';
import { BackButton } from '@/components/screen-header';

type AppTheme = { text: string; textSecondary: string; backgroundElement: string; border: string; accent: string; accentOn: string };

export default function ExerciseDetailScreen() {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const exerciseId = id;
  const { data: exercise } = useExercise(exerciseId);
  const { data: history = [] } = useExerciseHistory(exerciseId);
  const { data: checkins = [] } = useCheckinHistory();
  const { data: settings } = useSettings();
  const { t, language } = useT();
  const unit = settings?.unit ?? 'kg';
  const repMetric = settings?.repMetric ?? 'rir';
  const updateImage = useUpdateExerciseImage();
  const updateExercise = useUpdateExercise();
  const updateSet = useUpdateHistoricalSet(exerciseId);
  const addSet = useAddHistoricalSet(exerciseId);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(exercise?.name ?? '');

  useEffect(() => {
    setNameValue(exercise?.name ?? '');
  }, [exercise?.name]);

  const pickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        // Used to silently return here — see the same fix in lib/media.ts's
        // pickMedia() for why that read as the button doing nothing at all.
        throw new Error(
          permission.canAskAgain
            ? 'Galeri izni verilmedi.'
            : 'Galeri izni reddedilmiş. Telefon Ayarları → Uygulamalar → Compos → İzinler üzerinden açman gerekiyor.'
        );
      }
      // legacy: true — see the comment in lib/media.ts's pickMedia() for why
      // (Google's new Photo Picker silently loses the result on MIUI).
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, legacy: true });
      if (!result.canceled && result.assets[0]) {
        const imageUri = await persistPickedAsset(result.assets[0].uri);
        await updateImage.mutateAsync({ id: exerciseId, imageUri });
      }
    } catch (error) {
      alertMessage('Eklenemedi', error instanceof Error ? error.message : String(error));
    }
  };

  if (!exercise) {
    return null;
  }
  const theme: AppTheme = { text: palette.text, textSecondary: palette.muted, backgroundElement: palette.card, border: palette.border, accent: palette.blue, accentOn: palette.background };
  // Same category-color-coded card the workout/recap screens use for every
  // exercise card — this screen shows the reverse view (one exercise, many
  // days) so it reuses that same look per session-date card instead of a
  // plain, uncolored one.
  const accentColor = getExerciseCategoryColor(exercise.category);

  const saveName = () => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== exercise.name) {
      updateExercise.mutate({ id: exerciseId, name: trimmed });
    } else {
      setNameValue(exercise.name);
    }
    setEditingName(false);
  };

  const sessions = history.reduce<{ sessionId: string; date: string; sets: typeof history }[]>((groups, row) => {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.sessionId === row.sessionId) {
      lastGroup.sets.push(row);
    } else {
      groups.push({ sessionId: row.sessionId, date: row.date, sets: [row] });
    }
    return groups;
  }, []);

  // Estimated 1RM (Epley, RIR-adjusted) per session's best set — for
  // bodyweight-flagged exercises the "weight" is the closest logged
  // bodyweight check-in plus whatever added weight was entered.
  // A pin/notch count isn't a real weight, so estimated 1RM doesn't apply.
  // Some sessions logged this exercise split by hand (sağ el/sol el) and
  // others didn't — an unsplit set counts toward both sides, so a day
  // without a split still contributes a data point to each hand's line.
  const buildChartData = (sideFilter?: 'left' | 'right') =>
    sessions
      .map((session) => {
        const relevantSets = sideFilter
          ? session.sets.filter((s) => s.side == null || s.side === sideFilter)
          : session.sets;
        const e1rms = relevantSets
          .filter((s) => s.reps != null)
          .map((s) => {
            const addedWeight = s.weight ?? 0;
            const totalWeight = exercise.isBodyweight
              ? (nearestBodyweightKg(checkins, session.date) ?? 0) + addedWeight
              : addedWeight;
            const rir = repMetric === 'rir' ? (s.rir ?? 0) : s.rpe != null ? 10 - s.rpe : 0;
            return estimatedOneRepMax(totalWeight, s.reps!, rir);
          });
        return e1rms.length > 0
          ? { value: fromKg(Math.max(...e1rms), unit), label: formatDate(session.date), dateKey: session.date }
          : null;
      })
      .filter((point): point is { value: number; label: string; dateKey: string } => point !== null);

  // Pin/notch count isn't a real kg weight, so calling this "estimated 1RM"
  // would be dimensionally meaningless — but running the same reps/RIR-
  // adjusted Epley formula against the pin number still gives a consistent,
  // comparable trend score (a set at a higher pin with more reps at a lower
  // RIR should score higher than a lower pin/fewer reps set, same as it does
  // for real weight), so it reuses buildChartData rather than just plotting
  // the raw max pin number (which would ignore reps/RIR entirely).
  const buildPinChartData = () =>
    sessions
      .map((session) => {
        const scores = session.sets
          .filter((s) => s.weight != null && s.reps != null)
          .map((s) => {
            const rir = repMetric === 'rir' ? (s.rir ?? 0) : s.rpe != null ? 10 - s.rpe : 0;
            return estimatedOneRepMax(s.weight!, s.reps!, rir);
          });
        return scores.length > 0
          ? { value: Math.max(...scores), label: formatDate(session.date), dateKey: session.date }
          : null;
      })
      .filter((point): point is { value: number; label: string; dateKey: string } => point !== null);

  const hasUnilateralData = exercise.weightMode !== 'pin' && history.some((row) => row.side != null);
  const chartData = exercise.weightMode === 'pin' ? [] : buildChartData(hasUnilateralData ? 'right' : undefined);
  const leftChartData = hasUnilateralData ? buildChartData('left') : [];
  const pinChartData = exercise.weightMode === 'pin' ? buildPinChartData() : [];

  return (
    <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <BackButton color={theme.accent} onPress={() => router.dismissTo('/analysis/exercises')} />
            <Pressable
              accessibilityLabel="Hareket görseli ekle"
              onPress={pickImage}
              style={[styles.thumbnail, { backgroundColor: theme.backgroundElement }]}>
              {exercise.imageUri ? (
                <Image source={{ uri: exercise.imageUri }} style={styles.thumbnailImage} />
              ) : (
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  <Rect x={3} y={4} width={18} height={16} rx={2} stroke={theme.textSecondary} strokeWidth={1.8} />
                  <Circle cx={8} cy={9} r={1.5} stroke={theme.textSecondary} strokeWidth={1.8} />
                  <Path d="m5 18 5-5 3 3 2-2 4 4" stroke={theme.textSecondary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              )}
            </Pressable>
            <View style={styles.headerText}>
              {editingName ? (
                <TextInput
                  value={nameValue}
                  onChangeText={setNameValue}
                  onEndEditing={saveName}
                  onBlur={saveName}
                  autoFocus
                  style={[styles.titleInput, { color: theme.text, borderColor: theme.border }]}
                />
              ) : (
                <Pressable onPress={() => setEditingName(true)} hitSlop={4}>
                  <ThemedText type="title">{exercise.name}</ThemedText>
                </Pressable>
              )}
              <ThemedText themeColor="textSecondary" type="small">
                {getExerciseCategoryLabel(exercise.category, language)}
              </ThemedText>
            </View>
          </View>
          <View style={styles.recordStrip}><View style={styles.recordItem}><ThemedText style={styles.recordValue}>{sessions.length}</ThemedText><ThemedText style={styles.recordLabel}>{t('workouts').toUpperCase()}</ThemedText></View><View style={styles.recordItem}><ThemedText style={styles.recordValue}>{history.length}</ThemedText><ThemedText style={styles.recordLabel}>{t('setsLogged').toUpperCase()}</ThemedText></View><View style={styles.recordItem}><ThemedText style={styles.recordValue}>{exercise.weightMode === 'pin' ? (pinChartData.length ? Math.max(...pinChartData.map((point) => point.value)).toFixed(1) : '—') : (chartData.length ? Math.max(...chartData.map((point) => point.value)).toFixed(1) : '—')}</ThemedText><ThemedText style={styles.recordLabel}>{(exercise.weightMode === 'pin' ? t('bestPinScore') : t('bestEstimatedOneRm')).toUpperCase()}</ThemedText></View></View>

          {sessions.length === 0 ? (
            <View style={styles.emptyState}>
              <ThemedText themeColor="textSecondary" type="small">
                {t('noWorkoutLogsYet').toUpperCase()}
              </ThemedText>
            </View>
          ) : (
            <>
              {exercise.weightMode === 'pin' ? (
                // A pin/notch count isn't a real weight, so the Epley-based
                // estimated 1RM formula doesn't apply — chart the highest
                // pin/notch level actually logged per session instead.
                <OneRepMaxChart
                  title={t('pinLevelTrend').toUpperCase()}
                  data={pinChartData}
                  theme={theme}
                  unit="PIN"
                  notEnoughDataLabel={t('twoWorkoutsNeededForChart').toUpperCase()}
                />
              ) : (
                <>
                  <OneRepMaxChart
                    title={hasUnilateralData ? `${t('estOneRm').toUpperCase()} · ${t('sideRight').toUpperCase()}` : t('estOneRm').toUpperCase()}
                    data={chartData}
                    theme={theme}
                    unit={unit}
                    notEnoughDataLabel={t('twoWorkoutsNeededForChart').toUpperCase()}
                  />
                  {hasUnilateralData && (
                    <OneRepMaxChart
                      title={`${t('estOneRm').toUpperCase()} · ${t('sideLeft').toUpperCase()}`}
                      data={leftChartData}
                      theme={theme}
                      unit={unit}
                      notEnoughDataLabel={t('twoWorkoutsNeededForChart').toUpperCase()}
                    />
                  )}
                </>
              )}

              <View style={styles.historyList}>
                {[...sessions].reverse().map((session) => (
                  <View
                    key={session.sessionId}
                    style={[styles.card, { borderLeftColor: accentColor }]}>
                    <ThemedText style={styles.sessionDate}>{formatDate(session.date).toUpperCase()}</ThemedText>
                    <View style={styles.setHeaderRow}>
                      <ThemedText style={[styles.setNumberColumn, styles.tableLabel]}>{t('set').toUpperCase()}</ThemedText>
                      <ThemedText style={[styles.metricsHeader, styles.tableLabel]}>{t('metrics').toUpperCase()}</ThemedText>
                      <ThemedText style={[styles.effortHeader, styles.tableLabel]}>{t('effort').toUpperCase()}</ThemedText>
                    </View>
                    {session.sets.map((set) => (
                      <SetRow
                        key={set.setId}
                        set={{ id: set.setId, setNumber: set.setNumber, weight: set.weight, reps: set.reps, rir: set.rir, rpe: set.rpe, notes: set.notes }}
                        unit={unit}
                        repMetric={repMetric}
                        weightMode={exercise.weightMode}
                        variant="workout"
                        showSetTools={false}
                        accentColor={accentColor}
                        annotationColorOverride={accentColor}
                        onUpdate={(values) => updateSet.mutate({ id: set.setId, ...values })}
                      />
                    ))}
                    <Pressable
                      onPress={() => addSet.mutate(session.sets[0].exerciseLogId)}
                      style={styles.addSetButton}
                      hitSlop={8}>
                      <ThemedText type="small" style={{ color: theme.text }}>
                        {t('addSetLabel')}
                      </ThemedText>
                    </Pressable>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function OneRepMaxChart({
  title,
  data,
  theme,
  unit,
  notEnoughDataLabel,
}: {
  title: string;
  data: { value: number; label: string; dateKey?: string }[];
  theme: AppTheme;
  unit: string;
  notEnoughDataLabel: string;
}) {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  if (data.length < 2) {
    return (
      <View style={styles.card}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {notEnoughDataLabel}
        </ThemedText>
      </View>
    );
  }
  // Full history, not a period/range-limited window like the other analysis
  // charts — could be dozens of sessions, so only the first/middle/last
  // point get an axis label (same sparse labeling this screen always used)
  // instead of one per point.
  const labelIndexes = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);
  // Short month on the axis ("29 Eyl") — the full one ("29 Eylül") didn't
  // fit under a point and was truncated; the tooltip keeps the full label.
  const chartData = data.map((point, index) => ({ ...point, axisLabel: labelIndexes.has(index) ? (point.dateKey ? formatShortDate(point.dateKey) : point.label) : undefined }));
  return <TimeSeriesChart title={title} unit={unit} data={chartData} kind="oneRepMax" color={theme.accent} surfaceColor={theme.backgroundElement} borderColor={theme.border} />;
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  titleInput: {
    fontSize: 32,
    fontFamily: Fonts.semiBold,
    letterSpacing: -0.5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 2,
  },
  content: {
    gap: Spacing.four,
    paddingBottom: Spacing.six,
  },
  // Spacing.two — matches ScreenHeader's own back-button-to-content gap
  // (every other drill-down screen in the app); this screen's old
  // Spacing.three read as the back chevron sitting noticeably further
  // from the thumbnail/title than on any other screen.
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerText: {
    flex: 1,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  emptyState: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    padding: Spacing.four,
    alignItems: 'center',
  },
  // borderLeftColor set per-instance to the exercise's category color —
  // same treatment as the workout/recap screens' exercise cards.
  card: {
    width: '100%',
    minWidth: 0,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderLeftWidth: 3,
    padding: Spacing.three,
    gap: Spacing.two,
    overflow: 'hidden',
  },
  sessionDate: { color: palette.text, fontFamily: Fonts.technical, fontSize: 14, letterSpacing: 0.7 },
  setHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
    borderColor: palette.border,
  },
  tableLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 12, letterSpacing: 0.35 },
  setNumberColumn: { width: 32 },
  metricsHeader: { flex: 1 },
  effortHeader: { width: 64, textAlign: 'right' },
  historyList: {
    gap: Spacing.three,
  },
  recordStrip: { flexDirection: 'row', gap: Spacing.two, paddingVertical: Spacing.two, borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.border },
  // Equal columns whose labels wrap — sized to content, the three labels ran
  // into one another ("ANTRENMANLARKAYDEDILEN…") at larger text sizes.
  recordItem: { flex: 1, minWidth: 0 },
  recordValue: { color: palette.blue, fontFamily: Fonts.metric, fontSize: 28, lineHeight: 30 },
  recordLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 8, lineHeight: 12, letterSpacing: 0.5 },
  addSetButton: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
  },
});

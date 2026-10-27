import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { HeaderActionButton } from '@/components/header-action-button';
import { SwipeableRow } from '@/components/swipeable-row';
import { cardShadowFor, nutritionPaletteLight, useNutritionPalette } from '@/components/nutrition-ui';
import { ThemedText as AppThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TimeSeriesChart } from '@/components/time-series-chart';
import { Fonts, Spacing } from '@/constants/theme';
import { useDeleteCardioSession } from '@/db/queries/cardio';
import { useAddCoffeeForDate, useAddWater, useDeleteCoffeeForDate, useDeleteWaterForDate, useRemoveLastCoffeeForDate, useSaveCheckin } from '@/db/queries/daily';
import { useDeleteDay, useSaveDayNote } from '@/db/queries/day-notes';
import { useHistoryDay } from '@/db/queries/history-days';
import { useHealthMetricsDaily } from '@/db/queries/health-metrics';
import { useDeleteNutritionDay } from '@/db/queries/nutrition';
import { useSettings } from '@/db/queries/settings';
import { useSupplementCategories } from '@/db/queries/supplement-categories';
import { useAddSupplementLog, useRemoveSupplementLog, useSupplements } from '@/db/queries/supplements';
import { useDeleteSession } from '@/db/queries/workout';
import {
  useDailyHealthSummary,
  useDailySteps,
  useHealthConnectSleep,
  useHealthConnectWeight,
  useSleepHeartRateSeries,
} from '@/hooks/use-health-connect';
import { activityTypeUsesSpeed, getActivityTypeLabel, type ActivityType } from '@/lib/activity-type';
import { addMinutesToTime, formatClockTime, formatDayMonth, formatSleepDuration, sleepDurationHours } from '@/lib/date';
import { formatDuration, formatPace, formatSpeed, formatSwimPace } from '@/lib/geo';
import { fromKg, toKg } from '@/lib/units';
import { useT } from '@/lib/i18n';
import { TextInput } from '@/components/text-input';
import { BackButton } from '@/components/screen-header';
import { KEYBOARD_BAR_CLEARANCE } from '@/components/keyboard-done-bar';
import { softSheet } from '@/constants/soft-sheet';

const STRESS_LEVELS = Array.from({ length: 5 }, (_, i) => i + 1);
const DAY_NOTE_STANDARD_HEIGHT = 132;
function ThemedText({ style, themeColor, ...props }: ComponentProps<typeof AppThemedText>) {
  const palette = useNutritionPalette();
  const color = themeColor === 'textSecondary'
    ? palette.muted
    : themeColor === 'accent'
      ? palette.blue
      : themeColor === 'destructive'
        ? palette.red
        : palette.text;
  return <AppThemedText {...props} themeColor={themeColor} style={[{ color }, style]} />;
}
// Hand-drawn SVG icons rather than an icon font — Android PWA browsers can
// render an icon-font glyph as a tofu rectangle, see TabIcon's identical
// comment in (tabs)/_layout.tsx. barbell/restaurant/pulse/body reuse the
// exact same paths as Insights' InsightIcon (src/app/(tabs)/analysis/
// index.tsx) so the same section means the same shape everywhere.
function Ionicons({ name, size = 16, color }: { name: string; size?: number; color?: string }) {
  const palette = useNutritionPalette();
  const stroke = color ?? palette.muted;
  const common = { stroke, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'trash-outline':
      return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" {...common} /></Svg>;
    case 'share-outline':
      return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d="M12 16V4m0 0-4 4m4-4 4 4M5 14v5h14v-5" {...common} /></Svg>;
    case 'barbell-outline':
      return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Line x1={4} y1={9} x2={4} y2={15} {...common} /><Line x1={7} y1={7} x2={7} y2={17} {...common} /><Line x1={17} y1={7} x2={17} y2={17} {...common} /><Line x1={20} y1={9} x2={20} y2={15} {...common} /><Line x1={7} y1={12} x2={17} y2={12} {...common} /></Svg>;
    case 'restaurant-outline':
      return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M16 3v18M16 3c3 1 4 4 4 7h-4" {...common} /></Svg>;
    case 'pulse-outline':
      return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d="M3 13h4l2-6 4 11 2-5h6" {...common} /></Svg>;
    case 'body-outline':
      return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Circle cx={12} cy={6} r={3} {...common} /><Path d="M7 21v-4l2-5 3 2 3-2 2 5v4M9 12 7 9M15 12l2-3" {...common} /></Svg>;
    case 'footsteps-outline':
      return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d="M9 5a2.5 2.5 0 0 1 2.5 2.5c0 1.5-1 2-1 3.5s.5 2 .5 3.5A2.5 2.5 0 0 1 8.5 17 2.5 2.5 0 0 1 6 14.5c0-1.5.5-2 .5-3.5s-1-2-1-3.5A2.5 2.5 0 0 1 8 5Z" {...common} /><Path d="M16 9a2.5 2.5 0 0 1 2.5 2.5c0 1.5-1 2-1 3.5s.5 2 .5 3.5a2.5 2.5 0 0 1-2.5 2.5 2.5 2.5 0 0 1-2.5-2.5c0-1.5.5-2 .5-3.5s-1-2-1-3.5A2.5 2.5 0 0 1 15 9Z" {...common} /></Svg>;
    case 'medkit-outline':
      return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Rect x={3} y={8} width={18} height={11} rx={2} {...common} /><Path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M12 12v4M10 14h4" {...common} /></Svg>;
    case 'pencil-outline':
      return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d="m16.5 4.5 3 3-11 11-4 1 1-4 11-11Z" {...common} /></Svg>;
    case 'chevron-back':
      return <ThemedText style={{ color: stroke, fontFamily: Fonts.technical, fontSize: size, lineHeight: size + 2 }}>‹</ThemedText>;
    case 'chevron-forward':
      return <ThemedText style={{ color: stroke, fontFamily: Fonts.technical, fontSize: size, lineHeight: size + 2 }}>›</ThemedText>;
    case 'sync-outline':
      return <ThemedText style={{ color: stroke, fontFamily: Fonts.technical, fontSize: size, lineHeight: size + 2 }}>↻</ThemedText>;
    case 'checkmark':
      return <ThemedText style={{ color: stroke, fontFamily: Fonts.technical, fontSize: size, lineHeight: size + 2 }}>✓</ThemedText>;
    case 'remove':
      return <ThemedText style={{ color: stroke, fontFamily: Fonts.technical, fontSize: size, lineHeight: size + 2 }}>−</ThemedText>;
    case 'add':
      return <ThemedText style={{ color: stroke, fontFamily: Fonts.technical, fontSize: size, lineHeight: size + 2 }}>+</ThemedText>;
    default:
      return null;
  }
}
function SectionTitle({ children }: { children: string }) { const palette = useNutritionPalette(); const styles = useMemo(() => createStyles(palette), [palette]); return <ThemedText style={styles.groupTitle}>{children}</ThemedText>; }

export default function HistoryDayScreen() {
  const { t, language } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { date } = useLocalSearchParams<{ date: string }>();
  const theme = { text: palette.text, background: palette.background, backgroundElement: palette.card, backgroundSelected: palette.raised, textSecondary: palette.muted, border: palette.border, accent: palette.blue, accentOn: palette.background, destructive: palette.red };
  const cardShadow = cardShadowFor(palette);
  const day = useHistoryDay(date);
  const { data: steps } = useDailySteps(date);
  const { data: healthSleep } = useHealthConnectSleep(date);
  const { data: healthWeight } = useHealthConnectWeight(date);
  const { data: dailyHealthSummary } = useDailyHealthSummary(date);
  const { data: sleepHeartRateSeries = [] } = useSleepHeartRateSeries(date);
  const { data: webHealthMetrics } = useHealthMetricsDaily(date);
  // Same native/web split as the Bugün screen — see that file's identical
  // comment on why Platform.OS branching here is safe.
  const sleepStages = Platform.OS === 'web' ? webHealthMetrics?.sleepStages : healthSleep?.stages;
  const { data: settings } = useSettings();
  const unit = settings?.unit ?? 'kg';
  const saveDayNote = useSaveDayNote();
  const deleteDay = useDeleteDay();
  const saveCheckin = useSaveCheckin();
  const addWater = useAddWater();
  const deleteSession = useDeleteSession();
  const deleteCardioSession = useDeleteCardioSession();
  const deleteNutritionDay = useDeleteNutritionDay();
  const deleteWaterForDate = useDeleteWaterForDate();
  const deleteCoffeeForDate = useDeleteCoffeeForDate();
  const addCoffeeForDate = useAddCoffeeForDate();
  const removeLastCoffeeForDate = useRemoveLastCoffeeForDate();
  const removeSupplementLog = useRemoveSupplementLog();
  const addSupplementLog = useAddSupplementLog();
  const { data: allSupplements = [] } = useSupplements();
  const { data: supplementCategories = [] } = useSupplementCategories();

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(day?.dayNote?.name ?? '');
  const [note, setNote] = useState(day?.dayNote?.note ?? '');
  const [editingBody, setEditingBody] = useState(false);
  const [showSleepBreakdown, setShowSleepBreakdown] = useState(false);
  const [activityMenuVisible, setActivityMenuVisible] = useState(false);

  useEffect(() => {
    setNameValue(day?.dayNote?.name ?? '');
  }, [day?.dayNote?.name]);

  useEffect(() => {
    setNote(day?.dayNote?.note ?? '');
  }, [day?.dayNote?.note]);

  // onBlur alone dropped notes when the screen unmounted before the blur
  // event resolved (back gesture, hardware back) — debounced auto-save
  // covers that gap without waiting for focus loss.
  useEffect(() => {
    if (!day || note === (day.dayNote?.note ?? '')) return;
    const timer = setTimeout(() => {
      saveDayNote.mutate({ date: day.date, note: note.trim() || null });
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);

  if (!day) {
    return null;
  }

  const title = day.dayNote?.name || formatDayMonth(day.date);
  const supplementLogById = new Map(day.supplements.map((log) => [log.supplementId, log]));
  const routineSupplements = allSupplements.filter(
    (supplement) => supplement.isDefault || supplementLogById.has(supplement.id)
  );
  // Same accent-per-category assignment as Today (index into the same
  // fixed tone set, same query order) so a category reads as the same
  // color in both places.
  // Dark-tuned hex values (mint/coral/violet) read low-contrast as text on a
  // light background — see Today's todayThemeLight for the relit values.
  const categoryAccentPalette = palette === nutritionPaletteLight
    ? [palette.blue, '#0E8F6C', '#C0392B', '#7C3AED']
    : [palette.blue, '#42E2AD', '#F75C57', '#A78BFA'];
  const supplementGroups = [
    ...supplementCategories.map((category, index) => ({ id: category.id, label: category.name, accentColor: categoryAccentPalette[index % categoryAccentPalette.length], supplements: routineSupplements.filter((supplement) => supplement.categoryId === category.id) })),
    { id: 'uncategorized', label: t('uncategorized'), accentColor: palette.muted, supplements: routineSupplements.filter((supplement) => supplement.categoryId == null) },
  ];

  const saveName = () => {
    saveDayNote.mutate({ date: day.date, name: nameValue.trim() || null });
    setEditingName(false);
  };

  const saveNote = () => saveDayNote.mutate({ date: day.date, note: note.trim() || null });

  const performDeleteDay = async () => {
    await deleteDay.mutateAsync(day.date);
    // router.back() here has landed on the Bugün tab instead of the
    // history calendar (same class of bug as the workout-finish flow
    // in workout/[sessionId].tsx) — go to an explicit target. dismissTo, not
    // replace: replace stacked a second (tabs) on the root stack.
    router.dismissTo('/history');
  };

  const confirmDelete = () => {
    const message = `${t('deleteDayMessage')} (${title})`;
    // Alert.alert() is a no-op on react-native-web — see nutrition/log/[id].tsx.
    if (Platform.OS === 'web') {
      if (window.confirm(`${t('deleteDay')}\n\n${message}`)) {
        performDeleteDay();
      }
      return;
    }
    Alert.alert(t('deleteDay'), message, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: performDeleteDay },
    ]);
  };

  const bedTime = day.checkin?.bedTime ?? null;
  const wakeTime = day.checkin?.wakeTime ?? null;
  const weightKg = day.checkin?.weightKg ?? null;
  const displayWeight = weightKg !== null ? fromKg(weightKg, unit) : null;
  const stressLevel = day.checkin?.stressLevel ?? null;

  const sleepValue =
    bedTime && wakeTime
      ? `${bedTime}–${wakeTime}${day.checkin?.sleepHours != null ? ` · ${formatSleepDuration(day.checkin.sleepHours)}` : ''}`
      : day.checkin?.sleepHours != null
        ? formatSleepDuration(day.checkin.sleepHours)
        : null;

  const bodyRows = [
    sleepValue != null
      ? {
          key: 'sleep',
          label: t('sleep').toUpperCase(),
          value: sleepValue,
          wide: true,
          onDelete: () => saveCheckin.mutate({ date: day.date, bedTime: null, wakeTime: null, sleepHours: null, napHours: null }),
        }
      : null,
    weightKg != null
      ? {
          key: 'weight',
          label: t('weight').toUpperCase(),
          value: `${displayWeight} ${unit}`,
          wide: false,
          onDelete: () => saveCheckin.mutate({ date: day.date, weightKg: null }),
        }
      : null,
    stressLevel != null
      ? {
          key: 'stress',
          label: t('stress').toUpperCase(),
          value: String(stressLevel),
          wide: false,
          onDelete: () => saveCheckin.mutate({ date: day.date, stressLevel: null }),
        }
      : null,
    day.water != null
      ? {
          key: 'water',
          label: t('water').toUpperCase(),
          value: `${day.water} ml`,
          wide: false,
          onDelete: () => deleteWaterForDate.mutate(day.date),
        }
      : null,
    day.coffee != null
      ? {
          key: 'coffee',
          label: t('coffee').toUpperCase(),
          value: String(day.coffee),
          wide: false,
          onDelete: () => deleteCoffeeForDate.mutate(day.date),
        }
      : null,
  ].filter(
    (row): row is { key: string; label: string; value: string; wide: boolean; onDelete: () => void } => row != null
  );

  const adjustBedTime = (deltaMinutes: number) => {
    const nextBedTime = addMinutesToTime(bedTime ?? '23:00', deltaMinutes);
    const nextWakeTime = wakeTime ?? '07:00';
    saveCheckin.mutate({
      date: day.date,
      bedTime: nextBedTime,
      wakeTime: nextWakeTime,
      sleepHours: sleepDurationHours(nextBedTime, nextWakeTime),
    });
  };

  const adjustWakeTime = (deltaMinutes: number) => {
    const nextBedTime = bedTime ?? '23:00';
    const nextWakeTime = addMinutesToTime(wakeTime ?? '07:00', deltaMinutes);
    saveCheckin.mutate({
      date: day.date,
      bedTime: nextBedTime,
      wakeTime: nextWakeTime,
      sleepHours: sleepDurationHours(nextBedTime, nextWakeTime),
    });
  };

  const adjustWeight = (delta: number) => {
    const base = displayWeight ?? fromKg(70, unit);
    const next = Math.max(0, Math.round((base + delta) * 10) / 10);
    saveCheckin.mutate({ date: day.date, weightKg: toKg(next, unit) });
  };

  const adjustWater = (deltaMl: number) => {
    const current = day.water ?? 0;
    const next = Math.max(0, current + deltaMl);
    const amountMl = next - current;
    if (amountMl === 0) {
      return;
    }
    addWater.mutate({ date: day.date, amountMl });
  };

  const adjustCoffee = (delta: 1 | -1) => {
    if (delta > 0) {
      addCoffeeForDate.mutate(day.date);
    } else if ((day.coffee ?? 0) > 0) {
      removeLastCoffeeForDate.mutate(day.date);
    }
  };

  return (
    <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topRow}>
          {/* router.back() (not replace) — replacing remounted the history
              calendar and reset its viewed month back to the current one,
              losing whatever month the user had navigated to before opening
              this day. This screen lives outside (tabs) precisely so that
              back() always lands on wherever it was pushed from — the
              History calendar, or (via a chart tooltip tap, see
              chart-pointer.tsx) whichever Analysis screen was tapped —
              instead of getting tangled in a different tab's own stack. */}
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/history'))} />
          <View style={styles.topRowTitle}>
            {editingName ? (
              <TextInput
                value={nameValue}
                onChangeText={setNameValue}
                onEndEditing={saveName}
                onBlur={saveName}
                autoFocus
                placeholder={formatDayMonth(day.date)}
                placeholderTextColor={theme.textSecondary}
                style={[styles.titleInput, { color: theme.text, borderColor: theme.border }]}
              />
            ) : (
              <Pressable onPress={() => setEditingName(true)} hitSlop={4}>
                <ThemedText type="title" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{title}</ThemedText>
              </Pressable>
            )}
          </View>
          <View style={styles.topRowActions}>
            <HeaderActionButton
              label={t('share')}
              accessibilityLabel={t('shareDay')}
              onPress={() => router.push({ pathname: '/history/day-share/[date]', params: { date: day.date } })}
            />
            <HeaderActionButton label={t('delete')} accessibilityLabel={t('deleteDay')} onPress={confirmDelete} tone="danger" />
          </View>
        </View>

        {day.dayNote?.name ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.header}>
            {formatDayMonth(day.date)}
          </ThemedText>
        ) : null}

        <View style={styles.snapshotRow}>
          <SnapshotMetric value={String(day.workouts.length)} label={t('workouts').toUpperCase()} tone="blue" />
          <SnapshotMetric value={String(day.runs.length)} label={t('activities').toUpperCase()} tone="green" />
          <SnapshotMetric value={day.nutrition ? String(Math.round(day.nutrition.totalCalories)) : '—'} label={t('kcal').toUpperCase()} tone="yellow" />
        </View>

        {/* KeyboardAwareScrollView below keeps the focused input — including
            a multiline note as it grows line by line — above the keyboard on
            both platforms; it replaces the KeyboardAvoidingView that used to
            wrap this, which on iOS let long notes slide under the keyboard
            (2026-10-23). */}
        <View style={styles.keyboardAvoiding}>
        <TextInput
          value={note}
          onChangeText={setNote}
          onEndEditing={saveNote}
          onBlur={saveNote}
          placeholder={t('addNoteLabel').toUpperCase()}
          placeholderTextColor={theme.textSecondary}
          scrollEnabled
          style={[styles.noteInput, { color: theme.text, borderColor: theme.border, height: DAY_NOTE_STANDARD_HEIGHT }]}
          multiline
        />

        <KeyboardAwareScrollView bottomOffset={KEYBOARD_BAR_CLEARANCE} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.groupCard, styles.workoutCard, cardShadow]}>
            <View style={styles.groupHeader}>
              <Ionicons name="barbell-outline" size={18} color={theme.textSecondary} />
            <SectionTitle>{t('workouts').toUpperCase()}</SectionTitle>
            </View>
            {day.workouts.length === 0 ? (
              <Pressable
                onPress={() => router.push({ pathname: '/workout/manual', params: { date: day.date } })}
                style={styles.addRow}
                hitSlop={4}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('noWorkoutLogged').toUpperCase()}
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.accent }}>
                  + {t('add').toUpperCase()}
                </ThemedText>
              </Pressable>
            ) : (
              <View style={styles.groupItems}>
                {day.workouts.map((session) => {
                  const exerciseCount = session.exerciseLogs.length;
                  const setCount = session.exerciseLogs.reduce((sum, log) => sum + log.sets.length, 0);
                  const durationSeconds = session.finishedAt
                    ? Math.max(
                        0,
                        Math.round(
                          (new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 1000
                        )
                      )
                    : 0;
                  const timeRange = session.finishedAt
                    ? `${formatClockTime(session.startedAt)} – ${formatClockTime(session.finishedAt)}`
                    : null;
                  return (
                    <SwipeableRow
                      key={`workout-${session.id}`}
                      onDelete={() => deleteSession.mutate(session.id)}
                      confirmTitle={t('deleteWorkout')}
                      confirmMessage={`"${session.name || t('workout')}" ${t('permanentlyDeleted')} `}>
                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname: '/history/workout/[sessionId]',
                            params: { sessionId: String(session.id) },
                          })
                        }
                        style={({ pressed }) => [
                          styles.innerRow,
                          { backgroundColor: withAlpha(palette.blue, 0.09), opacity: pressed ? 0.7 : 1 },
                        ]}>
                        <View style={styles.cardText}>
                          <ThemedText type="small">{session.name || t('workout')}</ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {exerciseCount} {t('exercisesLabel').toUpperCase()} · {setCount} {t('setsLabel').toUpperCase()} · {formatDuration(durationSeconds)}
                          </ThemedText>
                          {timeRange && (
                            <ThemedText type="small" themeColor="textSecondary" style={styles.timeRangeText}>
                              {timeRange}
                            </ThemedText>
                          )}
                        </View>
                      </Pressable>
                    </SwipeableRow>
                  );
                })}
              </View>
            )}
          </View>

          <View style={[styles.groupCard, styles.activityCard, cardShadow]}>
            <View style={styles.groupHeader}>
              <Ionicons name="footsteps-outline" size={18} color={theme.textSecondary} />
            <SectionTitle>{t('activitiesLabel').toUpperCase()}</SectionTitle>
            </View>
            {day.runs.length === 0 ? (
              <Pressable
                onPress={() => setActivityMenuVisible(true)}
                style={styles.addRow}
                hitSlop={4}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('noActivityLogged').toUpperCase()}
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.accent }}>
                  + {t('add').toUpperCase()}
                </ThemedText>
              </Pressable>
            ) : (
              <View style={styles.groupItems}>
                {day.runs.map((run) => {
                  const distanceMeters = run.distanceMeters ?? 0;
                  const durationSeconds = run.durationSeconds ?? 0;
                  const activityType = run.activityType ?? 'run';
                  const activityLabel = getActivityTypeLabel(activityType, language);
                  const rate = activityTypeUsesSpeed(activityType)
                    ? formatSpeed(distanceMeters, durationSeconds)
                    : activityType === 'swim'
                      ? formatSwimPace(distanceMeters, durationSeconds)
                      : formatPace(distanceMeters, durationSeconds);
                  const timeRange = run.finishedAt
                    ? `${formatClockTime(run.startedAt)} – ${formatClockTime(run.finishedAt)}`
                    : null;
                  return (
                    <SwipeableRow
                      key={`run-${run.id}`}
                      onDelete={() => deleteCardioSession.mutate(run.id)}
                      confirmTitle={t('deleteActivity')}
                      confirmMessage={`"${run.name || activityLabel}" ${t('permanentlyDeleted')}`}>
                      <Pressable
                        onPress={() => router.push({ pathname: '/run/summary/[id]', params: { id: String(run.id) } })}
                        style={({ pressed }) => [
                          styles.innerRow,
                          { backgroundColor: withAlpha(palette.green, 0.09), opacity: pressed ? 0.7 : 1 },
                        ]}>
                        <View style={styles.cardText}>
                          <ThemedText type="small">{run.name || activityLabel}</ThemedText>
                          <View style={styles.runStatsRow}>
                            <ThemedText type="small" themeColor="textSecondary">
                              {(distanceMeters / 1000).toFixed(2)} KM
                            </ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {formatDuration(durationSeconds)}
                            </ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {rate}
                            </ThemedText>
                          </View>
                          {timeRange && (
                            <ThemedText type="small" themeColor="textSecondary" style={styles.timeRangeText}>
                              {timeRange}
                            </ThemedText>
                          )}
                        </View>
                      </Pressable>
                    </SwipeableRow>
                  );
                })}
              </View>
            )}
          </View>

          {day.nutrition ? (
            <SwipeableRow
              onDelete={() => deleteNutritionDay.mutate(day.date)}
              confirmTitle="Delete nutrition"
              confirmMessage="All nutrition records for this day will be permanently deleted.">
              <Pressable
                onPress={() => router.push({ pathname: '/history/nutrition/[date]', params: { date: day.date } })}
                style={({ pressed }) => [
                  styles.groupCard,
                  styles.groupHeaderRow,
                  styles.nutritionCard, { opacity: pressed ? 0.7 : 1 },
                  cardShadow,
                ]}>
                <View style={styles.groupHeader}>
                  <Ionicons name="restaurant-outline" size={18} color={theme.textSecondary} />
                  <SectionTitle>{t('nutrition').toUpperCase()}</SectionTitle>
                </View>
                <View style={styles.groupHeaderTrailing}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {Math.round(day.nutrition.totalCalories)} kcal
                  </ThemedText>
                </View>
              </Pressable>
            </SwipeableRow>
          ) : (
            <Pressable
              onPress={() => router.push({ pathname: '/history/nutrition/[date]', params: { date: day.date } })}
              style={({ pressed }) => [
                styles.groupCard,
                styles.nutritionCard, { opacity: pressed ? 0.7 : 1 },
                cardShadow,
              ]}>
              <View style={styles.groupHeader}>
                <Ionicons name="restaurant-outline" size={18} color={theme.textSecondary} />
                <SectionTitle>{t('nutrition').toUpperCase()}</SectionTitle>
              </View>
              <View style={styles.addRow}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('noNutritionLogged').toUpperCase()}
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.accent }}>
                  + {t('add').toUpperCase()}
                </ThemedText>
              </View>
            </Pressable>
          )}

          <View style={[styles.groupCard, styles.bodyCard, cardShadow]}>
            <View style={styles.groupHeaderRow}>
              <View style={styles.groupHeader}>
                <Ionicons name="body-outline" size={18} color={theme.textSecondary} />
                <SectionTitle>{t('body').toUpperCase()}</SectionTitle>
              </View>
              <View style={styles.groupHeaderTrailing}>
                {editingBody && (healthSleep || healthWeight != null) && (
                  <Pressable
                  accessibilityLabel={t('useWatchData')}
                    onPress={() =>
                      saveCheckin.mutate({
                        date: day.date,
                        ...(healthSleep
                          ? { bedTime: healthSleep.bedTime, wakeTime: healthSleep.wakeTime, sleepHours: healthSleep.sleepHours }
                          : {}),
                        ...(healthWeight != null ? { weightKg: healthWeight } : {}),
                      })
                    }
                    hitSlop={8}>
                    <Ionicons name="sync-outline" size={16} color={theme.accent} />
                  </Pressable>
                )}
                <Pressable
                  accessibilityLabel={editingBody ? t('finishEditing') : t('editBodyData')}
                  onPress={() => setEditingBody((e) => !e)}
                  hitSlop={8}>
                  <Ionicons
                    name={editingBody ? 'checkmark' : 'pencil-outline'}
                    size={16}
                    color={editingBody ? theme.accent : theme.textSecondary}
                  />
                </Pressable>
              </View>
            </View>

            {editingBody ? (
              <View style={styles.groupItems}>
                <View style={styles.sleepFieldRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('bedtime').toUpperCase()}
                  </ThemedText>
                  <View style={styles.sleepStepper}>
                    <Pressable
                      accessibilityLabel={t('moveBedtimeEarlier')}
                      onPress={() => adjustBedTime(-15)}
                      hitSlop={10}
                      style={[styles.stepperButtonSmall, { backgroundColor: theme.backgroundSelected }]}>
                      <Ionicons name="remove" size={16} color={theme.text} />
                    </Pressable>
                    <ThemedText type="smallBold" style={styles.sleepTimeValue}>
                      {bedTime ?? '–'}
                    </ThemedText>
                    <Pressable
                      accessibilityLabel={t('moveBedtimeLater')}
                      onPress={() => adjustBedTime(15)}
                      hitSlop={10}
                      style={[styles.stepperButtonSmall, { backgroundColor: theme.backgroundSelected }]}>
                      <Ionicons name="add" size={16} color={theme.text} />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.sleepFieldRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('wakeUp').toUpperCase()}
                  </ThemedText>
                  <View style={styles.sleepStepper}>
                    <Pressable
                      accessibilityLabel={t('moveWakeUpEarlier')}
                      onPress={() => adjustWakeTime(-15)}
                      hitSlop={10}
                      style={[styles.stepperButtonSmall, { backgroundColor: theme.backgroundSelected }]}>
                      <Ionicons name="remove" size={16} color={theme.text} />
                    </Pressable>
                    <ThemedText type="smallBold" style={styles.sleepTimeValue}>
                      {wakeTime ?? '–'}
                    </ThemedText>
                    <Pressable
                      accessibilityLabel={t('moveWakeUpLater')}
                      onPress={() => adjustWakeTime(15)}
                      hitSlop={10}
                      style={[styles.stepperButtonSmall, { backgroundColor: theme.backgroundSelected }]}>
                      <Ionicons name="add" size={16} color={theme.text} />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.sleepFieldRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('weight').toUpperCase()}
                  </ThemedText>
                  <View style={styles.sleepStepper}>
                    <Pressable
                      accessibilityLabel={t('decreaseWeight')}
                      onPress={() => adjustWeight(-0.1)}
                      hitSlop={10}
                      style={[styles.stepperButtonSmall, { backgroundColor: theme.backgroundSelected }]}>
                      <Ionicons name="remove" size={16} color={theme.text} />
                    </Pressable>
                    <ThemedText type="smallBold" style={styles.sleepTimeValue}>
                      {displayWeight !== null ? `${displayWeight} ${unit}` : '–'}
                    </ThemedText>
                    <Pressable
                      accessibilityLabel={t('increaseWeight')}
                      onPress={() => adjustWeight(0.1)}
                      hitSlop={10}
                      style={[styles.stepperButtonSmall, { backgroundColor: theme.backgroundSelected }]}>
                      <Ionicons name="add" size={16} color={theme.text} />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.sleepFieldRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('water').toUpperCase()}
                  </ThemedText>
                  <View style={styles.sleepStepper}>
                    <Pressable
                      accessibilityLabel={t('decreaseWater')}
                      onPress={() => adjustWater(-100)}
                      hitSlop={10}
                      style={[styles.stepperButtonSmall, { backgroundColor: theme.backgroundSelected }]}>
                      <Ionicons name="remove" size={16} color={theme.text} />
                    </Pressable>
                    <ThemedText type="smallBold" style={styles.sleepTimeValue}>
                      {day.water != null ? `${day.water} ml` : '–'}
                    </ThemedText>
                    <Pressable
                      accessibilityLabel={t('increaseWater')}
                      onPress={() => adjustWater(100)}
                      hitSlop={10}
                      style={[styles.stepperButtonSmall, { backgroundColor: theme.backgroundSelected }]}>
                      <Ionicons name="add" size={16} color={theme.text} />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.sleepFieldRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('coffee').toUpperCase()}
                  </ThemedText>
                  <View style={styles.sleepStepper}>
                    <Pressable
                      accessibilityLabel={t('decreaseCoffee')}
                      onPress={() => adjustCoffee(-1)}
                      hitSlop={10}
                      style={[styles.stepperButtonSmall, { backgroundColor: theme.backgroundSelected }]}>
                      <Ionicons name="remove" size={16} color={theme.text} />
                    </Pressable>
                    <ThemedText type="smallBold" style={styles.sleepTimeValue}>
                      {day.coffee != null ? String(day.coffee) : '–'}
                    </ThemedText>
                    <Pressable
                      accessibilityLabel={t('increaseCoffee')}
                      onPress={() => adjustCoffee(1)}
                      hitSlop={10}
                      style={[styles.stepperButtonSmall, { backgroundColor: theme.backgroundSelected }]}>
                      <Ionicons name="add" size={16} color={theme.text} />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.sleepFieldRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('stress').toUpperCase()}
                  </ThemedText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stressScroll} contentContainerStyle={styles.stressRow}>
                    {STRESS_LEVELS.map((level) => {
                      const selected = stressLevel === level;
                      return (
                        <Pressable
                          key={level}
                          onPress={() => saveCheckin.mutate({ date: day.date, stressLevel: level })}
                          style={[
                            styles.stressChip,
                            { backgroundColor: selected ? theme.accent : theme.backgroundSelected },
                          ]}>
                          <ThemedText type="smallBold" style={{ color: selected ? theme.accentOn : theme.text }}>
                            {level}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            ) : bodyRows.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('noBodyDataLogged').toUpperCase()}
              </ThemedText>
            ) : (
              <View style={styles.bodyMetricGrid}>
                {bodyRows.map((row) => (
                  <View key={row.key} style={[styles.bodyMetricCell, row.wide && styles.bodyMetricCellWide]}>
                    <SwipeableRow
                      onDelete={row.onDelete}
                      confirmTitle={`Delete ${row.label}`}
                      confirmMessage={`${row.label} for this day will be permanently deleted.`}>
                      <Pressable
                        disabled={row.key !== 'sleep' || !sleepStages}
                        accessibilityRole={row.key === 'sleep' && sleepStages ? 'button' : undefined}
                        accessibilityLabel={row.key === 'sleep' && sleepStages ? t('showSleepStageDetails') : undefined}
                        onPress={() => row.key === 'sleep' && setShowSleepBreakdown((visible) => !visible)}
                        style={[styles.bodyMetricCard, row.wide && styles.bodyMetricCardWide]}>
                        <ThemedText style={styles.bodyMetricLabel}>
                        {row.label}{row.key === 'sleep' && sleepStages ? ` · ${t('details').toUpperCase()}` : ''}
                        </ThemedText>
                        <ThemedText style={styles.bodyMetricValue}>{row.value}</ThemedText>
                        {row.key === 'sleep' && day.checkin?.napHours != null && <ThemedText type="small" themeColor="textSecondary">{t('nap').toUpperCase()} {formatSleepDuration(day.checkin.napHours)}</ThemedText>}
                      </Pressable>
                    </SwipeableRow>
                  </View>
                ))}
              </View>
            )}

          </View>

          {steps != null && (
            <View style={[styles.groupCard, styles.stepsCard, cardShadow]}>
              <View style={styles.groupHeader}>
                <Ionicons name="footsteps-outline" size={18} color={theme.textSecondary} />
              <SectionTitle>{t('steps').toUpperCase()}</SectionTitle>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {steps.toLocaleString('en-US')} STEPS
              </ThemedText>
            </View>
          )}

          {dailyHealthSummary && (dailyHealthSummary.restingHeartRate != null || dailyHealthSummary.totalCaloriesBurned != null) && (
            <View style={[styles.groupCard, styles.healthCard, cardShadow]}>
              <View style={styles.groupHeader}>
                <Ionicons name="pulse-outline" size={18} color={theme.textSecondary} />
              <SectionTitle>{t('dailyHealth').toUpperCase()}</SectionTitle>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {[
                    dailyHealthSummary.restingHeartRate != null ? `${dailyHealthSummary.restingHeartRate} ${t('restingHeartRate').toUpperCase()}` : null,
                  dailyHealthSummary.totalCaloriesBurned != null
                    ? `${Math.round(dailyHealthSummary.totalCaloriesBurned)} ${t('kcalBurned').toUpperCase()}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </ThemedText>
            </View>
          )}

          {sleepHeartRateSeries.length >= 2 && (
            // Sleep-window heart rate only — see querySleepHeartRateTimeSeries
            // in health-connect.ts.
            <TimeSeriesChart title={t('sleepHeartRate').toUpperCase()} unit="BPM" data={sleepHeartRateSeries} kind="heartRate" />
          )}

          <View style={[styles.groupCard, styles.supplementCard, cardShadow]}>
            <View style={styles.groupHeader}>
              <Ionicons name="medkit-outline" size={18} color={theme.textSecondary} />
              <SectionTitle>{t('supplements').toUpperCase()}</SectionTitle>
            </View>
            {routineSupplements.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('createRoutineHere').toUpperCase()}
              </ThemedText>
            ) : (
              <View style={styles.supplementChecklist}>
                {supplementGroups.filter((group) => group.supplements.length > 0).map((group, index) => (
                  <View key={group.id} style={[styles.supplementCategoryGroup, index > 0 && styles.supplementCategoryGroupDivider]}>
                    <ThemedText style={[styles.supplementCategoryTitle, { color: group.accentColor }]}>{group.label.toUpperCase()}</ThemedText>
                    <View style={styles.supplementChecklist}>
                      {group.supplements.map((supplement) => {
                        const log = supplementLogById.get(supplement.id);
                        return (
                          <SupplementHistoryRow
                            key={supplement.id}
                            supplement={supplement}
                            log={log}
                            onToggle={() =>
                              log
                                ? removeSupplementLog.mutate(log.id)
                                : addSupplementLog.mutate({ supplementId: supplement.id, amount: supplement.defaultAmount, date: day.date })
                            }
                          />
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </KeyboardAwareScrollView>
        </View>

        <Modal
          transparent
          visible={showSleepBreakdown && sleepStages != null}
          animationType="fade"
          onRequestClose={() => setShowSleepBreakdown(false)}>
          <Pressable style={styles.sleepModalBackdrop} onPress={() => setShowSleepBreakdown(false)}>
            <Pressable style={[styles.sleepModalCard, cardShadow]} onPress={(event) => event.stopPropagation()}>
              <View style={styles.sleepModalHeader}>
                <ThemedText style={styles.sleepDetailTitle}>{t('sleepBreakdown').toUpperCase()}</ThemedText>
                <Pressable accessibilityLabel={t('closeSleepDetails')} onPress={() => setShowSleepBreakdown(false)} hitSlop={10}>
                  <ThemedText style={styles.sleepModalClose}>×</ThemedText>
                </Pressable>
              </View>
              <View style={styles.sleepStagesRow}>
                <View style={styles.sleepStageBlock}>
                  <ThemedText type="small">{formatSleepDuration(sleepStages?.deepHours ?? 0)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{t('deep').toUpperCase()}</ThemedText>
                </View>
                <View style={styles.sleepStageBlock}>
                  <ThemedText type="small">{formatSleepDuration(sleepStages?.lightHours ?? 0)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{t('sleepLight').toUpperCase()}</ThemedText>
                </View>
                <View style={styles.sleepStageBlock}>
                  <ThemedText type="small">{formatSleepDuration(sleepStages?.remHours ?? 0)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{t('rem').toUpperCase()}</ThemedText>
                </View>
                {(sleepStages?.awakeHours ?? 0) > 0 && (
                  <View style={styles.sleepStageBlock}>
                    <ThemedText type="small">{formatSleepDuration(sleepStages?.awakeHours ?? 0)}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">{t('awake').toUpperCase()}</ThemedText>
                  </View>
                )}
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          transparent
          visible={activityMenuVisible}
          animationType="fade"
          onRequestClose={() => setActivityMenuVisible(false)}>
          <Pressable style={styles.sleepModalBackdrop} onPress={() => setActivityMenuVisible(false)}>
            <Pressable style={[styles.sleepModalCard, cardShadow]} onPress={(event) => event.stopPropagation()}>
              <View style={styles.sleepModalHeader}>
                <ThemedText style={styles.sleepDetailTitle}>{t('chooseActivity').toUpperCase()}</ThemedText>
                <Pressable accessibilityLabel="Close" onPress={() => setActivityMenuVisible(false)} hitSlop={10}>
                  <ThemedText style={styles.sleepModalClose}>×</ThemedText>
                </Pressable>
              </View>
              <View style={styles.activityMenuList}>
                {(['run', 'swim', 'bike', 'motor'] as ActivityType[]).map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => {
                      setActivityMenuVisible(false);
                      router.push({ pathname: '/run/manual', params: { date: day.date, activityType: type } });
                    }}
                    style={[styles.activityMenuOption, { backgroundColor: theme.backgroundSelected }]}>
                    <ThemedText type="default">{getActivityTypeLabel(type, language)}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </ThemedView>
  );
}

// Mirrors Today's supplement checklist row (index.tsx) exactly — name +
// default amount on the left, TAKEN/PENDING on the right. History used to
// also show a separate, editable "actual amount" pressable next to it,
// which duplicated the same default amount and never agreed visually with
// Today's simpler row.
function SupplementHistoryRow({
  supplement,
  log,
  onToggle,
}: {
  supplement: { id: string; name: string; defaultAmount: string | null };
  log?: { id: string; name: string; amount: string | null };
  onToggle: () => void;
}) {
  const { t } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const taken = log != null;

  const row = (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: taken }}
      accessibilityLabel={`${supplement.name}, ${taken ? t('taken') : t('pending')}`}
      onPress={onToggle}
      style={styles.supplementChecklistToggle}>
      <View style={styles.supplementChecklistCopy}>
        <ThemedText style={[styles.supplementChecklistName, taken && styles.supplementTakenName]} numberOfLines={1}>
          {supplement.name}
        </ThemedText>
        {supplement.defaultAmount && <ThemedText style={styles.supplementChecklistAmount}>{supplement.defaultAmount}</ThemedText>}
      </View>
      <ThemedText style={[styles.supplementStatus, taken ? styles.supplementTaken : styles.supplementPending]}>
        {taken ? t('taken').toUpperCase() : t('pending').toUpperCase()}
      </ThemedText>
    </Pressable>
  );

  return log ? (
    <SwipeableRow onDelete={onToggle} confirmTitle={t('removeSupplement')} confirmMessage={`${t('removeSupplement')} "${supplement.name}"?`}>
      {row}
    </SwipeableRow>
  ) : row;
}

function SnapshotMetric({ value, label, tone }: { value: string; label: string; tone: 'blue' | 'green' | 'yellow' }) {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.snapshotMetric}>
      <ThemedText style={[styles.snapshotValue, { color: palette[tone] }]}>{value}</ThemedText>
      <ThemedText style={styles.snapshotLabel}>{label}</ThemedText>
    </View>
  );
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => softSheet({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  safeArea: {
    flex: 1,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
  },
  topRowTitle: {
    flex: 1,
  },
  topRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  keyboardAvoiding: {
    flex: 1,
    gap: Spacing.two,
  },
  header: {
    marginTop: Spacing.half,
  },
  snapshotRow: { flexDirection: 'row', gap: Spacing.one },
  snapshotMetric: { flex: 1, minHeight: 68, padding: Spacing.two, justifyContent: 'space-between', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.raised },
  snapshotValue: { fontFamily: Fonts.metric, fontSize: 28, lineHeight: 30 },
  snapshotLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 7, letterSpacing: 0.6 },
  titleInput: {
    color: palette.text,
    fontSize: 30,
    fontFamily: Fonts.metric,
    letterSpacing: 0.2,
    borderBottomWidth: 1,
    borderColor: palette.border,
    paddingVertical: 2,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: 0,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 14,
    minHeight: 42,
    backgroundColor: palette.card,
    textAlignVertical: 'top',
  },
  content: {
    paddingTop: Spacing.two,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  groupCard: {
    borderRadius: 0,
    borderWidth: 1,
    borderColor: palette.border,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  workoutCard: { backgroundColor: withAlpha(palette.blue, 0.05), borderLeftWidth: 3, borderLeftColor: palette.blue },
  activityCard: { backgroundColor: withAlpha(palette.green, 0.05), borderLeftWidth: 3, borderLeftColor: palette.green },
  nutritionCard: { backgroundColor: withAlpha(palette.yellow, 0.045), borderLeftWidth: 3, borderLeftColor: palette.yellow },
  bodyCard: { backgroundColor: 'rgba(167, 139, 250, 0.045)', borderLeftWidth: 3, borderLeftColor: '#A78BFA' },
  stepsCard: { backgroundColor: 'rgba(103, 232, 249, 0.04)', borderLeftWidth: 3, borderLeftColor: '#67E8F9' },
  healthCard: { backgroundColor: 'rgba(251, 113, 133, 0.04)', borderLeftWidth: 3, borderLeftColor: '#FB7185' },
  supplementCard: { backgroundColor: 'rgba(251, 146, 60, 0.035)', borderLeftWidth: 3, borderLeftColor: '#FB923C' },
  supplementCategoryGroup: { gap: Spacing.one },
  supplementCategoryGroupDivider: { paddingTop: Spacing.two, borderTopWidth: 1, borderColor: palette.border },
  supplementCategoryTitle: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.8 },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  groupTitle: {
    color: palette.text,
    fontFamily: Fonts.technical,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 1,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupHeaderTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  groupItems: {
    gap: Spacing.two,
  },
  bodyMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  bodyMetricCell: {
    flexGrow: 1,
    flexBasis: '46%',
  },
  bodyMetricCellWide: {
    flexBasis: '100%',
  },
  bodyMetricCard: {
    minHeight: 76,
    justifyContent: 'space-between',
    padding: Spacing.two,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
  },
  bodyMetricCardWide: {
    minHeight: 72,
    backgroundColor: palette.raised,
  },
  bodyMetricLabel: {
    color: palette.muted,
    fontFamily: Fonts.technical,
    fontSize: 8,
    letterSpacing: 0.7,
  },
  bodyMetricValue: {
    color: palette.text,
    fontFamily: Fonts.metric,
    fontSize: 21,
    lineHeight: 23,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  innerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  timeRangeText: {
    opacity: 0.7,
  },
  runStatsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  supplementChecklist: { gap: Spacing.two },
  supplementChecklistToggle: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingLeft: Spacing.two,
    paddingRight: Spacing.one,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.raised,
  },
  supplementChecklistCopy: { flex: 1, minWidth: 0, gap: Spacing.half },
  supplementChecklistName: { color: palette.text, fontFamily: Fonts.regular, fontSize: 14 },
  supplementTakenName: { color: palette.muted },
  supplementChecklistAmount: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 8, letterSpacing: 0.5 },
  supplementStatus: {
    minWidth: 58,
    marginRight: Spacing.one,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.half,
    borderWidth: 1,
    fontFamily: Fonts.technical,
    fontSize: 8,
    letterSpacing: 0.7,
    textAlign: 'center',
  },
  supplementTaken: { color: palette.blue, borderColor: palette.blue, backgroundColor: withAlpha(palette.blue, 0.10) },
  supplementPending: { color: palette.muted, borderColor: palette.border },
  sleepFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sleepStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepperButtonSmall: {
    width: 32,
    height: 32,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sleepTimeValue: {
    minWidth: 56,
    textAlign: 'center',
  },
  // flexGrow: 0 so this horizontal ScrollView doesn't stretch to fill the
  // sleepFieldRow's remaining space (it's the row's second flex child) —
  // without it the row's justifyContent: 'space-between' pushed the
  // ScrollView flush right but the chips still sat left-aligned *within*
  // that stretched box, unlike every other stepper row here which is
  // already exactly as wide as its content.
  stressScroll: {
    flexGrow: 0,
  },
  stressRow: {
    gap: Spacing.two,
  },
  stressChip: {
    width: 36,
    height: 36,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sleepModalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  sleepModalCard: {
    width: '100%',
    maxWidth: 360,
    padding: Spacing.three,
    gap: Spacing.three,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: palette.border,
    borderLeftColor: '#818CF8',
    backgroundColor: palette.raised,
  },
  sleepModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sleepDetailTitle: {
    color: palette.muted,
    fontFamily: Fonts.technical,
    fontSize: 8,
    letterSpacing: 0.8,
  },
  sleepModalClose: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 18, lineHeight: 20 },
  activityMenuList: { gap: Spacing.two },
  activityMenuOption: { minHeight: 48, borderRadius: 0, paddingHorizontal: Spacing.three, justifyContent: 'center' },
  sleepStagesRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: Spacing.two,
  },
  sleepStageBlock: {
    alignItems: 'center',
    gap: Spacing.half,
  },
});

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { DaySummaryShareCard, SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH, type DaySummaryBlock } from '@/components/day-summary-share-card';
import { NutritionPage, PaletteText as ThemedText, TrashIcon, useNutritionPalette } from '@/components/nutrition-ui';
import { WEB_CONTENT_MAX_WIDTH } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useExercises } from '@/db/queries/exercises';
import { useHistoryDay, type CardioSession, type WorkoutSession } from '@/db/queries/history-days';
import { useMealCategories, type MealCategory } from '@/db/queries/meal-categories';
import { useNutritionLogsForDate } from '@/db/queries/nutrition';
import { formatDayMonth, formatSleepDuration, sleepDurationHours } from '@/lib/date';
import { formatDuration, formatPace } from '@/lib/geo';
import { useT } from '@/lib/i18n';

type SectionKey = 'workout' | 'run' | 'nutrition' | 'health' | 'drinks' | 'supplements';
type T = ReturnType<typeof useT>['t'];

function buildWorkoutBlock(workouts: WorkoutSession[], exerciseNameById: Map<string, string>, detailed: boolean, t: T): DaySummaryBlock {
  const totalSets = workouts.reduce((sum, w) => sum + w.exerciseLogs.reduce((s, log) => s + log.sets.length, 0), 0);
  const lines = workouts.flatMap((w) =>
    w.exerciseLogs.map((log) => {
      const name = exerciseNameById.get(log.exerciseId) ?? 'Hareket';
      if (!detailed) {
        const reps = log.sets.map((s) => s.reps).filter((r): r is number => r != null);
        const uniformReps = reps.length > 0 && reps.every((r) => r === reps[0]) ? reps[0] : null;
        return uniformReps != null ? `${name} — ${log.sets.length}×${uniformReps}` : `${name} — ${log.sets.length} set`;
      }
      const setsText = log.sets.map((s) => `${s.weight ?? '–'}kg×${s.reps ?? '–'}`).join(', ');
      return `${name}: ${setsText}`;
    })
  );
  return {
    title: t('workout').toUpperCase(),
    summary: `${workouts.reduce((sum, w) => sum + w.exerciseLogs.length, 0)} hareket · ${totalSets} set`,
    details: lines,
  };
}

function buildRunBlock(runs: CardioSession[], detailed: boolean, t: T): DaySummaryBlock {
  const totalDistance = runs.reduce((sum, r) => sum + (r.distanceMeters ?? 0), 0);
  const totalDuration = runs.reduce((sum, r) => sum + (r.durationSeconds ?? 0), 0);
  const summary = `${(totalDistance / 1000).toFixed(2)} km · ${formatDuration(totalDuration)}`;
  const title = t('run').toUpperCase();
  if (!detailed) {
    return { title, summary };
  }
  const details = runs.map((r) => {
    const parts = [`${formatPace(r.distanceMeters ?? 0, r.durationSeconds ?? 0)} tempo`];
    if (r.elevationGainMeters != null) parts.push(`+${Math.round(r.elevationGainMeters)}m irtifa`);
    if (r.avgHeartRate != null) parts.push(`${r.avgHeartRate} bpm`);
    if (r.caloriesBurned != null) parts.push(`${Math.round(r.caloriesBurned)} kcal`);
    return `${r.name || 'Koşu'}: ${parts.join(' · ')}`;
  });
  return { title, summary, details };
}

type NutritionLogRow = ReturnType<typeof useNutritionLogsForDate>['data'] extends (infer T)[] | undefined ? T : never;

function buildNutritionBlock(logs: NutritionLogRow[], detailed: boolean, categories: MealCategory[], t: T): DaySummaryBlock {
  const totals = logs.reduce(
    (acc, log) => {
      const factor = log.amountGrams / 100;
      acc.calories += log.caloriesPer100g * factor;
      acc.protein += log.proteinPer100g * factor;
      acc.carbs += log.carbsPer100g * factor;
      acc.fat += log.fatPer100g * factor;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const summary = `${Math.round(totals.calories)} kcal · P${Math.round(totals.protein)} K${Math.round(totals.carbs)} Y${Math.round(totals.fat)}`;
  const title = t('nutrition').toUpperCase();
  if (!detailed) {
    return { title, summary };
  }
  const mealColumns = categories
    .map((category) => {
      const items = logs.filter((log) => log.mealType === category.id);
      if (items.length === 0) return null;
      return { label: category.label, items: items.map((log) => `${log.foodName} (${log.amountGrams}g)`) };
    })
    .filter((column): column is { label: string; items: string[] } => column !== null);
  return { title, summary, mealColumns };
}

function buildHealthBlock(
  checkin: { bedTime: string | null; wakeTime: string | null; weightKg: number | null; stressLevel: number | null } | null,
  detailed: boolean,
  t: T
): DaySummaryBlock | null {
  if (!checkin) return null;
  const parts: string[] = [];
  if (checkin.bedTime && checkin.wakeTime) {
    parts.push(`${t('sleep')} ${formatSleepDuration(sleepDurationHours(checkin.bedTime, checkin.wakeTime))}`);
  }
  if (checkin.weightKg != null) {
    parts.push(`${t('weight')} ${checkin.weightKg} kg`);
  }
  if (checkin.stressLevel != null) {
    parts.push(`${t('stress')} ${checkin.stressLevel}/5`);
  }
  if (parts.length === 0) return null;
  const details = detailed && checkin.bedTime && checkin.wakeTime ? [`Yatış ${checkin.bedTime} · Kalkış ${checkin.wakeTime}`] : undefined;
  return { title: t('health').toUpperCase(), summary: parts.join(' · '), details };
}

function buildDrinksBlock(water: number | null, coffee: number | null, t: T): DaySummaryBlock | null {
  const parts: string[] = [];
  if (water) parts.push(`${water} ml ${t('water').toLowerCase()}`);
  if (coffee) parts.push(`${coffee} ${t('coffee').toLowerCase()}`);
  if (parts.length === 0) return null;
  return { title: `${t('water').toUpperCase()} & ${t('coffee').toUpperCase()}`, summary: parts.join(' · ') };
}

function buildSupplementsBlock(supplements: { name: string; amount: string | null }[], t: T): DaySummaryBlock | null {
  if (supplements.length === 0) return null;
  return {
    title: t('supplements').toUpperCase(),
    summary: `${supplements.length} takviye`,
    details: [supplements.map((s) => (s.amount ? `${s.name} (${s.amount})` : s.name)).join(', ')],
  };
}

export default function DayShareScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { t } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { width: rawWindowWidth, height: windowHeight } = useWindowDimensions();
  // On web every screen's root ThemedView caps content at
  // WEB_CONTENT_MAX_WIDTH and centers it — useWindowDimensions() still
  // reports the full (much wider) browser window.
  const windowWidth = Math.min(rawWindowWidth, WEB_CONTENT_MAX_WIDTH);
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [backgroundUri, setBackgroundUri] = useState<string | null>(null);
  const [textTheme, setTextTheme] = useState<'light' | 'dark'>('light');
  // A single global basic/detailed choice, matching Nutrition Share's mode
  // toggle — picking how much detail to include is a different decision
  // from picking which sections to include at all, so it gets its own
  // control at the top instead of a per-section sub-chip that used to shift
  // the section chips' layout every time it was toggled.
  const [detailed, setDetailed] = useState(false);
  const [included, setIncluded] = useState<Record<SectionKey, boolean>>({
    workout: true,
    run: true,
    nutrition: true,
    health: true,
    drinks: true,
    supplements: true,
  });

  // Scaled to fit BOTH dimensions, not just width — the poster card is a
  // fixed 9:16 shape. The preview sits in a plain (non-scrolling) View sized
  // to this budget, same as Nutrition Share — the card must always fit
  // without scrolling. NutritionPage's own wordmark+header chrome, the mode
  // row, photo row, (conditional) text-theme row, section chips, and share
  // button are all reserved for here.
  const availableHeight = Math.max(160, windowHeight - 480);
  const widthScale = (windowWidth - 48) / SHARE_CARD_WIDTH;
  const heightScale = availableHeight / SHARE_CARD_HEIGHT;
  const previewScale = Math.max(0.18, Math.min(1, widthScale, heightScale));

  const pickBackground = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, legacy: true });
    if (!result.canceled && result.assets[0]) {
      setBackgroundUri(result.assets[0].uri);
    }
  };

  // Reset to light text too — dark text with no photo means dark text on
  // the card's own dark fallback gradient, i.e. invisible.
  const removeBackground = () => {
    setBackgroundUri(null);
    setTextTheme('light');
  };

  const day = useHistoryDay(date);
  const { data: nutritionLogs = [] } = useNutritionLogsForDate(date);
  const { data: mealCategories = [] } = useMealCategories();
  const { data: exercises = [] } = useExercises();
  const exerciseNameById = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises]);

  const availability = useMemo(() => {
    const map: Partial<Record<SectionKey, boolean>> = {
      workout: (day?.workouts.length ?? 0) > 0,
      run: (day?.runs.length ?? 0) > 0,
      nutrition: nutritionLogs.length > 0,
      health: !!buildHealthBlock(day?.checkin ?? null, false, t),
      drinks: !!buildDrinksBlock(day?.water ?? null, day?.coffee ?? null, t),
      supplements: (day?.supplements.length ?? 0) > 0,
    };
    return map;
  }, [day, nutritionLogs, t]);

  const blocks = useMemo(() => {
    if (!day) return [];
    const result: DaySummaryBlock[] = [];
    if (included.workout && availability.workout) result.push(buildWorkoutBlock(day.workouts, exerciseNameById, detailed, t));
    if (included.run && availability.run) result.push(buildRunBlock(day.runs, detailed, t));
    if (included.nutrition && availability.nutrition) result.push(buildNutritionBlock(nutritionLogs, detailed, mealCategories, t));
    if (included.health && availability.health) {
      const block = buildHealthBlock(day.checkin, detailed, t);
      if (block) result.push(block);
    }
    if (included.drinks && availability.drinks) {
      const block = buildDrinksBlock(day.water, day.coffee, t);
      if (block) result.push(block);
    }
    if (included.supplements && availability.supplements) {
      const block = buildSupplementsBlock(day.supplements, t);
      if (block) result.push(block);
    }
    return result;
  }, [day, nutritionLogs, mealCategories, exerciseNameById, included, detailed, availability, t]);

  const share = async () => {
    if (!cardRef.current) return;
    setSharing(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Günü Paylaş' });
    } catch (error) {
      console.warn('Paylaşım başarısız:', error);
    } finally {
      setSharing(false);
    }
  };

  if (!day) return null;

  const allSections: { key: SectionKey; label: string }[] = [
    { key: 'workout', label: t('workout') },
    { key: 'run', label: t('run') },
    { key: 'nutrition', label: t('nutrition') },
    { key: 'health', label: t('health') },
    { key: 'drinks', label: `${t('water')} & ${t('coffee')}` },
    { key: 'supplements', label: t('supplements') },
  ];
  const sections = allSections.filter((s) => availability[s.key]);

  return (
    <NutritionPage title={t('shareDay')} backColor={palette.yellow}>
      <View style={styles.modeRow}>
        {([false, true] as const).map((value) => {
          const selected = detailed === value;
          return (
            <Pressable
              key={String(value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setDetailed(value)}
              style={[styles.modeButton, selected && styles.modeButtonSelected]}>
              <ThemedText style={[styles.modeLabel, selected && styles.modeLabelSelected]}>
                {(value ? t('detailed') : t('basic')).toUpperCase()}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {backgroundUri ? (
        // The photo already shows on the card itself right below — small
        // icon-only controls (change/remove/text-theme) instead of a second
        // thumbnail plus stacked full-width button rows.
        <View style={styles.iconRow}>
          <Pressable onPress={pickBackground} accessibilityLabel="Arka planı değiştir" style={styles.iconButton}>
            <ThemedText style={styles.iconGlyph}>↻</ThemedText>
          </Pressable>
          <Pressable onPress={removeBackground} accessibilityLabel="Arka planı kaldır" style={styles.iconButton}>
            <TrashIcon size={16} color={palette.red} />
          </Pressable>
          <View style={styles.iconDivider} />
          {(['light', 'dark'] as const).map((mode) => {
            const selected = textTheme === mode;
            return (
              <Pressable
                key={mode}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={mode === 'light' ? 'Açık metin' : 'Koyu metin'}
                onPress={() => setTextTheme(mode)}
                style={[styles.swatch, mode === 'light' ? styles.swatchLight : styles.swatchDark, selected && styles.swatchSelected]}
              />
            );
          })}
        </View>
      ) : (
        <Pressable onPress={pickBackground} style={styles.backgroundButton}>
          <ThemedText style={styles.backgroundButtonLabel}>+ ARKA PLAN FOTOĞRAFI EKLE</ThemedText>
        </Pressable>
      )}

      <View style={styles.cardWrapper}>
        {/* transform:scale shrinks the paint but NOT the layout box, so this
            wrapper is sized to the actual scaled-down pixels, transformOrigin
            pinned to its top-left corner. */}
        <View style={{ width: SHARE_CARD_WIDTH * previewScale, height: SHARE_CARD_HEIGHT * previewScale }}>
          <View
            style={{
              width: SHARE_CARD_WIDTH,
              height: SHARE_CARD_HEIGHT,
              transform: [{ scale: previewScale }],
              transformOrigin: 'top left',
            }}>
            <DaySummaryShareCard dateLabel={formatDayMonth(day.date)} blocks={blocks} backgroundUri={backgroundUri} textTheme={textTheme} />
          </View>
        </View>
      </View>

      {/* Full-size, off-screen twin of the card above — captureRef reads
          straight from the native view's own rendered pixels, so capturing
          the scaled-down preview instead would just upscale an already-
          shrunk (blurry) image. This one is never shown, only captured. */}
      <View style={styles.offscreenCapture} pointerEvents="none">
        <DaySummaryShareCard ref={cardRef} dateLabel={formatDayMonth(day.date)} blocks={blocks} backgroundUri={backgroundUri} textTheme={textTheme} />
      </View>

      <View style={styles.chipsWrap}>
        {sections.map((section) => {
          const selected = included[section.key];
          return (
            <Pressable
              key={section.key}
              onPress={() => setIncluded((prev) => ({ ...prev, [section.key]: !prev[section.key] }))}
              style={[styles.chip, selected && styles.chipSelected]}>
              <ThemedText style={[styles.chipLabel, selected && styles.chipLabelSelected]} numberOfLines={1}>
                {section.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <Pressable onPress={share} disabled={sharing || blocks.length === 0} style={[styles.shareButton, (sharing || blocks.length === 0) && styles.shareButtonDisabled]}>
        {sharing ? <ActivityIndicator color={palette.background} /> : <ThemedText style={styles.shareButtonLabel}>{t('share').toUpperCase()}</ThemedText>}
      </Pressable>
    </NutritionPage>
  );
}

// swatchLight/swatchDark stay fixed white/near-black regardless of app
// theme — they're the card's own text-theme picker (light text vs dark
// text over the poster's background photo), not the app's light/dark mode.
const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({
  modeRow: { flexDirection: 'row', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 3, marginTop: Spacing.two },
  modeButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  modeButtonSelected: { backgroundColor: palette.yellow },
  modeLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 },
  modeLabelSelected: { color: palette.background },
  backgroundButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    marginTop: Spacing.two,
  },
  backgroundButtonLabel: { color: palette.yellow, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 1 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, marginTop: Spacing.two },
  iconButton: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, alignItems: 'center', justifyContent: 'center' },
  iconGlyph: { color: palette.yellow, fontFamily: Fonts.technical, fontSize: 15 },
  iconDivider: { width: 1, height: 20, backgroundColor: palette.border, marginHorizontal: Spacing.half },
  swatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: palette.border },
  swatchLight: { backgroundColor: '#FFFFFF' },
  swatchDark: { backgroundColor: '#14141A' },
  swatchSelected: { borderWidth: 2, borderColor: palette.yellow },
  cardWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  offscreenCapture: { position: 'absolute', top: -10000, left: 0 },
  // Two-column grid rather than free-flowing wrap pills — with a variable
  // (1-6) number of sections, free wrap could leave an awkward "4 on one
  // row, 1 alone on the next" line; a fixed 2-up grid always reads evenly.
  // justifyContent:'center' (with an explicit gap, since centering doesn't
  // get space-between's automatic one) means a lone odd-one-out chip on the
  // last row centers itself between the two above it, instead of hugging
  // the left edge under its neighbor. Selected state is an outline
  // (border+text), not a solid fill, so these read as a distinct control
  // from the solid-yellow Paylaş button below.
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.two, marginTop: Spacing.two },
  chip: {
    width: '46%',
    minHeight: 40,
    paddingHorizontal: Spacing.two,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { borderColor: palette.yellow },
  chipLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 11, letterSpacing: 0.4 },
  chipLabelSelected: { color: palette.yellow },
  shareButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.yellow, marginTop: Spacing.two },
  shareButtonDisabled: { opacity: 0.5 },
  shareButtonLabel: { color: palette.background, fontFamily: Fonts.technical, fontSize: 11, letterSpacing: 1 },
});

import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Animated, Alert, AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SwipeableRow } from '@/components/swipeable-row';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ThemedText as AppThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { nutritionPalette, TrashIcon } from '@/components/nutrition-ui';
import { useActiveCardioSession, useImportCardioSessionFromHealthConnect } from '@/db/queries/cardio';
import {
  useAddCoffee,
  useAddWater,
  useCheckinHistory,
  useRemoveLastCoffee,
  useRemoveWaterLog,
  useSaveCheckin,
  useTodayCheckin,
  useTodayCoffeeCount,
  useTodayWater,
} from '@/db/queries/daily';
import { useHealthMetricsDaily } from '@/db/queries/health-metrics';
import { useDayNotes, useSaveDayNote } from '@/db/queries/day-notes';
import { useTodayNutritionLogs } from '@/db/queries/nutrition';
import { useRemoveSupplementCategory, useRenameSupplementCategory, useSupplementCategories } from '@/db/queries/supplement-categories';
import { useSettings } from '@/db/queries/settings';
import {
  useAddSupplementLog,
  useRemoveSupplement,
  useRemoveSupplementLog,
  useSupplements,
  useTodaySupplementLogs,
  useUpdateSupplementLog,
} from '@/db/queries/supplements';
import { useActiveSession, useImportWorkoutSessionFromHealthConnect } from '@/db/queries/workout';
import {
  useDailySteps,
  useDismissWatchNotice,
  useHealthConnectSleep,
  useHealthConnectWeight,
  useSyncDailyHealthMetrics,
  useUnhandledWatchSessions,
  useWatchImportNotices,
} from '@/hooks/use-health-connect';
import {
  addMinutesToTime,
  dateStringFromDate,
  formatClockTime,
  formatSleepDuration,
  getTodayDateString,
  sleepDurationHours,
} from '@/lib/date';
import { resolveWatchSessionRoute, watchExerciseTypeLabel } from '@/lib/health-connect';
import { fromKg, toKg } from '@/lib/units';
import { recordWatchSessionImported } from '@/lib/watch-import-store';
import { summarizeNutritionLogs } from '@/lib/nutrition';
import type { ActivityType } from '@/lib/activity-type';
import { useT } from '@/lib/i18n';

const WATER_QUICK_ADD_ML = [200, 330, 500];
const STRESS_LEVELS = Array.from({ length: 5 }, (_, i) => i + 1);
const ACTIVITY_START_OPTIONS: { type: ActivityType; label: string; code: string }[] = [
  { type: 'run', label: 'Run', code: 'RUN' },
  { type: 'swim', label: 'Swim', code: 'SWM' },
  { type: 'bike', label: 'Bike', code: 'BIKE' },
  { type: 'motor', label: 'Motorcycle', code: 'MOTO' },
];

// Today used to hardcode the (dark-only) Nutrition palette regardless of the
// user's Light/Dark/System setting — this is the pilot for making it actually
// theme-aware, starting with this one screen. Dark keeps the exact values it
// always had; Light is a new palette, not just Colors.light reused verbatim,
// because Today also needs category-accent colors (mint/coral/violet/yellow)
// that Colors.light doesn't define. Every accent below was deliberately
// darkened from its dark-mode value (which was tuned to pop off a near-black
// background) to keep ~4.5:1 contrast against the light background — the
// dark-mode values (e.g. nutritionPalette.yellow #F5C84C) are pale and would
// be nearly invisible text on this light surface otherwise.
const todayThemeDark = {
  text: nutritionPalette.text,
  background: nutritionPalette.background,
  backgroundElement: nutritionPalette.card,
  backgroundSelected: nutritionPalette.raised,
  textSecondary: nutritionPalette.muted,
  border: nutritionPalette.border,
  accent: nutritionPalette.blue,
  accentOn: nutritionPalette.background,
  destructive: nutritionPalette.red,
  coral: '#F75C57',
  mint: '#42E2AD',
  violet: '#A78BFA',
  yellow: nutritionPalette.yellow,
  sleepDeep: '#438FFF',
  sleepLight: '#ABC7FF',
};

const todayThemeLight = {
  text: '#14171A',
  // v2 (2026-09-13, user-picked from a 3-way A/B/C comparison mockup):
  // white cards floating on a soft warm-gray canvas, separated by
  // cardShadowFor's shadow rather than a strong border — a "paper on
  // paper" look (Notion/Linear-style) instead of the v1 all-beige card+bg
  // pairing, which read as flat/muddy despite the color step. `border`
  // stays light on purpose now that shadow carries the separation.
  background: '#F1F0ED',
  backgroundElement: '#FFFFFF',
  backgroundSelected: '#F6F5F2',
  // Not a muted gray at all, by explicit request: this technical/dense
  // design uses textSecondary for small all-caps labels (SU, KİLO, UYKU,
  // GÜN NOTU, TAKVİYE category names…) that need to read as confident
  // headings, not de-emphasized metadata. A mid-gray (#6B7078) and even a
  // darker charcoal (#3A3D42) both still read as "washed out" next to
  // `text` at this small, thin, all-caps mono weight — so this is now the
  // same near-black as `text`, just very slightly softer.
  textSecondary: '#1C1E21',
  // v1 pushed this dark (#8C8676) to hit ≥3:1 on its own, back when the
  // border was the only thing separating a card from the background. Now
  // that white cards sit on a visibly different gray canvas AND get a
  // shadow, the border only needs to be a quiet hairline — a dark one here
  // now reads as a heavy outline competing with the shadow.
  border: '#DEDBD3',
  // Every accent below is the SAME hue/saturation as its dark-mode value
  // (nutritionPalette's blue/mint/coral/violet/yellow), just relit to a
  // darker lightness for light-background contrast — picked by converting
  // dark-mode hex to HSL and lowering L only, rather than swapping in
  // unrelated shades (e.g. a generic Tailwind blue). Keeping the same
  // hue/chroma is what makes this read as "the same palette, adapted" and
  // not a different app in light mode. All ≥3:1 against `background`
  // (≥4.5:1 for accent/coral/violet, which also carry small text).
  accent: '#0061EB',
  accentOn: '#FFFFFF',
  // Same near-duplicate relationship as dark mode's destructive/coral pair
  // (#FF625C vs #F75C57 — barely distinguishable on purpose): relit from
  // nutritionPalette.red's hue, not a generic destructive red.
  destructive: '#F50900',
  coral: '#EA120B',
  mint: '#168D66',
  violet: '#400AE1',
  yellow: '#AE820A',
  sleepDeep: '#005FEB',
  sleepLight: '#5C92FF',
};

type TodayTheme = typeof todayThemeDark;

// Two fixed-alpha tints (mint/blue tag backgrounds) were hardcoded to the
// dark-mode hex values — harmless on the near-black dark background, but a
// mismatched tint color once the light palette's mint/accent are different
// hues. Deriving the tint from the current theme keeps it correct in both.
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function useTodayTheme(): TodayTheme {
  const nativeScheme = useColorScheme();
  // On web, Settings' theme picker can't call Appearance.setColorScheme (see
  // that screen's comment on this) — react-native-web's useColorScheme only
  // ever reflects the OS/browser prefers-color-scheme, never the in-app
  // choice. Reading settings.themeMode directly here is what makes "Açık"
  // actually take effect on web; on native, Appearance.setColorScheme already
  // updates what useColorScheme() itself reports, so this is just a superset.
  const { data: settings } = useSettings();
  const mode = settings?.themeMode;
  const resolved = mode === 'light' || mode === 'dark' ? mode : nativeScheme === 'dark' ? 'dark' : 'light';
  return resolved === 'dark' ? todayThemeDark : todayThemeLight;
}

// The rest of the app still supports Light/Dark/System — Today now does too,
// via useTodayTheme() above, rather than a fixed dark-only palette.
function ThemedText({ style, themeColor, ...props }: ComponentProps<typeof AppThemedText>) {
  const theme = useTodayTheme();
  const styles = useTodayStyles(theme);
  const color = themeColor ? theme[themeColor] : theme.text;
  return <AppThemedText {...props} style={[styles.defaultText, { color }, style]} />;
}

function TextIcon({ children, tone = 'default' }: { children: string; tone?: 'default' | 'accent' | 'muted' | 'onAccent' }) {
  const theme = useTodayTheme();
  const styles = useTodayStyles(theme);
  const color = tone === 'accent'
    ? theme.accent
    : tone === 'muted'
      ? theme.textSecondary
      : tone === 'onAccent'
        ? theme.accentOn
        : theme.text;
  return <ThemedText style={[styles.textIcon, { color }]}>{children}</ThemedText>;
}

export default function TodayScreen() {
  const { t, language } = useT();
  const theme = useTodayTheme();
  const styles = useTodayStyles(theme);
  const [activityMenuVisible, setActivityMenuVisible] = useState(false);
  const [metricEditor, setMetricEditor] = useState<'water' | 'weight' | 'stress' | 'coffee' | 'nutrition' | null>(null);
  const [manualSleep, setManualSleep] = useState<{ bedTime: string; wakeTime: string; sleepHours: number } | null>(null);
  const [dayNote, setDayNote] = useState('');
  const [waterUndo, setWaterUndo] = useState<{ id: string; amountMl: number } | null>(null);
  const waterUndoOpacity = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  // Tabs stay mounted when you switch away, so without this the scroll
  // position from before you left is still there when you come back —
  // reset to top every time this tab regains focus.
  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [])
  );

  // Re-render on foreground so a midnight rollover while backgrounded (date
  // label + every "today"-scoped query, which all call getTodayDateString()
  // fresh on each render) picks up the new day instead of showing yesterday's.
  const [, forceRerender] = useState(0);
  const syncDailyHealthMetrics = useSyncDailyHealthMetrics();
  useEffect(() => {
    // Covers a cold app open that's never backgrounded/foregrounded in the
    // same session — the AppState listener below only fires on that
    // transition, so without this a day where Compos is opened exactly
    // once would never sync at all.
    syncDailyHealthMetrics().catch(() => {});
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        forceRerender((n) => n + 1);
        // This foreground moment doubles as the trigger for the once-a-day
        // web snapshot (see useSyncDailyHealthMetrics) — no separate
        // background task, and no-ops harmlessly on web.
        syncDailyHealthMetrics().catch(() => {});
      }
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The AppState listener above only fires on background->active, so it
  // misses the case where the screen is left open continuously across
  // midnight (never backgrounded). A cheap once-a-minute check closes that
  // gap — only forces a render on the one tick where the date actually
  // changed, not every minute.
  const lastKnownDateRef = useRef(getTodayDateString());
  useEffect(() => {
    const interval = setInterval(() => {
      const today = getTodayDateString();
      if (today !== lastKnownDateRef.current) {
        lastKnownDateRef.current = today;
        forceRerender((n) => n + 1);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, []);
  const todayLabel = new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-US', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date());

  const { data: checkin } = useTodayCheckin();
  const saveCheckin = useSaveCheckin();
  const { data: dayNotes = [] } = useDayNotes();
  const saveDayNote = useSaveDayNote();
  const { data: waterTotal = 0 } = useTodayWater();
  const addWater = useAddWater();
  const removeWaterLog = useRemoveWaterLog();
  const { data: coffeeCount = 0 } = useTodayCoffeeCount();
  const addCoffee = useAddCoffee();
  const removeLastCoffee = useRemoveLastCoffee();
  const { data: nutritionLogs = [] } = useTodayNutritionLogs();
  const { data: activeSession } = useActiveSession();
  const { data: activeCardioSession } = useActiveCardioSession();
  const { data: settings } = useSettings();
  const waterGoalMl = settings?.waterGoalMl ?? 2500;
  const unit = settings?.unit ?? 'kg';
  const { data: steps } = useDailySteps(getTodayDateString());
  const { data: healthSleep } = useHealthConnectSleep(getTodayDateString());
  const { data: webHealthMetrics } = useHealthMetricsDaily(getTodayDateString());
  // Stage breakdown is Health Connect-only data — native reads it live
  // (healthSleep, same as the bedTime/wakeTime steppers above), web reads
  // the synced snapshot instead, same split as the hooks in
  // use-health-connect.ts.
  const sleepStages = Platform.OS === 'web' ? webHealthMetrics?.sleepStages : healthSleep?.stages;
  const { data: healthWeight } = useHealthConnectWeight(getTodayDateString());
  const todayDayNote = dayNotes.find((item) => item.date === getTodayDateString())?.note ?? '';
  const nutritionTotals = summarizeNutritionLogs(nutritionLogs).totals;

  useEffect(() => {
    if (!waterUndo) return;
    waterUndoOpacity.setValue(0);
    Animated.timing(waterUndoOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
    const timeout = setTimeout(() => {
      Animated.timing(waterUndoOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setWaterUndo(null);
      });
    }, 5000);
    return () => clearTimeout(timeout);
  }, [waterUndo, waterUndoOpacity]);

  const quickAddWater = async (amountMl: number) => {
    const id = await addWater.mutateAsync({ amountMl });
    setWaterUndo({ id, amountMl });
  };

  const undoWaterAdd = async () => {
    if (!waterUndo) return;
    await removeWaterLog.mutateAsync(waterUndo.id);
    setWaterUndo(null);
  };

  const saveCurrentDayNote = () => {
    if (dayNote === todayDayNote || saveDayNote.isPending) return;
    saveDayNote.mutate({ date: getTodayDateString(), note: dayNote.trim() || null });
  };

  const { data: todaySupplements = [] } = useTodaySupplementLogs();
  const { data: allSupplements = [] } = useSupplements();
  const { data: supplementCategories = [] } = useSupplementCategories();
  const removeSupplementCategory = useRemoveSupplementCategory();
  const addSupplementLog = useAddSupplementLog();
  const removeSupplement = useRemoveSupplement();
  const removeSupplementLog = useRemoveSupplementLog();
  const { data: checkinHistory = [] } = useCheckinHistory();
  const { data: watchSessions = [] } = useUnhandledWatchSessions();
  const { data: watchNotices = [] } = useWatchImportNotices();
  const importCardioSession = useImportCardioSessionFromHealthConnect();
  const importWorkoutSession = useImportWorkoutSessionFromHealthConnect();
  const dismissWatchNotice = useDismissWatchNotice();
  const queryClient = useQueryClient();

  // A route needing Android's one-time exercise-route consent dialog can
  // only be requested in direct response to a user gesture (Android's own
  // rule, not ours) — those sessions are excluded here and still shown with
  // a manual "Aktar" button below. Everything else needs no confirmation:
  // it's imported the moment it's detected, and only surfaces afterward as
  // a dismissible "eklendi" notice (see watch-import-store.ts) — Kağan
  // asked for the confirmation step to go away entirely for the common
  // case, keeping it around only where the OS forces a prompt.
  const autoImportableSessions = watchSessions.filter((session) => session.routeAvailability !== 'consent-required');
  const consentRequiredSessions = watchSessions.filter((session) => session.routeAvailability === 'consent-required');
  const autoImportingIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const session of autoImportableSessions) {
      if (autoImportingIdsRef.current.has(session.id)) {
        continue;
      }
      autoImportingIdsRef.current.add(session.id);
      (async () => {
        try {
          const date = dateStringFromDate(new Date(session.startTime));
          const name = watchExerciseTypeLabel(session.exerciseType);
          if (session.isCardio) {
            const routePoints = await resolveWatchSessionRoute(session);
            const created = await importCardioSession.mutateAsync({
              date,
              name,
              startedAt: session.startTime,
              finishedAt: session.endTime,
              route: routePoints,
              activityType: session.activityType,
              details: session.details,
            });
            if (created) {
              await recordWatchSessionImported({
                id: session.id,
                label: name,
                startTime: session.startTime,
                endTime: session.endTime,
                kind: 'cardio',
                composSessionId: String(created.id),
              });
            }
          } else {
            const created = await importWorkoutSession.mutateAsync({
              date,
              name,
              startedAt: session.startTime,
              finishedAt: session.endTime,
            });
            if (created) {
              await recordWatchSessionImported({
                id: session.id,
                label: name,
                startTime: session.startTime,
                endTime: session.endTime,
                kind: 'workout',
                composSessionId: String(created.id),
              });
            }
          }
        } finally {
          autoImportingIdsRef.current.delete(session.id);
          queryClient.invalidateQueries({ queryKey: ['health-connect', 'watch-sessions'] });
          queryClient.invalidateQueries({ queryKey: ['health-connect', 'watch-notices'] });
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoImportableSessions.map((s) => s.id).join(',')]);

  const [importingConsentId, setImportingConsentId] = useState<string | null>(null);
  const importConsentRequiredSession = async (session: (typeof consentRequiredSessions)[number]) => {
    setImportingConsentId(session.id);
    try {
      const date = dateStringFromDate(new Date(session.startTime));
      const name = watchExerciseTypeLabel(session.exerciseType);
      const routePoints = await resolveWatchSessionRoute(session);
      const created = await importCardioSession.mutateAsync({
        date,
        name,
        startedAt: session.startTime,
        finishedAt: session.endTime,
        route: routePoints,
        activityType: session.activityType,
        details: session.details,
      });
      if (created) {
        await recordWatchSessionImported({
          id: session.id,
          label: name,
          startTime: session.startTime,
          endTime: session.endTime,
          kind: 'cardio',
          composSessionId: String(created.id),
        });
        queryClient.invalidateQueries({ queryKey: ['health-connect', 'watch-sessions'] });
        router.push({ pathname: '/run/summary/[id]', params: { id: String(created.id) } });
      }
    } finally {
      setImportingConsentId(null);
    }
  };

  // Uses the same day_notes row as History's day detail. A short debounce
  // means the note survives leaving Today without requiring a separate save
  // button, while History receives the fresh query value after the mutation.
  useEffect(() => {
    setDayNote(todayDayNote);
  }, [todayDayNote]);

  useEffect(() => {
    if (dayNote === todayDayNote || saveDayNote.isPending) return;
    const timer = setTimeout(() => {
      saveDayNote.mutate({ date: getTodayDateString(), note: dayNote.trim() || null });
    }, 800);
    return () => clearTimeout(timer);
  }, [dayNote, todayDayNote, saveDayNote.isPending]);

  // Stress level rarely changes day to day, so re-picking it every single
  // day was pure friction — carries forward the most recent day's value
  // automatically once today's own row has loaded and genuinely has none
  // yet (checkin === undefined means "still loading", not "no row"; a
  // stressLevel that's already set, even from a previous run of this same
  // effect, must never be silently overwritten). This writes a REAL value
  // into today's row (not just a display-only default) via the same
  // useSaveCheckin path as tapping a chip by hand, so trend charts still
  // see a continuous history and the value stays exactly as
  // user-changeable as ever — tapping a different chip today only ever
  // touches today's row, same as before this existed.
  useEffect(() => {
    if (checkin === undefined || checkin?.stressLevel != null) {
      return;
    }
    const today = getTodayDateString();
    const mostRecent = checkinHistory.find((day) => day.date !== today && day.stressLevel != null);
    if (mostRecent) {
      saveCheckin.mutate({ stressLevel: mostRecent.stressLevel });
    }
  }, [checkin, checkinHistory]);

  // A verified Health Connect sleep session is the source of truth for the
  // night that ended today. Previously an old manual check-in won forever as
  // soon as it had *any* times, leaving the Today dashboard stuck at values
  // such as 00:30–08:30 even after the watch supplied the real session.
  useEffect(() => {
    if (!healthSleep || checkin === undefined) {
      return;
    }
    if (
      checkin?.bedTime === healthSleep.bedTime &&
      checkin?.wakeTime === healthSleep.wakeTime &&
      checkin?.sleepHours === healthSleep.sleepHours &&
      checkin?.napHours === healthSleep.napHours
    ) return;
    saveCheckin.mutate({
      bedTime: healthSleep.bedTime,
      wakeTime: healthSleep.wakeTime,
      sleepHours: healthSleep.sleepHours,
      napHours: healthSleep.napHours,
    });
  }, [checkin, healthSleep]);

  const loggedSupplementIds = new Set(todaySupplements.map((log) => log.supplementId));
  const todaySupplementById = new Map(todaySupplements.map((log) => [log.supplementId, log]));
  // The visible checklist is the saved daily routine, plus a non-routine item
  // if it was explicitly logged today. This keeps the main screen focused
  // while never hiding a supplement the user already recorded.
  const routineSupplements = allSupplements.filter((supplement) => supplement.isDefault || loggedSupplementIds.has(supplement.id));
  // "Uncategorized" only shows up here as a fallback for items that slip
  // through with no category row (a new supplement saved without picking
  // one, or one orphaned by deleting its category) — it's hidden when
  // empty since it isn't a real, manageable category (see
  // ensureUncategorizedSupplementCategory for the one-time backfill that
  // turns the ORIGINAL uncategorized items into a real, renamable one).
  const uncategorizedSupplements = routineSupplements.filter((supplement) => supplement.categoryId == null);
  // Same restrained accent-per-section language as the metric tiles above
  // (colored left border only, label stays neutral) — cycles through the
  // app's small fixed tone set so categories read as distinct at a glance
  // without turning the list into a rainbow.
  const categoryAccentPalette = [theme.accent, theme.mint, theme.coral, theme.violet];
  const supplementGroups = [
    ...supplementCategories.map((category, index) => ({ id: category.id, label: category.name, isCustom: true, accentColor: categoryAccentPalette[index % categoryAccentPalette.length], supplements: routineSupplements.filter((supplement) => supplement.categoryId === category.id) })),
    ...(uncategorizedSupplements.length > 0 ? [{ id: 'uncategorized', label: t('uncategorized'), isCustom: false, accentColor: theme.border, supplements: uncategorizedSupplements }] : []),
  ];
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryNameDraft, setCategoryNameDraft] = useState('');
  const renameCategory = useRenameSupplementCategory();
  const saveCategoryName = (id: string) => {
    const trimmed = categoryNameDraft.trim();
    if (trimmed) renameCategory.mutate({ id, name: trimmed });
    setEditingCategoryId(null);
  };
  const deleteSupplementCategory = (id: string, name: string) => {
    const confirmed = () => removeSupplementCategory.mutate(id);
    if (Platform.OS === 'web') {
      if (window.confirm(`${t('deleteSupplementCategoryTitle')}\n\n"${name}" — ${t('deleteSupplementCategoryMessage')}`)) confirmed();
      return;
    }
    Alert.alert(t('deleteSupplementCategoryTitle'), `"${name}" — ${t('deleteSupplementCategoryMessage')}`, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('deleteSupplementCategoryTitle'), style: 'destructive', onPress: confirmed },
    ]);
  };
  const deleteSupplement = (id: string, name: string) => {
    const confirmed = () => removeSupplement.mutate(id);
    if (Platform.OS === 'web') {
      if (window.confirm(`Remove ${name}? This will permanently remove its dose history too.`)) confirmed();
      return;
    }
    Alert.alert('Remove supplement', `Remove ${name} and its dose history?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: confirmed },
    ]);
  };

  const startWorkout = () => {
    if (activeSession) {
      router.push({ pathname: '/workout/[sessionId]', params: { sessionId: String(activeSession.id) } });
      return;
    }
    router.push('/workout/start');
  };

  const startActivity = (activityType: ActivityType) => {
    if (activeCardioSession) {
      router.push({ pathname: '/run/[sessionId]', params: { sessionId: String(activeCardioSession.id) } });
      return;
    }
    setActivityMenuVisible(false);
    router.push({ pathname: '/run/start', params: { activityType } });
  };

  const bedTime = manualSleep?.bedTime ?? healthSleep?.bedTime ?? checkin?.bedTime ?? null;
  const wakeTime = manualSleep?.wakeTime ?? healthSleep?.wakeTime ?? checkin?.wakeTime ?? null;
  const sleepHours = manualSleep?.sleepHours ?? healthSleep?.sleepHours ?? (bedTime && wakeTime ? sleepDurationHours(bedTime, wakeTime) : null);
  const stressLevel = checkin?.stressLevel ?? null;

  const defaultBedTime = settings?.defaultBedTime ?? '23:00';
  const defaultWakeTime = settings?.defaultWakeTime ?? '07:00';

  const adjustBedTime = (deltaMinutes: number) => {
    const nextBedTime = addMinutesToTime(bedTime ?? defaultBedTime, deltaMinutes);
    const nextWakeTime = wakeTime ?? defaultWakeTime;
    const nextSleep = {
      bedTime: nextBedTime,
      wakeTime: nextWakeTime,
      sleepHours: sleepDurationHours(nextBedTime, nextWakeTime),
    };
    setManualSleep(nextSleep);
    saveCheckin.mutate(nextSleep);
  };

  const adjustWakeTime = (deltaMinutes: number) => {
    const nextBedTime = bedTime ?? defaultBedTime;
    const nextWakeTime = addMinutesToTime(wakeTime ?? defaultWakeTime, deltaMinutes);
    const nextSleep = {
      bedTime: nextBedTime,
      wakeTime: nextWakeTime,
      sleepHours: sleepDurationHours(nextBedTime, nextWakeTime),
    };
    setManualSleep(nextSleep);
    saveCheckin.mutate(nextSleep);
  };

  const weightKg = checkin?.weightKg ?? null;
  const displayWeight = weightKg !== null ? fromKg(weightKg, unit) : null;

  const adjustWeight = (delta: number) => {
    const base = displayWeight ?? fromKg(70, unit);
    const next = Math.max(0, Math.round((base + delta) * 10) / 10);
    saveCheckin.mutate({ weightKg: toKg(next, unit) });
  };

  const cardStyle = styles.card;

  return (
    <ThemedView lightColor={theme.background} darkColor={theme.background} style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.topBar}>
          <ThemedText style={styles.wordmark}>COMPOS</ThemedText>
          <ThemedText style={styles.topBarLabel}>{t('dailySummary').toUpperCase()}</ThemedText>
        </View>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.titleBlock}>
            <ThemedText style={styles.dateLabel}>{todayLabel.toUpperCase()}</ThemedText>
            <ThemedText style={styles.todayTitle}>{t('today').toUpperCase()}</ThemedText>
          </View>

          <View style={styles.startButtonRow}>
            <Pressable
              onPress={startWorkout}
              style={styles.startButton}>
              <TextIcon tone="onAccent">+</TextIcon>
              <ThemedText type="smallBold" style={{ color: theme.accentOn }}>
                {(activeSession ? t('resumeWorkout') : t('startWorkout')).toUpperCase()}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => {
                if (activeCardioSession) {
                  startActivity(activeCardioSession.activityType ?? 'run');
                } else {
                  setActivityMenuVisible(true);
                }
              }}
              style={[styles.startButton, styles.secondaryStartButton]}>
              <TextIcon tone="accent">+</TextIcon>
              <ThemedText type="smallBold" style={{ color: theme.text }}>
                {(activeCardioSession ? t('resumeActivity') : t('startActivity')).toUpperCase()}
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.bentoGrid}>
            <MetricTile label={t('water').toUpperCase()} value={`${Math.round(waterTotal / 100) / 10}L`} tone="blue" onPress={() => setMetricEditor('water')} />
            <MetricTile label={t('steps').toUpperCase()} value={steps != null ? steps.toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US') : '—'} tone="mint" />
            <MetricTile label={t('weight').toUpperCase()} value={displayWeight !== null ? `${displayWeight} ${unit}` : '—'} tone="default" onPress={() => setMetricEditor('weight')} />
            <MetricTile label={t('stress').toUpperCase()} value={stressLevel !== null ? `${stressLevel}/5` : '—'} tone="red" onPress={() => setMetricEditor('stress')} />
            <MetricTile label={t('coffee').toUpperCase()} value={`${coffeeCount}`} tone="yellow" onPress={() => setMetricEditor('coffee')} />
            <MetricTile label={t('nutrition').toUpperCase()} value={`${Math.round(nutritionTotals.kcal)} KCAL`} tone="violet" onPress={() => setMetricEditor('nutrition')} />
          </View>

          <View style={styles.dayNoteCard}>
            <View style={styles.cardHeaderRow}>
              <ThemedText type="smallBold" themeColor="textSecondary">{t('dayNote').toUpperCase()}</ThemedText>
            </View>
            <TextInput
              accessibilityLabel="Day note"
              value={dayNote}
              onChangeText={setDayNote}
              onEndEditing={saveCurrentDayNote}
              onBlur={saveCurrentDayNote}
              placeholder={t('writeNote')}
              placeholderTextColor={theme.textSecondary}
              multiline
              style={styles.dayNoteInput}
            />
          </View>

          <Modal
            transparent
            visible={activityMenuVisible}
            animationType="fade"
            onRequestClose={() => setActivityMenuVisible(false)}>
            <Pressable style={styles.activityMenuBackdrop} onPress={() => setActivityMenuVisible(false)}>
              <Pressable
                style={styles.activityMenu}
                onPress={(event) => event.stopPropagation()}>
                <View style={styles.activityMenuHeader}>
                  <ThemedText style={styles.modalTitle}>{t('chooseActivity').toUpperCase()}</ThemedText>
                  <Pressable accessibilityLabel="Close" onPress={() => setActivityMenuVisible(false)} hitSlop={10}>
                    <TextIcon tone="muted">×</TextIcon>
                  </Pressable>
                </View>
                {ACTIVITY_START_OPTIONS.map((option) => (
                  <Pressable
                    key={option.type}
                    onPress={() => startActivity(option.type)}
                    style={[styles.activityMenuOption, { backgroundColor: theme.backgroundSelected }]}>
                    <ThemedText style={styles.activityCode}>{option.code}</ThemedText>
                    <ThemedText type="default">{t(option.type === 'motor' ? 'motorcycle' : option.type)}</ThemedText>
                  </Pressable>
                ))}
              </Pressable>
            </Pressable>
          </Modal>

          <Modal
            transparent
            visible={metricEditor !== null}
            animationType="fade"
            onRequestClose={() => setMetricEditor(null)}>
            <Pressable style={styles.metricEditorBackdrop} onPress={() => setMetricEditor(null)}>
              <Pressable style={styles.metricEditor} onPress={(event) => event.stopPropagation()}>
                <View style={styles.activityMenuHeader}>
                  <ThemedText style={styles.modalTitle}>
                    {(metricEditor === 'water' ? t('water') : metricEditor === 'weight' ? t('weight') : metricEditor === 'stress' ? t('stress') : metricEditor === 'coffee' ? t('coffee') : t('nutrition')).toUpperCase()}
                  </ThemedText>
                  <Pressable accessibilityLabel="Close" onPress={() => setMetricEditor(null)} hitSlop={10}>
                    <TextIcon tone="muted">×</TextIcon>
                  </Pressable>
                </View>

                {metricEditor === 'water' && (
                  <>
                    <ThemedText style={styles.editorMetricValue}>{waterTotal} ML</ThemedText>
                    <ThemedText style={styles.editorSupportingText}>{waterGoalMl} ML {t('dailyGoal').toUpperCase()}</ThemedText>
                    <View style={styles.editorOptionRow}>
                      {WATER_QUICK_ADD_ML.map((amount) => (
                        <Pressable key={amount} onPress={() => quickAddWater(amount)} style={styles.editorOption}>
                          <ThemedText type="smallBold">+{amount} ML</ThemedText>
                        </Pressable>
                      ))}
                    </View>
                    {waterUndo && (
                      <Animated.View style={[styles.waterUndo, { opacity: waterUndoOpacity }]}>
                        <ThemedText style={styles.waterUndoAmount}>+{waterUndo.amountMl} ML {t('added').toUpperCase()}</ThemedText>
                        <Pressable accessibilityLabel="Undo water addition" onPress={undoWaterAdd} hitSlop={8}>
                          <ThemedText style={styles.waterUndoAction}>{t('undo').toUpperCase()} ×</ThemedText>
                        </Pressable>
                      </Animated.View>
                    )}
                  </>
                )}

                {metricEditor === 'weight' && (
                  <>
                    <View style={styles.editorStepperRow}>
                      <Pressable accessibilityLabel="Decrease weight" onPress={() => adjustWeight(-0.1)} hitSlop={10} style={styles.stepperButton}><TextIcon>−</TextIcon></Pressable>
                      <ThemedText style={styles.editorMetricValue}>{displayWeight !== null ? `${displayWeight} ${unit}` : '—'}</ThemedText>
                      <Pressable accessibilityLabel="Increase weight" onPress={() => adjustWeight(0.1)} hitSlop={10} style={styles.stepperButton}><TextIcon>+</TextIcon></Pressable>
                    </View>
                    {healthWeight != null && (
                      <Pressable onPress={() => saveCheckin.mutate({ weightKg: healthWeight })} style={styles.syncMetricButton}>
                        <ThemedText type="smallBold" style={{ color: theme.accentOn }}>USE WATCH WEIGHT</ThemedText>
                      </Pressable>
                    )}
                  </>
                )}

                {metricEditor === 'stress' && (
                  <View style={styles.editorOptionRow}>
                    {STRESS_LEVELS.map((level) => {
                      const selected = stressLevel === level;
                      return <Pressable key={level} onPress={() => saveCheckin.mutate({ stressLevel: level })} style={[styles.stressChip, selected && styles.selectedStressChip]}><ThemedText type="smallBold" style={{ color: selected ? theme.accentOn : theme.text }}>{level}</ThemedText></Pressable>;
                    })}
                  </View>
                )}

                {metricEditor === 'coffee' && (
                  <View style={styles.editorStepperRow}>
                    <Pressable accessibilityLabel="Remove coffee" disabled={coffeeCount === 0} onPress={() => removeLastCoffee.mutate()} style={[styles.stepperButton, coffeeCount === 0 && styles.disabledButton]}><TextIcon>−</TextIcon></Pressable>
                    <ThemedText style={styles.editorMetricValue}>{coffeeCount}</ThemedText>
                    <Pressable accessibilityLabel="Add coffee" onPress={() => addCoffee.mutate()} style={styles.stepperButton}><TextIcon>+</TextIcon></Pressable>
                  </View>
                )}

                {metricEditor === 'nutrition' && (
                  <View style={styles.macroSummary}>
                    <MacroSummary label={t('protein').toUpperCase()} value={`${Math.round(nutritionTotals.protein)} G`} color={theme.mint} />
                    <MacroSummary label={t('carbs').toUpperCase()} value={`${Math.round(nutritionTotals.carbs)} G`} color={theme.accent} />
                    <MacroSummary label={t('fat').toUpperCase()} value={`${Math.round(nutritionTotals.fat)} G`} color={theme.yellow} />
                  </View>
                )}
              </Pressable>
            </Pressable>
          </Modal>

          {/* Already imported automatically — informational only, tap to
              acknowledge. No confirmation step before import itself. */}
          {watchNotices.map((notice) => (
            <Pressable
              key={notice.id}
                  accessibilityLabel="Dismiss notification"
              onPress={() => dismissWatchNotice.mutate(notice.id)}
              style={[cardStyle, { borderColor: theme.accent, borderWidth: 1 }]}>
              <View style={styles.cardHeaderRow}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {t('watchAdded').toUpperCase()}
                </ThemedText>
                <TextIcon tone="muted">×</TextIcon>
              </View>
              <ThemedText type="default">
                {notice.label} · {formatClockTime(notice.startTime)} – {formatClockTime(notice.endTime)}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('watchAddedHint')}
              </ThemedText>
            </Pressable>
          ))}

          {/* Android can only show the one-time route-access dialog in
              direct response to a tap — this is the one case that still
              needs a manual "Aktar" instead of auto-importing. */}
          {consentRequiredSessions.map((session) => (
            <View key={session.id} style={[cardStyle, { borderColor: theme.accent, borderWidth: 1 }]}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {t('activityDetectedByWatch').toUpperCase()}
              </ThemedText>
              <ThemedText type="default">
                {watchExerciseTypeLabel(session.exerciseType)} · {formatClockTime(session.startTime)} –{' '}
                {formatClockTime(session.endTime)}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('routeApprovalRequired')}
              </ThemedText>
              <Pressable
                onPress={() => importConsentRequiredSession(session)}
                disabled={importingConsentId === session.id}
                style={[styles.watchImportButton, { backgroundColor: theme.accent, opacity: importingConsentId === session.id ? 0.6 : 1 }]}>
                <ThemedText type="smallBold" style={{ color: theme.accentOn }}>
                  {importingConsentId === session.id ? t('importing').toUpperCase() : t('importToCompos').toUpperCase()}
                </ThemedText>
              </Pressable>
            </View>
          ))}

          <View style={cardStyle}>
            <View style={styles.cardHeaderRow}>
              <ThemedText type="smallBold" themeColor="textSecondary">{t('sleep').toUpperCase()}</ThemedText>
            </View>
            <View style={styles.sleepFieldRow}>
              <ThemedText type="small" themeColor="textSecondary">{t('bedtime').toUpperCase()}</ThemedText>
              <View style={styles.sleepStepper}>
                <Pressable accessibilityLabel="Move bedtime earlier" onPress={() => adjustBedTime(-15)} hitSlop={10} style={styles.stepperButtonSmall}><TextIcon>−</TextIcon></Pressable>
                <ThemedText type="smallBold" style={styles.sleepTimeValue}>{bedTime ?? defaultBedTime}</ThemedText>
                <Pressable accessibilityLabel="Move bedtime later" onPress={() => adjustBedTime(15)} hitSlop={10} style={styles.stepperButtonSmall}><TextIcon>+</TextIcon></Pressable>
              </View>
            </View>
            <View style={styles.sleepFieldRow}>
              <ThemedText type="small" themeColor="textSecondary">{t('wakeUp').toUpperCase()}</ThemedText>
              <View style={styles.sleepStepper}>
                <Pressable accessibilityLabel="Move wake-up earlier" onPress={() => adjustWakeTime(-15)} hitSlop={10} style={styles.stepperButtonSmall}><TextIcon>−</TextIcon></Pressable>
                <ThemedText type="smallBold" style={styles.sleepTimeValue}>{wakeTime ?? defaultWakeTime}</ThemedText>
                <Pressable accessibilityLabel="Move wake-up later" onPress={() => adjustWakeTime(15)} hitSlop={10} style={styles.stepperButtonSmall}><TextIcon>+</TextIcon></Pressable>
              </View>
            </View>
            {sleepHours !== null && <ThemedText type="small" themeColor="textSecondary" style={styles.sleepTotal}>{t('total').toUpperCase()} {formatSleepDuration(sleepHours)}</ThemedText>}
            {checkin?.napHours != null && <ThemedText type="small" themeColor="textSecondary" style={styles.sleepTotal}>{t('nap').toUpperCase()} {formatSleepDuration(checkin.napHours)}</ThemedText>}
            {sleepStages && <SleepStages stages={sleepStages} />}
          </View>

          <View style={[cardStyle, styles.supplementCard]}>
            <View style={styles.waterHeader}>
              <ThemedText type="smallBold" themeColor="textSecondary">{t('supplementList').toUpperCase()}</ThemedText>
              <Pressable accessibilityLabel="Create supplement" onPress={() => router.push('/supplement/new')} hitSlop={10}>
                <ThemedText style={styles.supplementAddLabel}>{t('new').toUpperCase()}</ThemedText>
              </Pressable>
            </View>

            {routineSupplements.length > 0 || supplementCategories.length > 0 ? (
              <View style={styles.supplementGroupList}>
                {supplementGroups.map((group) => (
                  <View key={group.id} style={[styles.supplementCategoryCard, { borderLeftColor: group.accentColor }]}>
                    <View style={styles.supplementCategoryHeader}>
                      {group.isCustom && editingCategoryId === group.id ? (
                        <TextInput
                          value={categoryNameDraft}
                          onChangeText={setCategoryNameDraft}
                          onEndEditing={() => saveCategoryName(group.id)}
                          onBlur={() => saveCategoryName(group.id)}
                          onSubmitEditing={() => saveCategoryName(group.id)}
                          autoFocus
                          style={styles.supplementCategoryTitleInput}
                        />
                      ) : (
                        <Pressable
                          disabled={!group.isCustom}
                          onPress={() => { setEditingCategoryId(group.id); setCategoryNameDraft(group.label); }}
                          hitSlop={6}
                          style={styles.supplementCategoryTitlePress}>
                          <ThemedText style={styles.supplementCategoryTitle}>{group.label.toUpperCase()}</ThemedText>
                        </Pressable>
                      )}
                      {group.isCustom && (
                        <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${group.label} category`} onPress={() => deleteSupplementCategory(group.id, group.label)} hitSlop={8} style={styles.supplementCategoryDeleteButton}>
                          <TrashIcon size={14} color={theme.textSecondary} />
                        </Pressable>
                      )}
                    </View>
                    {group.supplements.length > 0 ? (
                      <View style={styles.supplementList}>
                        {group.supplements.map((supplement) => {
                          const log = todaySupplementById.get(supplement.id);
                          const taken = log != null;
                          return (
                            <View key={supplement.id} style={styles.supplementChecklistRow}>
                              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: taken }} accessibilityLabel={`${supplement.name}, ${taken ? 'taken' : 'pending'}`} onPress={() => taken ? removeSupplementLog.mutate(log.id) : addSupplementLog.mutate({ supplementId: supplement.id, amount: supplement.defaultAmount })} style={styles.supplementChecklistToggle}>
                                <View style={styles.supplementChecklistCopy}>
                                  <ThemedText style={[styles.supplementChecklistName, taken && styles.supplementTakenName]}>{supplement.name}</ThemedText>
                                  {supplement.defaultAmount && <ThemedText style={styles.supplementChecklistAmount}>{supplement.defaultAmount}</ThemedText>}
                                </View>
                                <ThemedText style={[styles.supplementStatus, taken ? styles.supplementTaken : styles.supplementPending]}>{taken ? t('taken').toUpperCase() : t('pending').toUpperCase()}</ThemedText>
                              </Pressable>
                              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${supplement.name}`} onPress={() => deleteSupplement(supplement.id, supplement.name)} hitSlop={8} style={styles.supplementRemoveButton}>
                                <ThemedText style={styles.supplementRemoveLabel}>×</ThemedText>
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <View style={styles.supplementCategoryEmpty}><ThemedText style={styles.supplementCategoryEmptyText}>{t('categoryEmpty').toUpperCase()}</ThemedText></View>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <ThemedText style={styles.supplementEmpty}>{t('createRoutineHere').toUpperCase()}</ThemedText>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function MetricTile({
  label,
  value,
  tone,
  onPress,
}: {
  label: string;
  value: string;
  tone: 'blue' | 'mint' | 'coral' | 'violet' | 'default' | 'red' | 'yellow';
  onPress?: () => void;
}) {
  const theme = useTodayTheme();
  const styles = useTodayStyles(theme);
  const color = tone === 'blue'
    ? theme.accent
    : tone === 'mint'
      ? theme.mint
      : tone === 'coral'
        ? theme.coral
        : tone === 'violet'
          ? theme.violet
        : tone === 'red'
          ? theme.destructive
          : tone === 'yellow'
            ? theme.yellow
            : theme.text;
  const content = (
    <>
      <ThemedText style={styles.metricTileLabel}>{label}</ThemedText>
      <ThemedText style={[styles.metricTileValue, { color }]} numberOfLines={1}>{value}</ThemedText>
    </>
  );
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${label.toLowerCase()}`} onPress={onPress} style={[styles.metricTile, { borderLeftColor: color }]}>
        {content}
      </Pressable>
    );
  }
  return (
    <View style={[styles.metricTile, { borderLeftColor: color }]}>
      {content}
    </View>
  );
}

function SleepStages({
  stages,
}: {
  stages: { deepHours: number; lightHours: number; remHours: number; awakeHours: number };
}) {
  const { t } = useT();
  const theme = useTodayTheme();
  const styles = useTodayStyles(theme);
  const segments = [
    { label: t('deep').toUpperCase(), hours: stages.deepHours, style: styles.sleepStageDeep },
    { label: t('sleepLight').toUpperCase(), hours: stages.lightHours, style: styles.sleepStageLight },
    { label: t('rem').toUpperCase(), hours: stages.remHours, style: styles.sleepStageRem },
    ...(stages.awakeHours > 0 ? [{ label: t('awake').toUpperCase(), hours: stages.awakeHours, style: styles.sleepStageAwake }] : []),
  ];
  return (
    <View style={styles.sleepStages}>
      <View style={styles.sleepStageTrack}>
        {segments.map((segment) => <View key={segment.label} style={[styles.sleepStageSegment, segment.style, { flex: Math.max(segment.hours, 0.01) }]} />)}
      </View>
      <View style={styles.sleepStagesRow}>
        {segments.map((segment) => (
          <View key={segment.label} style={styles.sleepStageBlock}>
            <ThemedText type="small">{formatSleepDuration(segment.hours)}</ThemedText>
            <ThemedText style={styles.sleepStageLabel}>{segment.label}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

function MacroSummary({ label, value, color }: { label: string; value: string; color: string }) {
  const theme = useTodayTheme();
  const styles = useTodayStyles(theme);
  return (
    <View style={[styles.macroSummaryItem, { borderLeftColor: color }]}>
      <ThemedText style={styles.macroSummaryLabel}>{label}</ThemedText>
      <ThemedText style={[styles.macroSummaryValue, { color }]}>{value}</ThemedText>
    </View>
  );
}

function SupplementLogRow({
  log,
  onDelete,
}: {
  log: { id: string; name: string; amount: string | null };
  onDelete: () => void;
}) {
  const theme = useTodayTheme();
  const styles = useTodayStyles(theme);
  const updateLog = useUpdateSupplementLog();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(log.amount ?? '');

  useEffect(() => {
    setAmount(log.amount ?? '');
  }, [log.amount]);

  const save = () => {
    updateLog.mutate({ id: log.id, amount: amount.trim() || null });
    setEditing(false);
  };

  return (
    <SwipeableRow
      onDelete={onDelete}
      confirmTitle="Remove supplement"
      confirmMessage={`"${log.name}" will be permanently removed from today.`}>
      <View style={[styles.supplementRow, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText type="small" style={styles.supplementName} numberOfLines={1}>
          {log.name}
        </ThemedText>
        {editing ? (
          <TextInput
            value={amount}
            onChangeText={setAmount}
            onEndEditing={save}
            onBlur={save}
            autoFocus
            placeholder="Amount"
            placeholderTextColor={theme.textSecondary}
            style={[styles.supplementAmountInput, { color: theme.text, borderColor: theme.border }]}
          />
        ) : (
          <Pressable onPress={() => setEditing(true)} hitSlop={4} style={styles.supplementAmountPressable}>
            <ThemedText type="small" themeColor="textSecondary">
              {log.amount || 'ADD AMOUNT'}
            </ThemedText>
          </Pressable>
        )}
      </View>
    </SwipeableRow>
  );
}

function useTodayStyles(theme: TodayTheme) {
  return useMemo(() => createStyles(theme), [theme]);
}

// Dark mode's cards separate from the background purely by color step
// (shadows don't read on a near-black surface). Light mode's step is much
// smaller, so it leans on this shadow too, per DESIGN.md's "Gölge / Derinlik".
function cardShadowFor(theme: TodayTheme) {
  return theme === todayThemeLight
    ? { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 }
    : {};
}

const createStyles = (theme: TodayTheme) => {
  const cardShadow = cardShadowFor(theme);
  return StyleSheet.create({
  defaultText: {
    color: theme.text,
  },
  textIcon: {
    fontFamily: Fonts.technical,
    fontSize: 18,
    lineHeight: 20,
    textAlign: 'center',
  },
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
  },
  content: {
    paddingBottom: Spacing.six,
    gap: Spacing.two,
  },
  topBar: {
    height: 42,
    borderBottomWidth: 1,
    borderColor: theme.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: {
    color: theme.text,
    fontFamily: Fonts.metric,
    fontSize: 18,
    letterSpacing: 2,
  },
  topBarLabel: {
    color: theme.textSecondary,
    fontFamily: Fonts.technical,
    fontSize: 8,
    letterSpacing: 1.2,
  },
  titleBlock: {
    paddingVertical: Spacing.three,
  },
  dateLabel: {
    color: theme.accent,
    fontFamily: Fonts.technical,
    fontSize: 9,
    letterSpacing: 1,
  },
  todayTitle: {
    color: theme.text,
    fontFamily: Fonts.metric,
    fontSize: 38,
    lineHeight: 42,
  },
  startButtonRow: {
    flexDirection: 'column',
    gap: Spacing.one,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    minHeight: 48,
    paddingHorizontal: Spacing.two,
    borderWidth: 1,
    borderColor: theme.accent,
    backgroundColor: theme.accent,
  },
  secondaryStartButton: {
    backgroundColor: theme.backgroundElement,
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  metricTile: {
    ...cardShadow,
    // flexGrow+flexBasis, not a fixed width — a fixed 48% alongside the
    // grid's `gap` doesn't account for the gap, so the right column's right
    // edge drifted from the full-width cards above/below it (row to row it
    // wasn't even consistent with itself, depending on how wrapping rounded
    // that overflow). This is the same pattern already used for the History
    // day screen's identical 2-column grid (bodyMetricCell).
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 132,
    backgroundColor: theme.backgroundElement,
    borderWidth: 1,
    borderColor: theme.border,
    borderLeftWidth: 3,
    padding: Spacing.two,
    justifyContent: 'space-between',
  },
  metricTileLabel: {
    color: theme.textSecondary,
    fontFamily: Fonts.technical,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 1,
  },
  metricTileValue: {
    fontFamily: Fonts.metric,
    fontSize: 36,
    lineHeight: 40,
  },
  dayNoteCard: {
    ...cardShadow,
    backgroundColor: theme.backgroundElement,
    borderWidth: 1,
    borderColor: theme.border,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  dayNoteInput: {
    minHeight: 70,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.one,
    color: theme.text,
    fontFamily: Fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  activityMenuBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    padding: Spacing.three,
  },
  activityMenu: {
    backgroundColor: theme.backgroundElement,
    borderWidth: 1,
    borderColor: theme.border,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  metricEditorBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    padding: Spacing.three,
  },
  metricEditor: {
    backgroundColor: theme.backgroundElement,
    borderWidth: 1,
    borderColor: theme.border,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  editorMetricValue: {
    color: theme.text,
    fontFamily: Fonts.metric,
    fontSize: 36,
    lineHeight: 42,
    textAlign: 'center',
  },
  editorSupportingText: {
    color: theme.textSecondary,
    fontFamily: Fonts.technical,
    fontSize: 9,
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  editorFieldLabel: {
    color: theme.textSecondary,
    fontFamily: Fonts.technical,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  editorOptionRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'center',
  },
  editorOption: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.backgroundSelected,
  },
  waterUndo: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
    borderWidth: 1,
    borderColor: theme.mint,
    backgroundColor: withAlpha(theme.mint, 0.1),
  },
  waterUndoAmount: {
    color: theme.text,
    fontFamily: Fonts.technical,
    fontSize: 9,
    letterSpacing: 0.7,
  },
  waterUndoAction: {
    color: theme.mint,
    fontFamily: Fonts.technical,
    fontSize: 9,
    letterSpacing: 0.7,
  },
  editorStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  macroSummary: {
    gap: Spacing.two,
  },
  macroSummaryItem: {
    ...cardShadow,
    minHeight: 54,
    justifyContent: 'center',
    gap: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderLeftWidth: 3,
    backgroundColor: theme.backgroundSelected,
  },
  macroSummaryLabel: {
    color: theme.textSecondary,
    fontFamily: Fonts.technical,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  macroSummaryValue: {
    fontFamily: Fonts.metric,
    fontSize: 25,
    lineHeight: 28,
  },
  syncMetricButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.accent,
  },
  selectedStressChip: {
    backgroundColor: theme.accent,
  },
  disabledButton: {
    opacity: 0.4,
  },
  activityMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.one,
  },
  modalTitle: {
    color: theme.text,
    fontFamily: Fonts.metric,
    fontSize: 22,
    lineHeight: 25,
    letterSpacing: 0.4,
  },
  activityMenuOption: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderColor: theme.border,
  },
  activityCode: {
    minWidth: 34,
    color: theme.accent,
    fontFamily: Fonts.technical,
    fontSize: 8,
    letterSpacing: 0.6,
  },
  activityMenuChevron: {
    marginLeft: 'auto',
  },
  card: {
    ...cardShadow,
    backgroundColor: theme.backgroundElement,
    borderWidth: 1,
    borderColor: theme.border,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricRow: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  metricCard: {
    flex: 1,
    minWidth: 0,
  },
  metricCardSolo: {
    flex: undefined,
    width: '100%',
  },
  watchImportButton: {
    minHeight: 44,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  stepperButton: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.backgroundSelected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    minWidth: 100,
    textAlign: 'center',
    color: theme.text,
    fontFamily: Fonts.metric,
  },
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
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.backgroundSelected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sleepTimeValue: {
    minWidth: 56,
    textAlign: 'center',
    color: theme.text,
    fontFamily: Fonts.metric,
  },
  sleepTotal: {
    textAlign: 'center',
  },
  sleepStagesRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: Spacing.two,
  },
  sleepStages: {
    gap: Spacing.two,
  },
  sleepStageTrack: {
    height: 10,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.backgroundSelected,
  },
  sleepStageSegment: {
    height: '100%',
  },
  sleepStageDeep: {
    backgroundColor: theme.sleepDeep,
  },
  sleepStageLight: {
    backgroundColor: theme.sleepLight,
  },
  sleepStageRem: {
    backgroundColor: theme.mint,
  },
  sleepStageAwake: {
    backgroundColor: theme.coral,
  },
  sleepStageBlock: {
    alignItems: 'center',
    gap: Spacing.half,
  },
  sleepStageLabel: {
    color: theme.textSecondary,
    fontFamily: Fonts.technical,
    fontSize: 8,
    letterSpacing: 0.6,
  },
  stressRow: {
    gap: Spacing.two,
  },
  stressChip: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drinkHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  coffeeCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingVertical: Spacing.two,
  },
  coffeeStepButton: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coffeeValue: {
    color: theme.text,
    fontFamily: Fonts.metric,
    fontSize: 40,
    lineHeight: 44,
  },
  progressTrack: {
    height: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  waterButtonRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  waterButton: {
    flex: 1,
    minHeight: 40,
    paddingVertical: Spacing.two,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
  },
  supplementList: {
    gap: Spacing.two,
  },
  supplementGroupList: {
    gap: Spacing.two,
  },
  supplementCategoryCard: {
    ...cardShadow,
    gap: Spacing.two,
    padding: Spacing.two,
    borderWidth: 1,
    borderColor: theme.border,
    borderLeftWidth: 3,
    backgroundColor: theme.backgroundElement,
  },
  supplementCategoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  supplementCategoryTitlePress: {
    flex: 1,
  },
  supplementCategoryTitle: {
    color: theme.textSecondary,
    fontFamily: Fonts.technical,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  supplementCategoryTitleInput: {
    flex: 1,
    minHeight: 32,
    color: theme.text,
    fontFamily: Fonts.technical,
    fontSize: 10,
    letterSpacing: 0.8,
    borderWidth: 1,
    borderColor: theme.accent,
    // Square corners, not rounded — every other box on this screen (cards,
    // the delete button, chips) is sharp-edged; a rounded pill here was the
    // one rounded thing on the page and read as visually out of place.
    backgroundColor: theme.backgroundSelected,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    // Drop web's own focus ring; this border is already the focus indicator.
    ...(Platform.OS === 'web' ? ({ outlineWidth: 0 } as object) : null),
  },
  supplementCategoryDeleteButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplementCategoryEmpty: {
    borderWidth: 1,
    borderColor: theme.border,
    borderStyle: 'dashed',
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplementCategoryEmptyText: {
    color: theme.textSecondary,
    fontFamily: Fonts.technical,
    fontSize: 9,
    letterSpacing: 1.1,
  },
  supplementCard: {
    padding: Spacing.two,
    gap: Spacing.two,
  },
  supplementAddLabel: {
    color: theme.accent,
    fontFamily: Fonts.technical,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  supplementChecklistRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingLeft: Spacing.two,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.backgroundSelected,
  },
  supplementChecklistToggle: { flex: 1, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  supplementRemoveButton: { width: 38, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderColor: theme.border },
  supplementRemoveLabel: { color: theme.textSecondary, fontFamily: Fonts.technical, fontSize: 18, lineHeight: 21 },
  supplementChecklistCopy: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  supplementChecklistName: {
    color: theme.text,
    fontFamily: Fonts.regular,
    fontSize: 14,
  },
  supplementTakenName: {
    color: theme.textSecondary,
  },
  supplementChecklistAmount: {
    color: theme.textSecondary,
    fontFamily: Fonts.technical,
    fontSize: 8,
    letterSpacing: 0.5,
  },
  supplementStatus: {
    minWidth: 58,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.half,
    borderWidth: 1,
    fontFamily: Fonts.technical,
    fontSize: 8,
    letterSpacing: 0.7,
    textAlign: 'center',
  },
  supplementTaken: {
    color: theme.accent,
    borderColor: theme.accent,
    backgroundColor: withAlpha(theme.accent, 0.1),
  },
  supplementPending: {
    color: theme.textSecondary,
    borderColor: theme.border,
    backgroundColor: theme.backgroundElement,
  },
  supplementEmpty: {
    color: theme.textSecondary,
    fontFamily: Fonts.technical,
    fontSize: 9,
    letterSpacing: 0.6,
    paddingVertical: Spacing.one,
  },
  supplementRow: {
    ...cardShadow,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderWidth: 1,
    borderColor: theme.border,
  },
  supplementName: {
    flexShrink: 1,
    marginRight: Spacing.two,
  },
  supplementAmountPressable: {
    flexShrink: 0,
  },
  supplementAmountInput: {
    minWidth: 80,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    fontSize: 13,
    textAlign: 'right',
  },
  supplementChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderWidth: 1,
    borderColor: theme.border,
  },
  });
};

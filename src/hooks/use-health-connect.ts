import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';

import { useHealthMetricsDaily, useSyncHealthMetricsDaily } from '@/db/queries/health-metrics';
import { getTodayDateString } from '@/lib/date';
import { friendlyErrorMessage } from '@/lib/errors';
import {
  getHealthConnectAvailability,
  isHealthConnectConnected,
  queryDailyHealthSummary,
  queryHeartRateTimeSeries,
  queryRecentWatchSessions,
  querySleepForDate,
  querySleepHeartRateTimeSeries,
  querySpeedTimeSeries,
  queryStepsForDate,
  queryWeightForDate,
  requestHealthConnectPermissions,
} from '@/lib/health-connect';
import { dismissWatchNotice, getPendingWatchNotices, isWatchSessionProcessed } from '@/lib/watch-import-store';

// Live-queried every time, never cached in the settings table — the user can
// revoke this permission from inside the Health Connect app itself, outside
// Compos entirely, so a cached "connected" flag could drift from reality.
export function useHealthConnectStatus() {
  return useQuery({
    queryKey: ['health-connect', 'status'],
    queryFn: async () => {
      try {
        const availability = await getHealthConnectAvailability();
        const connected = availability === 'available' ? await isHealthConnectConnected() : false;
        return { availability, connected, error: null };
      } catch (error) {
        // getSdkStatus() and friends are expected to just return an
        // 'unavailable' status value when Health Connect genuinely isn't
        // present — but if the native module itself throws (seen on some
        // OEM ROMs), the caller's `if (!status) return null` in
        // settings.tsx would otherwise make the whole card vanish with no
        // trace of why. Surfacing a real error here instead lets the card
        // show it, rather than silently disappearing.
        console.warn('Health Connect durum sorgusu hata verdi:', error);
        return {
          availability: 'unavailable' as const,
          connected: false,
          error: friendlyErrorMessage(error, 'Sağlık verisi durumu okunamadı.'),
        };
      }
    },
  });
}

export function useConnectHealthConnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: requestHealthConnectPermissions,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['health-connect', 'status'] }),
  });
}

// null (not connected / no data / Health Connect unavailable) vs. a real
// number are both valid results — the caller decides how to render "no
// data" (e.g. hide the card rather than show "0 adım"). Health Connect is
// Android-only (confirmed live: `Error: Platform not supported. This
// package only supports Android.`), so the web build reads the once-a-day
// synced snapshot instead (see db/queries/health-metrics.ts) — Platform.OS
// never changes at runtime, so branching which hook actually runs here is
// safe (not a conditional-hooks violation).
export function useDailySteps(date: string) {
  const webResult = useHealthMetricsDaily(date);
  const nativeResult = useQuery({
    queryKey: ['health-connect', 'steps', date],
    queryFn: () => queryStepsForDate(date),
    enabled: Platform.OS !== 'web',
  });
  if (Platform.OS === 'web') {
    return { ...webResult, data: webResult.data?.steps ?? null };
  }
  return nativeResult;
}

// Same "live-queried, null means no data" contract as useDailySteps —
// resting heart rate / total calories are read-only display data, never
// written into Compos's own tables (unlike sleep/weight below, which the
// user explicitly pulls into their existing manually-editable fields).
// Same web/native split as useDailySteps above.
export function useDailyHealthSummary(date: string) {
  const webResult = useHealthMetricsDaily(date);
  const nativeResult = useQuery({
    queryKey: ['health-connect', 'daily-summary', date],
    queryFn: () => queryDailyHealthSummary(date),
    enabled: Platform.OS !== 'web',
  });
  if (Platform.OS === 'web') {
    return {
      ...webResult,
      data: webResult.data
        ? { restingHeartRate: webResult.data.restingHeartRate, totalCaloriesBurned: webResult.data.totalCaloriesBurned }
        : null,
    };
  }
  return nativeResult;
}

// Sleep/weight are live Health Connect reads. Today uses the fresh sleep
// session as its initial source of truth so a stale check-in cannot keep
// displaying old bedtime/wake-up values; a direct adjustment in the Today
// editor remains an explicit manual override for that open session.
export function useHealthConnectSleep(date: string) {
  return useQuery({
    queryKey: ['health-connect', 'sleep', date],
    queryFn: () => querySleepForDate(date),
  });
}

export function useHealthConnectWeight(date: string) {
  return useQuery({
    queryKey: ['health-connect', 'weight', date],
    queryFn: () => queryWeightForDate(date),
  });
}

// Sleep-window heart-rate graph — History's day-detail screen only. Native
// queries the sleep session's own window fresh from Health Connect; web
// reads the synced snapshot, same split as every other hook in this file. Needs the
// day's sleep summary first to know the window at all, hence the two-step
// native query below (only real cost is Health Connect's own SleepSession
// read, already happening anyway for querySleepForDate's own callers).
export function useSleepHeartRateSeries(date: string) {
  const webResult = useHealthMetricsDaily(date);
  const { data: sleep } = useHealthConnectSleep(date);
  const nativeResult = useQuery({
    queryKey: ['health-connect', 'sleep-heart-rate-series', date, sleep?.startTime, sleep?.endTime],
    queryFn: () => querySleepHeartRateTimeSeries(sleep!.startTime, sleep!.endTime),
    enabled: Platform.OS !== 'web' && !!sleep,
  });
  if (Platform.OS === 'web') {
    return { ...webResult, data: webResult.data?.sleepHeartRateSeries ?? [] };
  }
  return nativeResult;
}

// Native-only: gathers today's Health Connect data and writes the once-a-day
// snapshot row the web build reads (see useDailySteps/useDailyHealthSummary
// above, and the schema comment on healthMetricsDaily). Called from the
// Bugün screen's existing "app came to foreground" effect — no new
// background task, reuses the trigger that already refetches on the same
// event. Silently no-ops on web (queryStepsForDate etc. would just fail the
// same "Platform not supported" way useHealthConnectStatus already handles).
// Deliberately doesn't query heart-rate series here — Kağan asked for
// Health Connect to only be hit for heart rate when an activity (run/swim/
// bike) is actually started, not on every app open, to stop needlessly
// filling Supabase and phone storage with data nobody views.
export function useSyncDailyHealthMetrics() {
  const syncMutation = useSyncHealthMetricsDaily();
  return async () => {
    if (Platform.OS === 'web') return;
    const date = getTodayDateString();
    const [steps, summary, sleep] = await Promise.all([
      queryStepsForDate(date),
      queryDailyHealthSummary(date),
      querySleepForDate(date),
    ]);
    // No permission / no data at all today — skip the write rather than
    // overwrite a possibly-already-synced row with an all-null one (e.g. a
    // momentary permission hiccup shouldn't erase this morning's data).
    if (steps == null && !summary && !sleep?.stages) {
      return;
    }
    await syncMutation.mutateAsync({
      date,
      steps,
      restingHeartRate: summary?.restingHeartRate ?? null,
      totalCaloriesBurned: summary?.totalCaloriesBurned ?? null,
      avgHeartRate: null,
      heartRateSeries: [],
      sleepHeartRateSeries: [],
      sleepStages: sleep?.stages ?? null,
    });
  };
}

// Graph data for the run summary screen — only meaningful for a session
// that actually has start/end timestamps to query Health Connect's raw
// samples against (a manually-entered or Telegram-screenshot-imported
// session never has this window, hence the `enabled` gate).
export function useWorkoutHeartRateTimeSeries(startedAt: string | null | undefined, finishedAt: string | null | undefined) {
  return useQuery({
    queryKey: ['health-connect', 'heart-rate-series', startedAt, finishedAt],
    queryFn: () => queryHeartRateTimeSeries(startedAt!, finishedAt!),
    enabled: !!startedAt && !!finishedAt,
  });
}

export function useWorkoutSpeedTimeSeries(startedAt: string | null | undefined, finishedAt: string | null | undefined) {
  return useQuery({
    queryKey: ['health-connect', 'speed-series', startedAt, finishedAt],
    queryFn: () => querySpeedTimeSeries(startedAt!, finishedAt!),
    enabled: !!startedAt && !!finishedAt,
  });
}

// A "did you do something on your watch recently?" check — see
// queryRecentWatchSessions's own doc comment for why this is inherently
// delayed, not live. Filters out anything already processed (imported, or
// still awaiting the one-time route-consent dialog — see
// watch-import-store.ts) so the same session doesn't keep resurfacing once
// handled. What's left here gets auto-imported by useAutoImportWatchSessions
// without waiting for a tap — this list should normally be empty/transient.
export function useUnhandledWatchSessions() {
  return useQuery({
    queryKey: ['health-connect', 'watch-sessions'],
    queryFn: async () => {
      const sessions = await queryRecentWatchSessions();
      const unprocessed = await Promise.all(
        sessions.map(async (session) => ((await isWatchSessionProcessed(session.id)) ? null : session))
      );
      return unprocessed.filter((session) => session !== null);
    },
  });
}

// Cards shown on the Bugün screen for sessions that were already
// auto-imported — informational only, "tap to acknowledge," never
// re-triggers the import itself.
export function useWatchImportNotices() {
  return useQuery({
    queryKey: ['health-connect', 'watch-notices'],
    queryFn: getPendingWatchNotices,
  });
}

export function useDismissWatchNotice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: dismissWatchNotice,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['health-connect', 'watch-notices'] }),
  });
}

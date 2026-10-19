import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { healthMetricsDaily } from '@/db/schema';
import { useAuth } from '@/hooks/use-auth';
import { getTodayDateString } from '@/lib/date';
import type { SleepStageBreakdown, TimeSeriesPoint } from '@/lib/health-connect';

// Same per-(user,date)-key write lock as useSaveCheckin in daily.ts — see
// that file's comment for the exact race it closes (two near-simultaneous
// writes both seeing "no row yet" and both inserting, which only surfaces
// later as a duplicate-key rejection stuck at the head of PowerSync's
// upload queue). The trigger here (app foreground) is less bursty than
// checkin's steppers, but the fix is free to apply and the failure mode is
// identical, so there's no reason to skip it.
const writeLocks = new Map<string, Promise<unknown>>();
function withWriteLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = writeLocks.get(key) ?? Promise.resolve();
  const result = prior.then(fn, fn);
  writeLocks.set(
    key,
    result.catch(() => {})
  );
  return result;
}

export type HealthMetricsDaily = {
  steps: number | null;
  restingHeartRate: number | null;
  totalCaloriesBurned: number | null;
  avgHeartRate: number | null;
  heartRateSeries: TimeSeriesPoint[];
  sleepHeartRateSeries: TimeSeriesPoint[];
  sleepStages: SleepStageBreakdown | null;
  syncedAt: string;
};

// Web-only read path — see the schema comment on healthMetricsDaily for why
// this table (not a live Health Connect query) is the web build's source
// for this data. Returns null when nothing has synced yet for this date
// (e.g. the native app hasn't been opened today), same "no data" contract
// as the native Health Connect hooks in use-health-connect.ts.
export function useHealthMetricsDaily(date: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['health-metrics-daily', date],
    queryFn: async (): Promise<HealthMetricsDaily | null> => {
      if (!user) return null;
      const [row] = await db
        .select()
        .from(healthMetricsDaily)
        .where(and(eq(healthMetricsDaily.userId, user.id), eq(healthMetricsDaily.date, date)))
        .orderBy(desc(healthMetricsDaily.syncedAt));
      if (!row) return null;
      return {
        steps: row.steps,
        restingHeartRate: row.restingHeartRate,
        totalCaloriesBurned: row.totalCaloriesBurned,
        avgHeartRate: row.avgHeartRate,
        heartRateSeries: row.heartRateSeries ? JSON.parse(row.heartRateSeries) : [],
        sleepHeartRateSeries: row.sleepHeartRateSeries ? JSON.parse(row.sleepHeartRateSeries) : [],
        sleepStages: row.sleepStages ? JSON.parse(row.sleepStages) : null,
        syncedAt: row.syncedAt,
      };
    },
    enabled: !!user,
  });
}

// Native-only write path, called from the Bugün screen's existing
// "app came to foreground" effect (src/app/(tabs)/index.tsx) — see
// useSyncDailyHealthMetrics in hooks/use-health-connect.ts for what
// gathers the values this receives.
export function useSyncHealthMetricsDaily() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: {
      date?: string;
      steps: number | null;
      restingHeartRate: number | null;
      totalCaloriesBurned: number | null;
      avgHeartRate: number | null;
      heartRateSeries: TimeSeriesPoint[];
      sleepHeartRateSeries: TimeSeriesPoint[];
      sleepStages: SleepStageBreakdown | null;
    }) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const { date = getTodayDateString(), heartRateSeries, sleepHeartRateSeries, sleepStages, ...rest } = values;
      await withWriteLock(`${user.id}:${date}`, async () => {
        // PowerSync-managed tables are SQLite views, not real tables — see
        // useSaveCheckin's comment in daily.ts for why this has to be a
        // manual check-then-write instead of a real upsert.
        const [existing] = await db
          .select({ id: healthMetricsDaily.id })
          .from(healthMetricsDaily)
          .where(and(eq(healthMetricsDaily.userId, user.id), eq(healthMetricsDaily.date, date)))
          .orderBy(desc(healthMetricsDaily.syncedAt));
        const values_ = {
          ...rest,
          heartRateSeries: JSON.stringify(heartRateSeries),
          sleepHeartRateSeries: JSON.stringify(sleepHeartRateSeries),
          sleepStages: sleepStages ? JSON.stringify(sleepStages) : null,
          syncedAt: new Date().toISOString(),
        };
        if (existing) {
          await db.update(healthMetricsDaily).set(values_).where(eq(healthMetricsDaily.id, existing.id));
        } else {
          await db.insert(healthMetricsDaily).values({ userId: user.id, date, ...values_ });
        }
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['health-metrics-daily', variables.date ?? getTodayDateString()] });
    },
  });
}

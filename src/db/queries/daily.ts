import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { and, desc, eq, sql } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';

import { db } from '@/db/client';
import { coffeeLogs, dailyCheckins, waterLogs } from '@/db/schema';
import { useAuth } from '@/hooks/use-auth';
import { alertMessage } from '@/lib/alert';
import { getTodayDateString } from '@/lib/date';

// Serializes concurrent useSaveCheckin calls for the same (user, date) key.
// Without this, two calls close together (a fast double-tap on a stepper,
// two different steppers tapped within the same moment, the stress
// carry-forward effect firing alongside a manual chip tap) can both run
// their "does a row exist yet?" select before either one's insert commits —
// each sees "no row," each inserts its OWN new id. Locally this is silent
// (dailyCheckins is a PowerSync view; the unique(userId, date) constraint
// declared in schema.ts isn't actually enforced against PowerSync's
// internal storage), so nothing looks wrong until PowerSync tries to upload
// the second row and Postgres's real unique(user_id, date) constraint
// rejects it — confirmed live 2026-08-13 ("duplicate key ... daily_checkins
// ... date"), stuck at the head of the upload queue blocking everything
// behind it. A per-key promise chain makes the read-then-write section
// effectively atomic, closing the race regardless of which two callers
// triggered it.
const checkinWriteLocks = new Map<string, Promise<unknown>>();
function withCheckinLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = checkinWriteLocks.get(key) ?? Promise.resolve();
  const result = prior.then(fn, fn);
  checkinWriteLocks.set(
    key,
    result.catch(() => {})
  );
  return result;
}

export function useTodayCheckin() {
  const date = getTodayDateString();
  return useQuery({
    queryKey: ['daily-checkin', date],
    queryFn: async () => {
      // Most-recently-updated first — defensive against a duplicate row for
      // this date already sitting in local storage (see withCheckinLock's
      // comment above): if one exists, this deterministically shows the one
      // with the latest edits instead of an arbitrary row-order pick.
      const [row] = await db
        .select()
        .from(dailyCheckins)
        .where(eq(dailyCheckins.date, date))
        .orderBy(desc(dailyCheckins.updatedAt));
      return row ?? null;
    },
  });
}

// date defaults to today (the Bugün tab's use case); history editing passes
// an explicit past date so the same mutation can fix retroactive entries.
export function useSaveCheckin() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      date,
      ...values
    }: {
      date?: string;
      bedTime?: string | null;
      wakeTime?: string | null;
      sleepHours?: number | null;
      napHours?: number | null;
      stressLevel?: number | null;
      weightKg?: number | null;
    }) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const checkinDate = date ?? getTodayDateString();
      await withCheckinLock(`${user.id}:${checkinDate}`, async () => {
        // PowerSync-managed tables are SQLite views (backed by internal storage
        // + INSTEAD OF triggers), not real tables — SQLite's
        // INSERT ... ON CONFLICT DO UPDATE can't target a view ("cannot upsert
        // a view"), so this has to be a manual check-then-write instead.
        const [existing] = await db
          .select({ id: dailyCheckins.id })
          .from(dailyCheckins)
          .where(and(eq(dailyCheckins.userId, user.id), eq(dailyCheckins.date, checkinDate)))
          .orderBy(desc(dailyCheckins.updatedAt));
        if (existing) {
          await db.update(dailyCheckins).set(values).where(eq(dailyCheckins.id, existing.id));
        } else {
          await db.insert(dailyCheckins).values({ userId: user.id, date: checkinDate, ...values });
        }
      });
    },
    onSuccess: () => {
      // Broad prefix invalidation: covers both the specific date's query and
      // the 'days' history list used by trend charts / the history-day screen.
      queryClient.invalidateQueries({ queryKey: ['daily-checkin'] });
    },
    onError: (error) => {
      // Temporary diagnostic — every mutation in this codebase fails silently
      // on error today; surfacing this one while tracking down why the Bugün
      // tab's checkin buttons stopped saving (2026-08-11).
      alertMessage('Kaydedilemedi', error instanceof Error ? error.message : String(error));
    },
  });
}

export function useCheckinHistory() {
  return useQuery({
    queryKey: ['daily-checkin', 'days'],
    queryFn: () =>
      db
        .select({
          date: dailyCheckins.date,
          bedTime: dailyCheckins.bedTime,
          wakeTime: dailyCheckins.wakeTime,
          sleepHours: dailyCheckins.sleepHours,
          napHours: dailyCheckins.napHours,
          stressLevel: dailyCheckins.stressLevel,
          weightKg: dailyCheckins.weightKg,
        })
        .from(dailyCheckins)
        .orderBy(desc(dailyCheckins.date)),
  });
}

export function useDeleteWaterForDate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => db.delete(waterLogs).where(eq(waterLogs.date, date)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['water'] }),
  });
}

export function useWaterHistory() {
  return useQuery({
    queryKey: ['water', 'days'],
    queryFn: () =>
      db
        .select({ date: waterLogs.date, total: sql<number>`coalesce(sum(${waterLogs.amountMl}), 0)` })
        .from(waterLogs)
        .groupBy(waterLogs.date)
        .orderBy(desc(waterLogs.date)),
  });
}

export function useTodayWater() {
  const date = getTodayDateString();
  return useQuery({
    queryKey: ['water', date],
    queryFn: async () => {
      const [row] = await db
        .select({ total: sql<number>`coalesce(sum(${waterLogs.amountMl}), 0)` })
        .from(waterLogs)
        .where(eq(waterLogs.date, date));
      return row?.total ?? 0;
    },
  });
}

// date defaults to today (the Bugün tab's quick-add buttons); history editing
// passes an explicit past date so the same mutation can adjust retroactive totals.
export function useAddWater() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ date, amountMl }: { date?: string; amountMl: number }) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const id = Crypto.randomUUID();
      await db.insert(waterLogs).values({ id, userId: user.id, date: date ?? getTodayDateString(), amountMl });
      return id;
    },
    onSuccess: () => {
      // Broad prefix invalidation: covers both the specific date's query and
      // the 'days' history list used by the history-day screen.
      queryClient.invalidateQueries({ queryKey: ['water'] });
    },
  });
}

export function useRemoveWaterLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.delete(waterLogs).where(eq(waterLogs.id, id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['water'] }),
  });
}

export function useTodayCoffeeCount() {
  const date = getTodayDateString();
  return useQuery({
    queryKey: ['coffee', date],
    queryFn: async () => {
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(coffeeLogs)
        .where(eq(coffeeLogs.date, date));
      return row?.count ?? 0;
    },
  });
}

export function useAddCoffee() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: () => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      return db.insert(coffeeLogs).values({ userId: user.id, date: getTodayDateString() });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coffee'] }),
  });
}

export function useCoffeeHistory() {
  return useQuery({
    queryKey: ['coffee', 'days'],
    queryFn: () =>
      db
        .select({ date: coffeeLogs.date, count: sql<number>`count(*)` })
        .from(coffeeLogs)
        .groupBy(coffeeLogs.date)
        .orderBy(desc(coffeeLogs.date)),
  });
}

export function useDeleteCoffeeForDate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => db.delete(coffeeLogs).where(eq(coffeeLogs.date, date)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coffee'] }),
  });
}

export function useRemoveLastCoffee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const date = getTodayDateString();
      const [last] = await db
        .select({ id: coffeeLogs.id })
        .from(coffeeLogs)
        .where(eq(coffeeLogs.date, date))
        .orderBy(desc(coffeeLogs.loggedAt))
        .limit(1);
      if (!last) {
        return;
      }
      await db.delete(coffeeLogs).where(eq(coffeeLogs.id, last.id));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coffee'] }),
  });
}

// Date-parameterized siblings of useAddCoffee/useRemoveLastCoffee (both
// hardcoded to today) — for editing a past day's coffee count from
// history/day/[date].tsx, the same way useAddWater already takes a date.
export function useAddCoffeeForDate() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (date: string) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      return db.insert(coffeeLogs).values({ userId: user.id, date });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coffee'] }),
  });
}

export function useRemoveLastCoffeeForDate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (date: string) => {
      const [last] = await db
        .select({ id: coffeeLogs.id })
        .from(coffeeLogs)
        .where(eq(coffeeLogs.date, date))
        .orderBy(desc(coffeeLogs.loggedAt))
        .limit(1);
      if (!last) {
        return;
      }
      await db.delete(coffeeLogs).where(eq(coffeeLogs.id, last.id));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coffee'] }),
  });
}

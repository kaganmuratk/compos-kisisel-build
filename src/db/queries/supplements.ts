import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { desc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { supplementLogs, supplements } from '@/db/schema';
import { useAuth } from '@/hooks/use-auth';
import { getTodayDateString } from '@/lib/date';

export function useSupplements() {
  return useQuery({
    queryKey: ['supplements'],
    queryFn: () => db.select().from(supplements).orderBy(supplements.name),
  });
}

export function useAddSupplement() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (values: { name: string; defaultAmount?: string | null; isDefault?: boolean; categoryId?: string | null }) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      return db.insert(supplements).values({ ...values, userId: user.id }).returning();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supplements'] }),
  });
}

export function useUpdateSupplement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...values
    }: {
      id: string;
      name?: string;
      defaultAmount?: string | null;
      isDefault?: boolean;
      categoryId?: string | null;
    }) => db.update(supplements).set(values).where(eq(supplements.id, id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supplements'] }),
  });
}

/** Permanently removes a routine item. Its dose history follows via the FK cascade. */
export function useRemoveSupplement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.delete(supplements).where(eq(supplements.id, id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplements'] });
      queryClient.invalidateQueries({ queryKey: ['supplement-logs'] });
    },
  });
}

export function useSupplementLogsForDate(date: string) {
  return useQuery({
    queryKey: ['supplement-logs', date],
    queryFn: () =>
      db
        .select({
          id: supplementLogs.id,
          supplementId: supplementLogs.supplementId,
          amount: supplementLogs.amount,
          name: supplements.name,
        })
        .from(supplementLogs)
        .innerJoin(supplements, eq(supplementLogs.supplementId, supplements.id))
        .where(eq(supplementLogs.date, date))
        .orderBy(supplements.name),
  });
}

export function useTodaySupplementLogs() {
  return useSupplementLogsForDate(getTodayDateString());
}

export function useSupplementLogsHistory() {
  return useQuery({
    queryKey: ['supplement-logs', 'all'],
    queryFn: () =>
      db
        .select({
          id: supplementLogs.id,
          date: supplementLogs.date,
          supplementId: supplementLogs.supplementId,
          amount: supplementLogs.amount,
          name: supplements.name,
        })
        .from(supplementLogs)
        .innerJoin(supplements, eq(supplementLogs.supplementId, supplements.id))
        .orderBy(desc(supplementLogs.date)),
  });
}

// Module-level (not per-hook-instance) so it survives the Bugün screen
// mounting more than once in the same app session — e.g. RootLayoutNav
// swapping from the login screen to the tabs stack more than once during
// an auth-state flicker right after reconnecting from offline (see the
// 2026-08-23 gym incident memory). Without this, two overlapping calls for
// the same date could both pass the "alreadyLogged" check below before
// either's insert lands — the exact race behind the reported "takviyeler
// ikiye katlanıyor" bug: two duplicate rows per default supplement.
const ensuredSupplementDefaultDates = new Set<string>();

// Lazily stamps today's log rows from default supplements, mirroring the
// nutrition-goal-snapshot pattern: runs once per day (gated on any log row
// already existing for the date), so daily regulars don't need re-entry.
// Known trade-off: if a day's log rows are all explicitly removed and this
// runs again, defaults reappear — accepted for simplicity in a personal app.
export function useEnsureDefaultSupplementLogs() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (date: string) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      if (ensuredSupplementDefaultDates.has(date)) {
        return;
      }
      ensuredSupplementDefaultDates.add(date);
      const [alreadyLogged] = await db
        .select({ id: supplementLogs.id })
        .from(supplementLogs)
        .where(eq(supplementLogs.date, date))
        .limit(1);
      if (alreadyLogged) {
        return;
      }
      const defaults = await db.select().from(supplements).where(eq(supplements.isDefault, true));
      if (defaults.length === 0) {
        return;
      }
      await db
        .insert(supplementLogs)
        .values(defaults.map((s) => ({ userId: user.id, date, supplementId: s.id, amount: s.defaultAmount })));
    },
    onSuccess: (_data, date) => queryClient.invalidateQueries({ queryKey: ['supplement-logs', date] }),
  });
}

// Self-healing cleanup for the race useEnsureDefaultSupplementLogs guards
// against (see the module-level Set above) — that guard only survives
// remounts within one running JS process, not a real app/process restart.
// A restart mid-race (e.g. the device killing and relaunching the app while
// offline/reconnecting, or the user manually relaunching after the
// 2026-08-23 gym offline-login incident) starts a fresh module instance
// with an empty Set, so the same two-instances-both-pass-the-check race can
// still land duplicate rows despite the guard. Rather than chase every
// possible restart timing, this runs on every boot (see _layout.tsx) and
// removes any (date, supplementId) pair with more than one row, keeping the
// earliest. Manual logging can never produce such a pair in the first place
// — the quick-add list in index.tsx already excludes supplements logged
// today — so any duplicate found here is definitely this race, never a
// legitimate second dose.
export async function dedupeSupplementLogs() {
  const rows = await db
    .select({ id: supplementLogs.id, date: supplementLogs.date, supplementId: supplementLogs.supplementId })
    .from(supplementLogs)
    .orderBy(supplementLogs.id);
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.date}|${row.supplementId}`;
    if (seen.has(key)) {
      await db.delete(supplementLogs).where(eq(supplementLogs.id, row.id));
    } else {
      seen.add(key);
    }
  }
}

// date defaults to today; history-day editing passes an explicit past date
// so the same mutation can add retroactive entries (previously hardcoded to
// today — a real bug, not just a missing feature, since a log added while
// looking at a past day would silently get stamped as today instead).
export function useAddSupplementLog() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (values: { supplementId: string; amount?: string | null; date?: string }) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const { date = getTodayDateString(), ...rest } = values;
      return db.insert(supplementLogs).values({ userId: user.id, date, ...rest });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supplement-logs'] }),
  });
}

export function useUpdateSupplementLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: string | null }) =>
      db.update(supplementLogs).set({ amount }).where(eq(supplementLogs.id, id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supplement-logs'] }),
  });
}

export function useRemoveSupplementLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.delete(supplementLogs).where(eq(supplementLogs.id, id)),
    // Broad prefix invalidation: the caller may be removing a log for today
    // or for a past date (history editing) — covers both plus the 'all'
    // history list.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supplement-logs'] }),
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { count, desc, eq, inArray, isNull, max } from 'drizzle-orm';

import { db } from '@/db/client';
import { getSettingsRow } from '@/db/queries/settings';
import { exerciseLogs, setLogs, workoutSessionMedia, workoutSessions } from '@/db/schema';
import { useAuth } from '@/hooks/use-auth';
import { getTodayDateString } from '@/lib/date';
import { queryWorkoutHealthSummary } from '@/lib/health-connect';
import { deleteSessionMediaFromCloud, uploadSessionMediaToCloud } from '@/lib/session-media-cloud-backup';

// A newly created (empty) set should start pre-filled with the user's
// configured default RIR/RPE value, if any — applies only to brand-new
// sets, never to editing existing ones.
export async function getDefaultRepMetricFields(): Promise<{ rir?: number; rpe?: number }> {
  const settingsRow = await getSettingsRow();
  const defaultValue = settingsRow?.defaultRepMetricValue;
  if (defaultValue == null || !settingsRow) return {};
  return settingsRow.repMetric === 'rpe' ? { rpe: defaultValue } : { rir: defaultValue };
}

export function useTodaySessionCount() {
  const date = getTodayDateString();
  return useQuery({
    queryKey: ['sessions', 'today-count', date],
    queryFn: async () => {
      const [{ value } = { value: 0 }] = await db
        .select({ value: count() })
        .from(workoutSessions)
        .where(eq(workoutSessions.date, date));
      return value ?? 0;
    },
  });
}

export function useActiveSession() {
  return useQuery({
    queryKey: ['sessions', 'active'],
    queryFn: async () => {
      const [session] = await db
        .select()
        .from(workoutSessions)
        .where(isNull(workoutSessions.finishedAt))
        .orderBy(desc(workoutSessions.startedAt))
        .limit(1);
      return session ?? null;
    },
  });
}

export function useStartSession() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: { name?: string; notes?: string } = {}) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const [session] = await db
        .insert(workoutSessions)
        .values({ userId: user.id, date: getTodayDateString(), ...values })
        .returning();
      return session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

// For workouts that happened but were never logged live (phone wasn't
// there, forgot to start it, etc.) — inserts an already-finished, empty
// session for the given date. The caller routes into
// /history/workout/[sessionId] afterward, which already supports adding
// exercises/sets to a finished session via the same add-exercise flow used
// for live workouts — no separate exercise-entry UI needed here.
export function useAddManualWorkoutSession() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: { date: string; name?: string; notes?: string }) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const startedAt = new Date(`${values.date}T12:00:00`).toISOString();
      const [session] = await db
        .insert(workoutSessions)
        .values({
          userId: user.id,
          date: values.date,
          name: values.name,
          notes: values.notes,
          startedAt,
          finishedAt: startedAt,
        })
        .returning();
      return session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

// Turns a watch-recorded strength/class-type session (detected via Health
// Connect's ExerciseSession, see queryRecentWatchSessions) into a normal
// finished workout session shell — real start/end clock times and whatever
// heart-rate/calorie data Health Connect has for that window. Unlike the
// cardio import, there's no exercise/set data to pull in (the watch has no
// way to know which exercises or how many reps were done) — the session
// lands empty and the person adds exercises to it by hand afterward, same
// as any other session.
export function useImportWorkoutSessionFromHealthConnect() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: { date: string; name?: string; startedAt: string; finishedAt: string }) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const [session] = await db
        .insert(workoutSessions)
        .values({
          userId: user.id,
          date: values.date,
          name: values.name,
          startedAt: values.startedAt,
          finishedAt: values.finishedAt,
        })
        .returning();
      if (!session) {
        return session;
      }

      const summary = await queryWorkoutHealthSummary(values.startedAt, values.finishedAt);
      if (summary) {
        await db
          .update(workoutSessions)
          .set({ ...summary, healthSyncedAt: new Date().toISOString() })
          .where(eq(workoutSessions.id, session.id));
      }
      return session;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
}

export function useFinishedSessions() {
  return useQuery({
    queryKey: ['sessions', 'finished'],
    queryFn: () =>
      db.query.workoutSessions.findMany({
        where: (fields, { isNotNull }) => isNotNull(fields.finishedAt),
        orderBy: (fields, { desc }) => [desc(fields.date), desc(fields.startedAt)],
        with: {
          exerciseLogs: {
            with: { sets: true },
          },
        },
      }),
  });
}

export function useSession(sessionId: string) {
  return useQuery({
    queryKey: ['sessions', sessionId],
    queryFn: async () => {
      const [session] = await db.select().from(workoutSessions).where(eq(workoutSessions.id, sessionId));
      return session ?? null;
    },
  });
}

export function useSessionExercises(sessionId: string) {
  return useQuery({
    queryKey: ['sessions', sessionId, 'exercises'],
    queryFn: () =>
      db.query.exerciseLogs.findMany({
        where: eq(exerciseLogs.workoutSessionId, sessionId),
        orderBy: (fields, { asc }) => [asc(fields.orderIndex)],
        with: {
          exercise: true,
          sets: {
            orderBy: (fields, { asc }) => [asc(fields.setNumber)],
          },
        },
      }),
  });
}

function useInvalidateSessionExercises(sessionId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['sessions', sessionId, 'exercises'] });
}

export function useReorderSessionExercises(sessionId: string) {
  const invalidate = useInvalidateSessionExercises(sessionId);
  return useMutation({
    mutationFn: async (orderedExerciseLogIds: string[]) => {
      await db.transaction(async (tx) => {
        for (const [index, exerciseLogId] of orderedExerciseLogIds.entries()) {
          await tx.update(exerciseLogs).set({ orderIndex: index }).where(eq(exerciseLogs.id, exerciseLogId));
        }
      });
    },
    onSuccess: invalidate,
  });
}

export function useRemoveExerciseLog(sessionId: string) {
  const invalidate = useInvalidateSessionExercises(sessionId);
  return useMutation({
    mutationFn: async (exerciseLogId: string) => {
      await db.transaction(async (tx) => {
        await tx.delete(setLogs).where(eq(setLogs.exerciseLogId, exerciseLogId));
        await tx.delete(exerciseLogs).where(eq(exerciseLogs.id, exerciseLogId));
      });
    },
    onSuccess: invalidate,
  });
}

export async function addExerciseToSession(sessionId: string, exerciseId: string, userId: string) {
  return db.transaction(async (tx) => {
    const [{ nextIndex } = { nextIndex: 0 }] = await tx
      .select({ nextIndex: max(exerciseLogs.orderIndex) })
      .from(exerciseLogs)
      .where(eq(exerciseLogs.workoutSessionId, sessionId));
    const [log] = await tx
      .insert(exerciseLogs)
      .values({ userId, workoutSessionId: sessionId, exerciseId, orderIndex: (nextIndex ?? -1) + 1 })
      .returning();
    return log;
  });
}

export function useAddExerciseToSession(sessionId: string) {
  const invalidate = useInvalidateSessionExercises(sessionId);
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (exerciseId: string) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      return addExerciseToSession(sessionId, exerciseId, user.id);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateExerciseLogNote(sessionId: string) {
  const invalidate = useInvalidateSessionExercises(sessionId);
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      db.update(exerciseLogs).set({ notes }).where(eq(exerciseLogs.id, id)),
    onSuccess: invalidate,
  });
}

export function useAddSet(sessionId: string) {
  const invalidate = useInvalidateSessionExercises(sessionId);
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ exerciseLogId }: { exerciseLogId: string }) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const [{ nextNumber } = { nextNumber: 0 }] = await db
        .select({ nextNumber: max(setLogs.setNumber) })
        .from(setLogs)
        .where(eq(setLogs.exerciseLogId, exerciseLogId));
      const setNumber = (nextNumber ?? 0) + 1;
      const defaults = await getDefaultRepMetricFields();
      return db.insert(setLogs).values({ userId: user.id, exerciseLogId, setNumber, ...defaults });
    },
    onSuccess: invalidate,
  });
}

// Converts an existing plain set into a left/right pair: the set itself
// becomes the "left" side, and a fresh empty "right" row is added alongside
// it (same setNumber). A per-set action rather than an exercise-wide flag —
// any set can be split independently of whether others on the same exercise
// are.
export function useSplitSetToUnilateral(sessionId: string) {
  const invalidate = useInvalidateSessionExercises(sessionId);
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (setId: string) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const [set] = await db.select().from(setLogs).where(eq(setLogs.id, setId));
      if (!set) {
        return;
      }
      const defaults = await getDefaultRepMetricFields();
      await db.transaction(async (tx) => {
        await tx.update(setLogs).set({ side: 'left' }).where(eq(setLogs.id, setId));
        await tx.insert(setLogs).values({
          userId: user.id,
          exerciseLogId: set.exerciseLogId,
          setNumber: set.setNumber,
          side: 'right',
          ...defaults,
        });
      });
    },
    onSuccess: invalidate,
  });
}

// Reverts a split pair back into a single plain set: discards the other
// side's row (if it exists) and clears `side` on the kept row.
export function useMergeUnilateralPair(sessionId: string) {
  const invalidate = useInvalidateSessionExercises(sessionId);
  return useMutation({
    mutationFn: async ({ keepId, discardId }: { keepId: string; discardId?: string }) => {
      await db.transaction(async (tx) => {
        if (discardId) {
          await tx.delete(setLogs).where(eq(setLogs.id, discardId));
        }
        await tx.update(setLogs).set({ side: null }).where(eq(setLogs.id, keepId));
      });
    },
    onSuccess: invalidate,
  });
}

export function useRemoveSet(sessionId: string) {
  const invalidate = useInvalidateSessionExercises(sessionId);
  return useMutation({
    mutationFn: (setId: string) => db.delete(setLogs).where(eq(setLogs.id, setId)),
    onSuccess: invalidate,
  });
}

export function useUpdateSet(sessionId: string) {
  const invalidate = useInvalidateSessionExercises(sessionId);
  return useMutation({
    mutationFn: ({
      id,
      ...values
    }: {
      id: string;
      weight?: number | null;
      reps?: number | null;
      rir?: number | null;
      rpe?: number | null;
      notes?: string | null;
      mediaUri?: string | null;
      mediaType?: 'image' | 'video' | null;
    }) => db.update(setLogs).set(values).where(eq(setLogs.id, id)),
    onSuccess: invalidate,
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      await db.transaction(async (tx) => {
        const logs = await tx
          .select({ id: exerciseLogs.id })
          .from(exerciseLogs)
          .where(eq(exerciseLogs.workoutSessionId, sessionId));
        const logIds = logs.map((l) => l.id);

        if (logIds.length > 0) {
          await tx.delete(setLogs).where(inArray(setLogs.exerciseLogId, logIds));
        }
        await tx.delete(exerciseLogs).where(eq(exerciseLogs.workoutSessionId, sessionId));

        const media = await tx
          .select({ cloudPath: workoutSessionMedia.cloudPath })
          .from(workoutSessionMedia)
          .where(eq(workoutSessionMedia.workoutSessionId, sessionId));
        await tx.delete(workoutSessionMedia).where(eq(workoutSessionMedia.workoutSessionId, sessionId));
        void deleteSessionMediaFromCloud(media.map((m) => m.cloudPath).filter((p): p is string => !!p));

        await tx.delete(workoutSessions).where(eq(workoutSessions.id, sessionId));
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useUpdateSessionMeta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...values }: { id: string; name?: string | null; notes?: string | null }) =>
      db.update(workoutSessions).set(values).where(eq(workoutSessions.id, id)),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['sessions', 'finished'] });
    },
  });
}

export function useFinishSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const [session] = await db.select().from(workoutSessions).where(eq(workoutSessions.id, id));
      const finishedAt = new Date().toISOString();
      await db.update(workoutSessions).set({ finishedAt }).where(eq(workoutSessions.id, id));

      // Optional enrichment, never blocks/fails the finish itself — see
      // queryWorkoutHealthSummary's own doc comment for why a null result
      // (no permission, no data in range, Health Connect unavailable) is the
      // expected everyday outcome here, not an error to surface.
      const summary = session && (await queryWorkoutHealthSummary(session.startedAt, finishedAt));
      if (summary) {
        await db
          .update(workoutSessions)
          .set({ ...summary, healthSyncedAt: new Date().toISOString() })
          .where(eq(workoutSessions.id, id));
      }
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', id] });
      queryClient.invalidateQueries({ queryKey: ['sessions', 'active'] });
    },
  });
}

export function useSessionMedia(sessionId: string) {
  return useQuery({
    queryKey: ['sessions', sessionId, 'media'],
    queryFn: () =>
      db.select().from(workoutSessionMedia).where(eq(workoutSessionMedia.workoutSessionId, sessionId)),
  });
}

export function useAddSessionMedia(sessionId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (media: { uri: string; type: 'image' | 'video' }) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const id = Crypto.randomUUID();
      await db.insert(workoutSessionMedia).values({ id, userId: user.id, workoutSessionId: sessionId, ...media });
      const settings = await getSettingsRow();
      if (settings?.mediaCloudBackup) {
        void uploadSessionMediaToCloud({ userId: user.id, mediaId: id, ...media })
          .then(async (cloudPath) => {
            await db.update(workoutSessionMedia).set({ userId: user.id, cloudPath }).where(eq(workoutSessionMedia.id, id));
            queryClient.invalidateQueries({ queryKey: ['sessions', sessionId, 'media'] });
          })
          .catch(() => undefined);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions', sessionId, 'media'] }),
  });
}

export function useRemoveSessionMedia(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const [media] = await db
        .select({ cloudPath: workoutSessionMedia.cloudPath })
        .from(workoutSessionMedia)
        .where(eq(workoutSessionMedia.id, id));
      await db.delete(workoutSessionMedia).where(eq(workoutSessionMedia.id, id));
      if (media?.cloudPath) void deleteSessionMediaFromCloud([media.cloudPath]);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions', sessionId, 'media'] }),
  });
}

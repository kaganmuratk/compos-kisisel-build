import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { and, desc, eq, max, ne, sql } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';

import { db } from '@/db/client';
import { exerciseLogs, exercises, programDayExercises, setLogs, workoutSessions } from '@/db/schema';
import { useAuth } from '@/hooks/use-auth';

// A past sync bug left duplicate rows (same name) for some exercises —
// collapsed here to one entry per name so pickers/lists don't show them
// twice. Read-only: nothing is written or deleted, every duplicate row and
// all of its logged history stays exactly as-is in the database — this
// only decides which single row represents that name in the returned list.
// Prefers whichever duplicate actually has logged sets (so the shown one
// isn't an empty shell), falling back to the oldest row.
export function useExercises() {
  return useQuery({
    queryKey: ['exercises'],
    queryFn: async () => {
      const rows = await db.select().from(exercises).orderBy(exercises.category, exercises.name);
      const loggedRows = await db.selectDistinct({ exerciseId: exerciseLogs.exerciseId }).from(exerciseLogs);
      const loggedIds = new Set(loggedRows.map((row) => row.exerciseId));

      const byName = new Map<string, (typeof rows)[number]>();
      for (const row of rows) {
        const key = row.name.trim().toLowerCase();
        const existing = byName.get(key);
        if (!existing) {
          byName.set(key, row);
          continue;
        }
        const existingHasHistory = loggedIds.has(existing.id);
        const rowHasHistory = loggedIds.has(row.id);
        const preferRow =
          (rowHasHistory && !existingHasHistory) ||
          (rowHasHistory === existingHasHistory && row.createdAt < existing.createdAt);
        if (preferRow) {
          byName.set(key, row);
        }
      }
      return rows.filter((row) => byName.get(row.name.trim().toLowerCase()) === row);
    },
  });
}

export function useExercise(id: string) {
  return useQuery({
    queryKey: ['exercises', id],
    queryFn: async () => {
      const [exercise] = await db.select().from(exercises).where(eq(exercises.id, id));
      return exercise ?? null;
    },
  });
}

export function useAddExercise() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: {
      name: string;
      category: string;
      isBodyweight?: boolean;
      isUnilateral?: boolean;
      weightMode?: 'kg' | 'pin';
      onPhase?: (phase: 'before-insert' | 'insert-returned' | 'row-readable') => void;
    }) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      // PowerSync-managed tables are SQLite views; awaiting a RETURNING
      // cursor can hang on web even when the local write is accepted. Use the
      // same explicit-id write pattern as nutrition custom foods, then return
      // the fields the caller needs for navigation.
      const { onPhase, ...exerciseValues } = values;
      const id = Crypto.randomUUID();
      onPhase?.('before-insert');
      await db.insert(exercises).values({
        id,
        userId: user.id,
        name: exerciseValues.name,
        category: exerciseValues.category,
        isCustom: true,
        isBodyweight: exerciseValues.isBodyweight ?? false,
        isUnilateral: exerciseValues.isUnilateral ?? false,
        weightMode: exerciseValues.weightMode ?? 'kg',
      });
      onPhase?.('insert-returned');
      const [created] = await db.select({ id: exercises.id }).from(exercises).where(eq(exercises.id, id));
      if (!created) throw new Error('EXERCISE_WRITE_NOT_READABLE');
      onPhase?.('row-readable');
      return { id, name: exerciseValues.name };
    },
    onSuccess: () => {
      // Keep this callback synchronous. Returning invalidateQueries' promise
      // would make mutateAsync wait for the mounted picker query, which can
      // be delayed independently of the completed local write.
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
    },
  });
}

export function useExerciseHistory(exerciseId: string) {
  return useQuery({
    queryKey: ['exercises', exerciseId, 'history'],
    queryFn: () =>
      db
        .select({
          sessionId: workoutSessions.id,
          exerciseLogId: exerciseLogs.id,
          date: workoutSessions.date,
          setId: setLogs.id,
          setNumber: setLogs.setNumber,
          side: setLogs.side,
          weight: setLogs.weight,
          reps: setLogs.reps,
          rir: setLogs.rir,
          rpe: setLogs.rpe,
          notes: setLogs.notes,
        })
        .from(setLogs)
        .innerJoin(exerciseLogs, eq(setLogs.exerciseLogId, exerciseLogs.id))
        .innerJoin(workoutSessions, eq(exerciseLogs.workoutSessionId, workoutSessions.id))
        .where(eq(exerciseLogs.exerciseId, exerciseId))
        .orderBy(workoutSessions.date, setLogs.setNumber),
  });
}

// Edits an existing historical set log (weight/reps/rir/rpe/notes) from the
// analysis screen — same shape as the live-workout useUpdateSet, just scoped
// to the exercise's history query instead of a session's.
export function useUpdateHistoricalSet(exerciseId: string) {
  const queryClient = useQueryClient();
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
    }) => db.update(setLogs).set(values).where(eq(setLogs.id, id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exercises', exerciseId, 'history'] }),
  });
}

// Adds a new set to an existing historical exerciseLog — lets a past
// session's entry be filled in after the fact, same numbering logic as
// useAddSet in the live workout.
export function useAddHistoricalSet(exerciseId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (exerciseLogId: string) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const [{ nextNumber } = { nextNumber: 0 }] = await db
        .select({ nextNumber: max(setLogs.setNumber) })
        .from(setLogs)
        .where(eq(setLogs.exerciseLogId, exerciseLogId));
      const setNumber = (nextNumber ?? 0) + 1;
      return db.insert(setLogs).values({ userId: user.id, exerciseLogId, setNumber });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exercises', exerciseId, 'history'] }),
  });
}

// excludeSessionId omits sets logged in the currently active session — this
// modal is opened mid-workout to look at *past* history, not an echo of what
// was just typed into the live session.
export function useRecentExerciseSets(exerciseId: string, excludeSessionId?: string, limit = 5) {
  return useQuery({
    queryKey: ['exercises', exerciseId, 'recent-sets', excludeSessionId, limit],
    queryFn: () =>
      db
        .select({
          setId: setLogs.id,
          date: workoutSessions.date,
          setNumber: setLogs.setNumber,
          side: setLogs.side,
          weight: setLogs.weight,
          reps: setLogs.reps,
          rir: setLogs.rir,
          rpe: setLogs.rpe,
          setNotes: setLogs.notes,
          exerciseNotes: exerciseLogs.notes,
          sessionNotes: workoutSessions.notes,
        })
        .from(setLogs)
        .innerJoin(exerciseLogs, eq(setLogs.exerciseLogId, exerciseLogs.id))
        .innerJoin(workoutSessions, eq(exerciseLogs.workoutSessionId, workoutSessions.id))
        .where(
          excludeSessionId
            ? and(eq(exerciseLogs.exerciseId, exerciseId), ne(workoutSessions.id, excludeSessionId))
            : eq(exerciseLogs.exerciseId, exerciseId)
        )
        .orderBy(desc(workoutSessions.date), desc(setLogs.createdAt))
        .limit(limit),
  });
}

// Mirrors useRecentFoods' pattern (src/db/queries/nutrition.ts): walk recent
// logged sessions newest-first and keep the first occurrence of each
// exercise, so "recent" naturally reads as "frequent" too for exercises
// someone trains every week.
export function useRecentExercises(limit = 8) {
  return useQuery({
    queryKey: ['exercises', 'recent', limit],
    queryFn: async () => {
      const rows = await db
        .select({ exercise: exercises, sessionDate: workoutSessions.date, sessionStartedAt: workoutSessions.startedAt })
        .from(exerciseLogs)
        .innerJoin(exercises, eq(exerciseLogs.exerciseId, exercises.id))
        .innerJoin(workoutSessions, eq(exerciseLogs.workoutSessionId, workoutSessions.id))
        .orderBy(desc(workoutSessions.date), desc(workoutSessions.startedAt))
        .limit(200);
      const seen = new Set<string>();
      const recent: (typeof exercises.$inferSelect)[] = [];
      for (const row of rows) {
        if (seen.has(row.exercise.id)) continue;
        seen.add(row.exercise.id);
        recent.push(row.exercise);
        if (recent.length >= limit) break;
      }
      return recent;
    },
  });
}

// Ordered by how many times an exercise has actually been logged (a set
// recorded against it), not when it was last used — for the "Hareket Seç"
// picker (Kağan's request: the exercises he does every workout should be
// right at the top instead of buried alphabetically in their category).
export function useMostUsedExercises(limit = 8) {
  return useQuery({
    queryKey: ['exercises', 'most-used', limit],
    queryFn: async () => {
      const rows = await db
        .select({ exercise: exercises, useCount: sql<number>`count(*)` })
        .from(exerciseLogs)
        .innerJoin(exercises, eq(exerciseLogs.exerciseId, exercises.id))
        .groupBy(exercises.id)
        .orderBy(desc(sql`count(*)`))
        .limit(limit);
      return rows.map((row) => row.exercise);
    },
  });
}

export function useUpdateExerciseImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, imageUri }: { id: string; imageUri: string }) =>
      db.update(exercises).set({ imageUri }).where(eq(exercises.id, id)),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      queryClient.invalidateQueries({ queryKey: ['exercises', variables.id] });
    },
  });
}

export function useUpdateExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...values }: { id: string; name?: string; category?: string }) =>
      db.update(exercises).set(values).where(eq(exercises.id, id)),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      queryClient.invalidateQueries({ queryKey: ['exercises', variables.id] });
    },
  });
}

// Blocks deletion (rather than silently orphaning rows) when the exercise
// has logged history — exerciseLogs/programDayExercises reference
// exerciseId with no onDelete clause, and FK enforcement is never turned on
// at runtime (see src/db/client.ts), so a naive delete wouldn't error, it
// would just leave dangling references that crash relational reads
// elsewhere (e.g. program day screens reading `item.exercise.name`).
export function useDeleteExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (exerciseId: string) => {
      const usedInHistory = await db
        .select({ id: exerciseLogs.id })
        .from(exerciseLogs)
        .where(eq(exerciseLogs.exerciseId, exerciseId))
        .limit(1);
      if (usedInHistory.length > 0) {
        throw new Error('HAS_HISTORY');
      }
      await db.transaction(async (tx) => {
        await tx.delete(programDayExercises).where(eq(programDayExercises.exerciseId, exerciseId));
        await tx.delete(exercises).where(eq(exercises.id, exerciseId));
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exercises'] }),
  });
}

// Re-points an existing exercise's logged history (and program-day template
// entries) onto a different exercise — used when creating a new exercise to
// replace an old one, so past progress carries over instead of starting
// from zero. The source exercise itself is left untouched (now with no
// history), so it can be deleted afterward via useDeleteExercise if unwanted.
export function useTransferExerciseHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ fromExerciseId, toExerciseId }: { fromExerciseId: string; toExerciseId: string }) => {
      await db.transaction(async (tx) => {
        await tx.update(exerciseLogs).set({ exerciseId: toExerciseId }).where(eq(exerciseLogs.exerciseId, fromExerciseId));
        await tx
          .update(programDayExercises)
          .set({ exerciseId: toExerciseId })
          .where(eq(programDayExercises.exerciseId, fromExerciseId));
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exercises'] }),
  });
}

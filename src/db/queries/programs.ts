import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eq, inArray, max } from 'drizzle-orm';

import { db } from '@/db/client';
import { exerciseLogs, programDayExercises, programDays, programs, setLogs, workoutSessions } from '@/db/schema';
import { getDefaultRepMetricFields } from '@/db/queries/workout';
import { useAuth } from '@/hooks/use-auth';
import { getTodayDateString } from '@/lib/date';

// "6-8" -> 6, "8" -> 8, "8-10 dropset" -> 8. Falls back to null if no number found.
function firstNumberIn(text: string | null): number | null {
  if (!text) {
    return null;
  }
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : null;
}

export function usePrograms() {
  return useQuery({
    queryKey: ['programs'],
    queryFn: () => db.query.programs.findMany({ with: { days: true } }),
  });
}

export function useAddProgram() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const [program] = await db.insert(programs).values({ userId: user.id, name }).returning();
      return program;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['programs'] }),
  });
}

export function useProgram(id: string) {
  return useQuery({
    queryKey: ['programs', id],
    queryFn: async () => {
      const [program] = await db.select().from(programs).where(eq(programs.id, id));
      return program ?? null;
    },
  });
}

export function useDeleteProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (programId: string) => {
      await db.transaction(async (tx) => {
        const days = await tx
          .select({ id: programDays.id })
          .from(programDays)
          .where(eq(programDays.programId, programId));
        const dayIds = days.map((d) => d.id);
        if (dayIds.length > 0) {
          await tx.delete(programDayExercises).where(inArray(programDayExercises.programDayId, dayIds));
          // workoutSessions.programDayId has no onDelete clause in Postgres —
          // a session still pointing at a deleted day would get rejected on
          // upload (dangling FK), permanently jamming the sync queue.
          await tx.update(workoutSessions).set({ programDayId: null }).where(inArray(workoutSessions.programDayId, dayIds));
        }
        await tx.delete(programDays).where(eq(programDays.programId, programId));
        await tx.delete(programs).where(eq(programs.id, programId));
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['programs'] }),
  });
}

export function useProgramDays(programId: string) {
  return useQuery({
    queryKey: ['programs', programId, 'days'],
    queryFn: () =>
      db.query.programDays.findMany({
        where: eq(programDays.programId, programId),
        orderBy: (fields, { asc }) => [asc(fields.orderIndex)],
      }),
  });
}

export function useAddProgramDay(programId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const [{ nextIndex } = { nextIndex: 0 }] = await db
        .select({ nextIndex: max(programDays.orderIndex) })
        .from(programDays)
        .where(eq(programDays.programId, programId));
      const [day] = await db
        .insert(programDays)
        .values({ userId: user.id, programId, name, orderIndex: (nextIndex ?? -1) + 1 })
        .returning();
      return day;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['programs', programId, 'days'] }),
  });
}

export function useDeleteProgramDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ dayId }: { dayId: string; programId: string }) => {
      await db.transaction(async (tx) => {
        await tx.delete(programDayExercises).where(eq(programDayExercises.programDayId, dayId));
        await tx.update(workoutSessions).set({ programDayId: null }).where(eq(workoutSessions.programDayId, dayId));
        await tx.delete(programDays).where(eq(programDays.id, dayId));
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['programs', variables.programId, 'days'] });
    },
  });
}

export function useProgramDay(dayId: string) {
  return useQuery({
    queryKey: ['program-days', dayId],
    queryFn: async () => {
      const [day] = await db.select().from(programDays).where(eq(programDays.id, dayId));
      return day ?? null;
    },
  });
}

export function useDayExercises(dayId: string) {
  return useQuery({
    queryKey: ['program-days', dayId, 'exercises'],
    queryFn: () =>
      db.query.programDayExercises.findMany({
        where: eq(programDayExercises.programDayId, dayId),
        orderBy: (fields, { asc }) => [asc(fields.orderIndex)],
        with: { exercise: true },
      }),
  });
}

function useInvalidateDayExercises(dayId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['program-days', dayId, 'exercises'] });
}

export function useAddExerciseToDay(dayId: string) {
  const invalidate = useInvalidateDayExercises(dayId);
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (exerciseId: string) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const [{ nextIndex } = { nextIndex: 0 }] = await db
        .select({ nextIndex: max(programDayExercises.orderIndex) })
        .from(programDayExercises)
        .where(eq(programDayExercises.programDayId, dayId));
      return db.insert(programDayExercises).values({
        userId: user.id,
        programDayId: dayId,
        exerciseId,
        orderIndex: (nextIndex ?? -1) + 1,
        targetSets: 3,
      });
    },
    onSuccess: invalidate,
  });
}

export function useUpdateDayExercise(dayId: string) {
  const invalidate = useInvalidateDayExercises(dayId);
  return useMutation({
    mutationFn: ({
      id,
      ...values
    }: {
      id: string;
      targetSets?: number | null;
      targetReps?: string | null;
      targetRir?: number | null;
    }) => db.update(programDayExercises).set(values).where(eq(programDayExercises.id, id)),
    onSuccess: invalidate,
  });
}

export function useRemoveDayExercise(dayId: string) {
  const invalidate = useInvalidateDayExercises(dayId);
  return useMutation({
    mutationFn: (id: string) => db.delete(programDayExercises).where(eq(programDayExercises.id, id)),
    onSuccess: invalidate,
  });
}

export function useStartSessionFromDay() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ dayId, name, notes }: { dayId: string; name?: string; notes?: string }) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const dayExercises = await db.query.programDayExercises.findMany({
        where: eq(programDayExercises.programDayId, dayId),
        orderBy: (fields, { asc }) => [asc(fields.orderIndex)],
      });

      const [session] = await db
        .insert(workoutSessions)
        .values({ userId: user.id, date: getTodayDateString(), programDayId: dayId, name, notes })
        .returning();

      const defaults = await getDefaultRepMetricFields();

      for (const [index, dayExercise] of dayExercises.entries()) {
        const [log] = await db
          .insert(exerciseLogs)
          .values({ userId: user.id, workoutSessionId: session.id, exerciseId: dayExercise.exerciseId, orderIndex: index })
          .returning();

        const setCount = dayExercise.targetSets ?? 1;
        const reps = firstNumberIn(dayExercise.targetReps);
        const rir = dayExercise.targetRir ?? defaults.rir ?? null;
        const rpe = defaults.rpe ?? null;
        for (let setNumber = 1; setNumber <= setCount; setNumber += 1) {
          await db.insert(setLogs).values({ userId: user.id, exerciseLogId: log.id, setNumber, reps, rir, rpe });
        }
      }

      return session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

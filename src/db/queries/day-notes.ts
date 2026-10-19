import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/db/client';
import {
  cardioSessions,
  dailyCheckins,
  dayNotes,
  exerciseLogs,
  nutritionLogs,
  setLogs,
  supplementLogs,
  waterLogs,
  workoutSessionMedia,
  workoutSessions,
} from '@/db/schema';
import { useAuth } from '@/hooks/use-auth';

export function useDayNotes() {
  return useQuery({
    queryKey: ['day-notes'],
    queryFn: () => db.select().from(dayNotes),
  });
}

export function useSaveDayNote() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ date, ...values }: { date: string; name?: string | null; note?: string | null }) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      // PowerSync-managed tables are SQLite views, not real tables —
      // INSERT ... ON CONFLICT DO UPDATE can't target a view ("cannot upsert
      // a view"), so this has to be a manual check-then-write instead (see
      // the identical pattern in db/queries/daily.ts's useSaveCheckin).
      const [existing] = await db
        .select({ id: dayNotes.id })
        .from(dayNotes)
        .where(and(eq(dayNotes.userId, user.id), eq(dayNotes.date, date)));
      if (existing) {
        await db.update(dayNotes).set(values).where(eq(dayNotes.id, existing.id));
      } else {
        await db.insert(dayNotes).values({ userId: user.id, date, ...values });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['day-notes'] }),
  });
}

export function useDeleteDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (date: string) => {
      await db.transaction(async (tx) => {
        const sessions = await tx
          .select({ id: workoutSessions.id })
          .from(workoutSessions)
          .where(eq(workoutSessions.date, date));
        const sessionIds = sessions.map((s) => s.id);

        if (sessionIds.length > 0) {
          const logs = await tx
            .select({ id: exerciseLogs.id })
            .from(exerciseLogs)
            .where(inArray(exerciseLogs.workoutSessionId, sessionIds));
          const logIds = logs.map((l) => l.id);

          if (logIds.length > 0) {
            await tx.delete(setLogs).where(inArray(setLogs.exerciseLogId, logIds));
          }
          await tx.delete(exerciseLogs).where(inArray(exerciseLogs.workoutSessionId, sessionIds));
          await tx.delete(workoutSessionMedia).where(inArray(workoutSessionMedia.workoutSessionId, sessionIds));
        }

        await tx.delete(workoutSessions).where(eq(workoutSessions.date, date));
        await tx.delete(cardioSessions).where(eq(cardioSessions.date, date));
        await tx.delete(nutritionLogs).where(eq(nutritionLogs.date, date));
        await tx.delete(dailyCheckins).where(eq(dailyCheckins.date, date));
        await tx.delete(waterLogs).where(eq(waterLogs.date, date));
        await tx.delete(supplementLogs).where(eq(supplementLogs.date, date));
        await tx.delete(dayNotes).where(eq(dayNotes.date, date));
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['cardio-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['nutrition-logs'] });
      queryClient.invalidateQueries({ queryKey: ['daily-checkin'] });
      queryClient.invalidateQueries({ queryKey: ['water'] });
      queryClient.invalidateQueries({ queryKey: ['supplement-logs'] });
      queryClient.invalidateQueries({ queryKey: ['day-notes'] });
    },
  });
}

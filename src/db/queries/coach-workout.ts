import { useMutation, useQueryClient } from '@tanstack/react-query';
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { exerciseLogs, programDayExercises, setLogs, workoutSessions } from '@/db/schema';
import { useAuth } from '@/hooks/use-auth';
import { getTodayDateString } from '@/lib/date';

// Compos Kişisel: koç planındaki bir günü antrenman olarak başlatır. useStartSessionFromDay'den
// farkı setlerin BOŞ açılması — hedefler (koç sunucusundan) gri ipucu olarak görünür, Kağan
// yaptığı sete ✓ basar ya da farklı yaptıysa sayıyı yazar; boş kalan set "yapılmadı" demektir.
export function useStartCoachSession() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ dayId, name }: { dayId: string; name?: string }) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const dayExercises = await db.query.programDayExercises.findMany({
        where: eq(programDayExercises.programDayId, dayId),
        orderBy: (fields, { asc }) => [asc(fields.orderIndex)],
      });
      if (dayExercises.length === 0) throw new Error('PLAN_DAY_NOT_SYNCED');

      const [session] = await db
        .insert(workoutSessions)
        .values({ userId: user.id, date: getTodayDateString(), programDayId: dayId, name })
        .returning();

      for (const [index, dayExercise] of dayExercises.entries()) {
        const [log] = await db
          .insert(exerciseLogs)
          .values({ userId: user.id, workoutSessionId: session.id, exerciseId: dayExercise.exerciseId, orderIndex: index })
          .returning();
        for (let setNumber = 1; setNumber <= (dayExercise.targetSets ?? 1); setNumber += 1) {
          await db.insert(setLogs).values({ userId: user.id, exerciseLogId: log.id, setNumber });
        }
      }
      return session;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
}

/** Bugün bu plan gününden başlatılmış antrenman (bitmiş ya da süren) — kart "Devam et"/"Yapıldı" göstersin diye. */
export async function findTodaySessionForDay(dayId: string) {
  const rows = await db.query.workoutSessions.findMany({
    where: (fields, { and, eq: equals }) => and(equals(fields.programDayId, dayId), equals(fields.date, getTodayDateString())),
    orderBy: (fields, { desc }) => [desc(fields.startedAt)],
    limit: 1,
  });
  return rows[0] ?? null;
}

import { useMemo } from 'react';

import { useCardioHistory } from '@/db/queries/cardio';
import { useCheckinHistory, useCoffeeHistory, useWaterHistory } from '@/db/queries/daily';
import { useDayNotes } from '@/db/queries/day-notes';
import { useNutritionDaysHistory } from '@/db/queries/nutrition';
import { useSupplementLogsHistory } from '@/db/queries/supplements';
import { useFinishedSessions } from '@/db/queries/workout';

export type WorkoutSession = NonNullable<ReturnType<typeof useFinishedSessions>['data']>[number];
export type CardioSession = NonNullable<ReturnType<typeof useCardioHistory>['data']>[number];
export type NutritionDay = NonNullable<ReturnType<typeof useNutritionDaysHistory>['data']>[number];
export type Checkin = NonNullable<ReturnType<typeof useCheckinHistory>['data']>[number];
export type DayNote = NonNullable<ReturnType<typeof useDayNotes>['data']>[number];
export type SupplementLog = NonNullable<ReturnType<typeof useSupplementLogsHistory>['data']>[number];

export type DayEntry = {
  date: string;
  workouts: WorkoutSession[];
  runs: CardioSession[];
  nutrition: NutritionDay | null;
  checkin: Checkin | null;
  water: number | null;
  coffee: number | null;
  dayNote: DayNote | null;
  supplements: SupplementLog[];
};

export function useHistoryDays(): DayEntry[] {
  const { data: sessions = [] } = useFinishedSessions();
  const { data: runs = [] } = useCardioHistory();
  const { data: nutritionDays = [] } = useNutritionDaysHistory();
  const { data: checkins = [] } = useCheckinHistory();
  const { data: waterDays = [] } = useWaterHistory();
  const { data: coffeeDays = [] } = useCoffeeHistory();
  const { data: dayNotesList = [] } = useDayNotes();
  const { data: supplementLogs = [] } = useSupplementLogsHistory();

  return useMemo(() => {
    const map = new Map<string, DayEntry>();
    const ensure = (date: string) => {
      let entry = map.get(date);
      if (!entry) {
        entry = {
          date,
          workouts: [],
          runs: [],
          nutrition: null,
          checkin: null,
          water: null,
          coffee: null,
          dayNote: null,
          supplements: [],
        };
        map.set(date, entry);
      }
      return entry;
    };

    for (const session of sessions) ensure(session.date).workouts.push(session);
    for (const run of runs) ensure(run.date).runs.push(run);
    for (const day of nutritionDays) ensure(day.date).nutrition = day;
    for (const checkin of checkins) ensure(checkin.date).checkin = checkin;
    for (const water of waterDays) ensure(water.date).water = water.total;
    for (const coffee of coffeeDays) ensure(coffee.date).coffee = coffee.count;
    for (const dayNote of dayNotesList) ensure(dayNote.date).dayNote = dayNote;
    for (const log of supplementLogs) ensure(log.date).supplements.push(log);

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [sessions, runs, nutritionDays, checkins, waterDays, coffeeDays, dayNotesList, supplementLogs]);
}

export function useHistoryDay(date: string): DayEntry | undefined {
  const days = useHistoryDays();
  return days.find((d) => d.date === date) ?? {
    date, workouts: [], runs: [], nutrition: null, checkin: null, water: null,
    coffee: null, dayNote: null, supplements: [],
  };
}

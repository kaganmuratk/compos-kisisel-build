import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { useSettings } from '@/db/queries/settings';
import { foods, nutritionGoalSnapshots, nutritionLogs, settings } from '@/db/schema';
import { useAuth } from '@/hooks/use-auth';
import { alertMessage } from '@/lib/alert';
import { getTodayDateString } from '@/lib/date';
import { findFoodNamesByEnglishQuery, getFoodNameLabel } from '@/lib/food-name';

// Stamps the goals active right now onto `date` the first time it gets a
// nutrition log — skipping an already-stamped day means later goal changes
// never touch it, so history keeps showing what you were aiming for at the
// time, not whatever Settings says today. (Manual check-then-insert instead
// of onConflictDoNothing: PowerSync-managed tables are SQLite views, and
// SQLite's upsert syntax can't target a view — "cannot upsert a view".)
async function ensureNutritionGoalSnapshot(userId: string, date: string) {
  const [existing] = await db
    .select({ id: nutritionGoalSnapshots.id })
    .from(nutritionGoalSnapshots)
    .where(and(eq(nutritionGoalSnapshots.userId, userId), eq(nutritionGoalSnapshots.date, date)));
  if (existing) {
    return;
  }
  const [currentSettings] = await db.select().from(settings).limit(1);
  await db.insert(nutritionGoalSnapshots).values({
    userId,
    date,
    calorieGoal: currentSettings?.calorieGoal ?? 2000,
    proteinGoal: currentSettings?.proteinGoal ?? 150,
    carbsGoal: currentSettings?.carbsGoal ?? 200,
    fatGoal: currentSettings?.fatGoal ?? 65,
  });
}

export function useNutritionGoalSnapshot(date: string) {
  return useQuery({
    queryKey: ['nutrition-goal-snapshot', date],
    queryFn: async () => {
      const [row] = await db.select().from(nutritionGoalSnapshots).where(eq(nutritionGoalSnapshots.date, date));
      return row ?? null;
    },
  });
}

export function useNutritionGoalSnapshotsHistory() {
  return useQuery({
    queryKey: ['nutrition-goal-snapshot', 'history'],
    queryFn: () => db.select().from(nutritionGoalSnapshots).orderBy(desc(nutritionGoalSnapshots.date)),
  });
}

// A meal category id: one of the 4 built-in `mealTypes` keys, or a
// `mealCategories.id` for a user-added custom category — both are just
// strings in the `mealType` column (see schema.ts), so this is intentionally
// not narrowed to the 4-value union anymore.
export type MealType = string;

export function useFoodSearch(query: string) {
  const trimmed = query.trim();
  const { data: userSettings } = useSettings();
  const language = userSettings?.language ?? 'tr';
  // `foods.name` is always the original Turkish name — in English mode the
  // user types English terms, so a plain `like` against that column alone
  // finds nothing for most queries. Widen the match to also catch any
  // catalog name whose English translation contains the query.
  const translatedNameMatches = language === 'en' ? findFoodNamesByEnglishQuery(trimmed) : [];
  return useQuery({
    queryKey: ['foods-search', trimmed, language],
    // Plain `like` with no ordering left results in roughly insertion
    // order, which reads as arbitrary — searching "tavuk" could bury the
    // raw "Tavuk Göğsü, çiğ" entry near the bottom under dozens of dishes
    // whose names happen to also start with "tavuk". This ranks results
    // into tiers instead: exact name match, then names that start with the
    // query AND look like this catalog's "basic ingredient" style (a comma
    // or parenthetical qualifier right in the name, e.g. "Pirinç (çiğ)",
    // "Tavuk Göğsü, çiğ" — that style consistently marks raw/plain items
    // here, as opposed to composed dish names), then other names starting
    // with the query, then everywhere else the query appears. Shorter
    // names break ties within a tier — on average the more basic item.
    queryFn: () =>
      db
        .select()
        .from(foods)
        .where(
          translatedNameMatches.length > 0
            ? or(like(foods.name, `%${trimmed}%`), inArray(foods.name, translatedNameMatches))
            : like(foods.name, `%${trimmed}%`)
        )
        .orderBy(
          sql`case
            when lower(${foods.name}) = lower(${trimmed}) then 0
            when lower(${foods.name}) like lower(${trimmed}) || '%' and (${foods.name} like '%,%' or ${foods.name} like '%(%') then 1
            when lower(${foods.name}) like lower(${trimmed}) || '%' then 2
            else 3
          end`,
          sql`length(${foods.name})`,
          foods.name
        )
        .limit(50),
    enabled: trimmed.length >= 2,
  });
}

// Shown before the user types anything — recently-logged foods, deduped to
// one entry each (most recent use), most recent first. Pulls a wider slice
// of raw log rows than the final list needs (some will dedupe away) rather
// than a SQL-level "distinct on food_id ordered by logged_at" — SQLite/
// Drizzle doesn't have a clean way to express that, and 200 rows is cheap
// to dedupe in JS.
export function useRecentFoods(limit = 10) {
  return useQuery({
    queryKey: ['foods-recent', limit],
    queryFn: async () => {
      const rows = await db
        .select({ food: foods, loggedAt: nutritionLogs.loggedAt })
        .from(nutritionLogs)
        .innerJoin(foods, eq(nutritionLogs.foodId, foods.id))
        .orderBy(desc(nutritionLogs.loggedAt))
        .limit(200);
      const seen = new Set<string>();
      const recent: (typeof foods.$inferSelect)[] = [];
      for (const row of rows) {
        if (seen.has(row.food.id)) {
          continue;
        }
        seen.add(row.food.id);
        recent.push(row.food);
        if (recent.length >= limit) {
          break;
        }
      }
      return recent;
    },
  });
}

export function useAddCustomFood() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: {
      id?: string;
      name: string;
      category: string;
      caloriesPer100g: number;
      proteinPer100g: number;
      carbsPer100g: number;
      fatPer100g: number;
    }) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      // Keep this insert compatible with the PowerSync-backed foods view on
      // web. The write is all the caller needs; returning rows from this
      // view can fail after the row has already been accepted locally.
      const id = values.id ?? Crypto.randomUUID();
      await db.insert(foods).values({ ...values, id, userId: user.id, source: 'custom', isCustom: true });
      return id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['foods-search'] }),
    onError: (error) => {
      alertMessage('Could not save food', error instanceof Error ? error.message : String(error));
    },
  });
}

// A food lookup can fail to resolve locally for a log entry that's
// perfectly real (not just briefly, right after a cross-device sync repair
// remaps foodId to a row this device hasn't downloaded yet, but
// potentially permanently, if that food was itself never able to sync —
// see repairOrphanedCatalogReferences in seed.ts and CLAUDE.md's
// "insert/update her zaman userId taşımalı" rule for why). An inner join
// here would make the ENTIRE log entry vanish from every nutrition screen
// whenever that happens — the log row is still there, right up until you
// scroll past it in silence. A left join plus COALESCE defaults keeps the
// entry visible (with a placeholder name and zeroed macros) instead of
// losing it from view.
const foodFields = {
  foodName: sql<string>`coalesce(${foods.name}, 'Unknown food')`,
  caloriesPer100g: sql<number>`coalesce(${foods.caloriesPer100g}, 0)`,
  proteinPer100g: sql<number>`coalesce(${foods.proteinPer100g}, 0)`,
  carbsPer100g: sql<number>`coalesce(${foods.carbsPer100g}, 0)`,
  fatPer100g: sql<number>`coalesce(${foods.fatPer100g}, 0)`,
  saturatedFatPer100g: foods.saturatedFatPer100g,
  unsaturatedFatPer100g: foods.unsaturatedFatPer100g,
  transFatPer100g: foods.transFatPer100g,
  sugarsPer100g: foods.sugarsPer100g,
  fiberPer100g: foods.fiberPer100g,
  saltPer100g: foods.saltPer100g,
  extraNutrients: foods.extraNutrients,
};

// Both hooks below translate `foodName` here (instead of leaving it to each
// screen) so every consumer — today's meal list, log edit title, workout
// before/after nutrition, share cards — gets the same English name in
// English mode without having to remember to call getFoodNameLabel itself.
// Previously none of them did, so a logged food always showed its raw
// Turkish catalog name even with language set to English.
export function useNutritionLogsForDate(date: string) {
  const { data: userSettings } = useSettings();
  const language = userSettings?.language ?? 'tr';
  return useQuery({
    queryKey: ['nutrition-logs', date],
    queryFn: () =>
      db
        .select({
          id: nutritionLogs.id,
          mealType: nutritionLogs.mealType,
          amountGrams: nutritionLogs.amountGrams,
          loggedAt: nutritionLogs.loggedAt,
          ...foodFields,
        })
        .from(nutritionLogs)
        .leftJoin(foods, eq(nutritionLogs.foodId, foods.id))
        .where(eq(nutritionLogs.date, date))
        .orderBy(nutritionLogs.loggedAt),
    select: (rows) => rows.map((row) => ({ ...row, foodName: getFoodNameLabel(row.foodName, language) })),
  });
}

export function useNutritionLog(id: string) {
  const { data: userSettings } = useSettings();
  const language = userSettings?.language ?? 'tr';
  return useQuery({
    queryKey: ['nutrition-logs', 'single', id],
    queryFn: async () => {
      const [row] = await db
        .select({
          id: nutritionLogs.id,
          mealType: nutritionLogs.mealType,
          amountGrams: nutritionLogs.amountGrams,
          ...foodFields,
        })
        .from(nutritionLogs)
        .leftJoin(foods, eq(nutritionLogs.foodId, foods.id))
        .where(eq(nutritionLogs.id, id));
      return row ?? null;
    },
    select: (row) => (row ? { ...row, foodName: getFoodNameLabel(row.foodName, language) } : row),
  });
}

export function useTodayNutritionLogs() {
  return useNutritionLogsForDate(getTodayDateString());
}

export function useNutritionDaysHistory() {
  return useQuery({
    queryKey: ['nutrition-logs', 'days'],
    queryFn: () =>
      db
        .select({
          date: nutritionLogs.date,
          totalCalories: sql<number>`coalesce(sum(${foods.caloriesPer100g} * ${nutritionLogs.amountGrams} / 100.0), 0)`,
        })
        .from(nutritionLogs)
        .leftJoin(foods, eq(nutritionLogs.foodId, foods.id))
        .groupBy(nutritionLogs.date)
        .orderBy(desc(nutritionLogs.date)),
  });
}

// date defaults to today; history editing passes an explicit past date so
// the same mutation can add retroactive entries.
export function useAddNutritionLog() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: { foodId: string; mealType: MealType; amountGrams: number; date?: string; loggedAt?: string }) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const { date = getTodayDateString(), ...rest } = values;
      await ensureNutritionGoalSnapshot(user.id, date);
      return db.insert(nutritionLogs).values({ userId: user.id, date, ...rest });
    },
    // Broad prefix invalidation: covers the specific date's query and the
    // 'days' history list used by trend totals.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['nutrition-logs'] }),
    onError: (error) => {
      // Temporary diagnostic — same silent-failure investigation as
      // useSaveCheckin in daily.ts (2026-08-11).
      alertMessage('Could not add food', error instanceof Error ? error.message : String(error));
    },
  });
}

export function useUpdateNutritionLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...values }: { id: string; mealType?: MealType; amountGrams?: number }) =>
      db.update(nutritionLogs).set(values).where(eq(nutritionLogs.id, id)),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['nutrition-logs'] });
      queryClient.invalidateQueries({ queryKey: ['nutrition-logs', 'single', variables.id] });
    },
    onError: (error) => {
      alertMessage('Could not update food', error instanceof Error ? error.message : String(error));
    },
  });
}

export function useRemoveNutritionLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.delete(nutritionLogs).where(eq(nutritionLogs.id, id)),
    // Broad prefix invalidation: the caller may be removing a log for today
    // or for a past date (history editing) — covers both plus the 'days'
    // history list used by trend totals.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['nutrition-logs'] }),
    onError: (error) => {
      alertMessage('Could not delete food', error instanceof Error ? error.message : String(error));
    },
  });
}

export function useDeleteNutritionDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => db.delete(nutritionLogs).where(eq(nutritionLogs.date, date)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['nutrition-logs'] }),
  });
}

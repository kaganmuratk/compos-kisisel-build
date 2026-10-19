import { sqliteDb } from '@/db/client';
import { db } from '@/db/powersync';
import * as schema from '@/db/schema';

// One-time import from the pre-Faz-2 database ('fitness.db', integer ids, no
// user_id — still opened read-only as `sqliteDb`) into the PowerSync-managed
// database ('fitness-sync.db', uuid ids). Every insert goes through the
// PowerSync-wrapped drizzle `db`, so PowerSync's own view/trigger machinery
// queues each imported row for first upload automatically — no separate
// "mark as dirty" step needed.
//
// Safety: `sqliteDb` (the old file) is only ever read here, never written to
// — even a completely botched import leaves it untouched, so the worst case
// is deleting 'fitness-sync.db' and re-running this from scratch, not data
// loss. Old-id -> new-id maps are built as each parent table is imported, so
// child tables' foreign keys can be remapped correctly. The whole import runs
// inside one transaction: the idempotency guard below only checks whether
// `exercises` has any row, so a partial import (app killed mid-migration)
// left uncommitted would otherwise be mistaken for "already done" on the next
// launch, silently dropping everything after wherever it stopped.
//
// Existing data on the currently-installed device is single-user (this app
// was local-only before Faz 2), so every row — including the shared seed
// library exercises/foods — gets stamped with the currently-signed-in user's
// id. (Earlier this stayed null for non-custom rows to preserve the "shared
// library" ownership model, but the Postgres RLS insert policy requires
// user_id = auth.uid(); a null user_id gets rejected on upload and jams
// PowerSync's upload queue permanently — same failure mode fixed in
// seed.ts's seeding functions.)

export async function runUuidMigration(userId: string): Promise<void> {
  // Idempotency guard: if the new database already has data, either this
  // already ran, or it's a fresh install with nothing to import either way.
  const [alreadyImported] = await db.select({ id: schema.exercises.id }).from(schema.exercises).limit(1);
  if (alreadyImported) {
    return;
  }

  const legacyExercises = await sqliteDb.getAllAsync<any>('SELECT * FROM exercises');
  if (legacyExercises.length === 0) {
    // Fresh install, no pre-Faz-2 data — nothing to import; seed.ts populates normally.
    return;
  }

  await db.transaction(async (tx) => {
    const exerciseIds = new Map<number, string>();
    for (const row of legacyExercises) {
      const [inserted] = await tx
        .insert(schema.exercises)
        .values({
          userId,
          name: row.name,
          category: row.category,
          imageUri: row.image_uri,
          isCustom: !!row.is_custom,
          isBodyweight: !!row.is_bodyweight,
          isUnilateral: !!row.is_unilateral,
          weightMode: row.weight_mode ?? 'kg',
          createdAt: row.created_at,
        })
        .returning({ id: schema.exercises.id });
      exerciseIds.set(row.id, inserted.id);
    }

    const legacyFoods = await sqliteDb.getAllAsync<any>('SELECT * FROM foods');
    const foodIds = new Map<number, string>();
    for (const row of legacyFoods) {
      const [inserted] = await tx
        .insert(schema.foods)
        .values({
          userId,
          name: row.name,
          category: row.category,
          caloriesPer100g: row.calories_per_100g,
          proteinPer100g: row.protein_per_100g,
          carbsPer100g: row.carbs_per_100g,
          fatPer100g: row.fat_per_100g,
          fiberPer100g: row.fiber_per_100g,
          saturatedFatPer100g: row.saturated_fat_per_100g,
          unsaturatedFatPer100g: row.unsaturated_fat_per_100g,
          transFatPer100g: row.trans_fat_per_100g,
          sugarsPer100g: row.sugars_per_100g,
          saltPer100g: row.salt_per_100g,
          extraNutrients: row.extra_nutrients,
          barcode: row.barcode,
          portions: row.portions,
          source: row.source ?? 'custom',
          isCustom: !!row.is_custom,
          createdAt: row.created_at,
        })
        .returning({ id: schema.foods.id });
      foodIds.set(row.id, inserted.id);
    }

    const legacyPrograms = await sqliteDb.getAllAsync<any>('SELECT * FROM programs');
    const programIds = new Map<number, string>();
    for (const row of legacyPrograms) {
      const [inserted] = await tx
        .insert(schema.programs)
        .values({ userId, name: row.name, isActive: !!row.is_active, createdAt: row.created_at })
        .returning({ id: schema.programs.id });
      programIds.set(row.id, inserted.id);
    }

    const legacyProgramDays = await sqliteDb.getAllAsync<any>('SELECT * FROM program_days');
    const programDayIds = new Map<number, string>();
    for (const row of legacyProgramDays) {
      const [inserted] = await tx
        .insert(schema.programDays)
        .values({
          userId,
          programId: programIds.get(row.program_id)!,
          name: row.name,
          orderIndex: row.order_index,
        })
        .returning({ id: schema.programDays.id });
      programDayIds.set(row.id, inserted.id);
    }

    const legacyProgramDayExercises = await sqliteDb.getAllAsync<any>('SELECT * FROM program_day_exercises');
    for (const row of legacyProgramDayExercises) {
      await tx.insert(schema.programDayExercises).values({
        userId,
        programDayId: programDayIds.get(row.program_day_id)!,
        exerciseId: exerciseIds.get(row.exercise_id)!,
        orderIndex: row.order_index,
        targetSets: row.target_sets,
        targetReps: row.target_reps,
        targetRir: row.target_rir,
        notes: row.notes,
      });
    }

    const legacySessions = await sqliteDb.getAllAsync<any>('SELECT * FROM workout_sessions');
    const workoutSessionIds = new Map<number, string>();
    for (const row of legacySessions) {
      const [inserted] = await tx
        .insert(schema.workoutSessions)
        .values({
          userId,
          date: row.date,
          name: row.name,
          programDayId: row.program_day_id != null ? (programDayIds.get(row.program_day_id) ?? null) : null,
          startedAt: row.started_at,
          finishedAt: row.finished_at,
          notes: row.notes,
        })
        .returning({ id: schema.workoutSessions.id });
      workoutSessionIds.set(row.id, inserted.id);
    }

    const legacyExerciseLogs = await sqliteDb.getAllAsync<any>('SELECT * FROM exercise_logs');
    const exerciseLogIds = new Map<number, string>();
    for (const row of legacyExerciseLogs) {
      const [inserted] = await tx
        .insert(schema.exerciseLogs)
        .values({
          userId,
          workoutSessionId: workoutSessionIds.get(row.workout_session_id)!,
          exerciseId: exerciseIds.get(row.exercise_id)!,
          orderIndex: row.order_index,
          notes: row.notes,
        })
        .returning({ id: schema.exerciseLogs.id });
      exerciseLogIds.set(row.id, inserted.id);
    }

    const legacySetLogs = await sqliteDb.getAllAsync<any>('SELECT * FROM set_logs');
    for (const row of legacySetLogs) {
      await tx.insert(schema.setLogs).values({
        userId,
        exerciseLogId: exerciseLogIds.get(row.exercise_log_id)!,
        setNumber: row.set_number,
        weight: row.weight,
        reps: row.reps,
        rir: row.rir,
        rpe: row.rpe,
        notes: row.notes,
        side: row.side,
        mediaUri: row.media_uri,
        mediaType: row.media_type,
        createdAt: row.created_at,
      });
    }

    const legacySessionMedia = await sqliteDb.getAllAsync<any>('SELECT * FROM workout_session_media');
    for (const row of legacySessionMedia) {
      await tx.insert(schema.workoutSessionMedia).values({
        userId,
        workoutSessionId: workoutSessionIds.get(row.workout_session_id)!,
        uri: row.uri,
        type: row.type,
        createdAt: row.created_at,
      });
    }

    const legacyCheckins = await sqliteDb.getAllAsync<any>('SELECT * FROM daily_checkins');
    for (const row of legacyCheckins) {
      await tx.insert(schema.dailyCheckins).values({
        userId,
        date: row.date,
        bedTime: row.bed_time,
        wakeTime: row.wake_time,
        sleepHours: row.sleep_hours,
        stressLevel: row.stress_level,
        weightKg: row.weight_kg,
        createdAt: row.created_at,
      });
    }

    const legacyWater = await sqliteDb.getAllAsync<any>('SELECT * FROM water_logs');
    for (const row of legacyWater) {
      await tx.insert(schema.waterLogs).values({ userId, date: row.date, amountMl: row.amount_ml, loggedAt: row.logged_at });
    }

    const legacyCoffee = await sqliteDb.getAllAsync<any>('SELECT * FROM coffee_logs');
    for (const row of legacyCoffee) {
      await tx.insert(schema.coffeeLogs).values({ userId, date: row.date, loggedAt: row.logged_at });
    }

    const legacyDayNotes = await sqliteDb.getAllAsync<any>('SELECT * FROM day_notes');
    for (const row of legacyDayNotes) {
      await tx.insert(schema.dayNotes).values({ userId, date: row.date, name: row.name, note: row.note });
    }

    const legacyRoutes = await sqliteDb.getAllAsync<any>('SELECT * FROM run_routes');
    const runRouteIds = new Map<number, string>();
    for (const row of legacyRoutes) {
      const [inserted] = await tx
        .insert(schema.runRoutes)
        .values({ userId, name: row.name, points: row.points, distanceMeters: row.distance_meters, createdAt: row.created_at })
        .returning({ id: schema.runRoutes.id });
      runRouteIds.set(row.id, inserted.id);
    }

    const legacyCardio = await sqliteDb.getAllAsync<any>('SELECT * FROM cardio_sessions');
    for (const row of legacyCardio) {
      await tx.insert(schema.cardioSessions).values({
        userId,
        date: row.date,
        name: row.name,
        plannedRouteId: row.planned_route_id != null ? (runRouteIds.get(row.planned_route_id) ?? null) : null,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        distanceMeters: row.distance_meters,
        durationSeconds: row.duration_seconds,
        elevationGainMeters: row.elevation_gain_meters,
        route: row.route,
        notes: row.notes,
      });
    }

    const [legacySettings] = await sqliteDb.getAllAsync<any>('SELECT * FROM settings LIMIT 1');
    if (legacySettings) {
      await tx.insert(schema.settings).values({
        userId,
        unit: legacySettings.unit,
        repMetric: legacySettings.rep_metric,
        waterGoalMl: legacySettings.water_goal_ml,
        calorieGoal: legacySettings.calorie_goal,
        proteinGoal: legacySettings.protein_goal,
        carbsGoal: legacySettings.carbs_goal,
        fatGoal: legacySettings.fat_goal,
        themeMode: legacySettings.theme_mode,
        dailyDrinkCard: legacySettings.daily_drink_card,
      });
    }

    const legacyPlans = await sqliteDb.getAllAsync<any>('SELECT * FROM nutrition_plans');
    const nutritionPlanIds = new Map<number, string>();
    for (const row of legacyPlans) {
      const [inserted] = await tx
        .insert(schema.nutritionPlans)
        .values({ userId, name: row.name, createdAt: row.created_at })
        .returning({ id: schema.nutritionPlans.id });
      nutritionPlanIds.set(row.id, inserted.id);
    }

    // Migration 0020 (see src/db/migrations) already backfilled plan_id
    // directly onto the legacy file's nutrition_plan_meals rows and dropped
    // the old plan_day grouping table — plans hold meals directly now, no
    // day layer, so this just carries plan_id straight across.
    const legacyPlanMeals = await sqliteDb.getAllAsync<any>('SELECT * FROM nutrition_plan_meals');
    for (const row of legacyPlanMeals) {
      await tx.insert(schema.nutritionPlanMeals).values({
        userId,
        planId: nutritionPlanIds.get(row.plan_id)!,
        foodId: foodIds.get(row.food_id)!,
        mealType: row.meal_type,
        amountGrams: row.amount_grams,
        orderIndex: row.order_index,
      });
    }

    const legacyNutritionLogs = await sqliteDb.getAllAsync<any>('SELECT * FROM nutrition_logs');
    for (const row of legacyNutritionLogs) {
      await tx.insert(schema.nutritionLogs).values({
        userId,
        date: row.date,
        foodId: foodIds.get(row.food_id)!,
        mealType: row.meal_type,
        amountGrams: row.amount_grams,
        notes: row.notes,
        loggedAt: row.logged_at,
      });
    }

    const legacyGoalSnapshots = await sqliteDb.getAllAsync<any>('SELECT * FROM nutrition_goal_snapshots');
    for (const row of legacyGoalSnapshots) {
      await tx.insert(schema.nutritionGoalSnapshots).values({
        userId,
        date: row.date,
        calorieGoal: row.calorie_goal,
        proteinGoal: row.protein_goal,
        carbsGoal: row.carbs_goal,
        fatGoal: row.fat_goal,
      });
    }

    const legacySupplements = await sqliteDb.getAllAsync<any>('SELECT * FROM supplements');
    const supplementIds = new Map<number, string>();
    for (const row of legacySupplements) {
      const [inserted] = await tx
        .insert(schema.supplements)
        .values({
          userId,
          name: row.name,
          defaultAmount: row.default_amount,
          isDefault: !!row.is_default,
          createdAt: row.created_at,
        })
        .returning({ id: schema.supplements.id });
      supplementIds.set(row.id, inserted.id);
    }

    const legacySupplementLogs = await sqliteDb.getAllAsync<any>('SELECT * FROM supplement_logs');
    for (const row of legacySupplementLogs) {
      await tx.insert(schema.supplementLogs).values({
        userId,
        date: row.date,
        supplementId: supplementIds.get(row.supplement_id)!,
        amount: row.amount,
        loggedAt: row.logged_at,
      });
    }
  });
}

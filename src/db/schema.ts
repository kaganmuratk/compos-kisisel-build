import * as Crypto from 'expo-crypto';

import { relations } from 'drizzle-orm';
import { integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

// Faz 2 (sunucu senkronu): id'ler artık integer autoincrement değil, uuid.
// Sebep: offline-first senkronda (PowerSync) birden fazla cihaz internetsizken
// aynı anda yeni satır oluşturabilir — "bir sonraki integer" güvenle tahmin
// edilemez ama rastgele uuid hiç çakışmaz. user_id/updated_at/deleted_at her
// kullanıcıya-özel tabloda var: user_id kimin satırı olduğunu, updated_at
// "son yazan kazanır" çakışma çözümünü, deleted_at ise senkronlanabilen
// (soft) silmeyi sağlıyor. foods/exercises karışık: user_id null = herkese
// açık/paylaşılan satır, dolu = kullanıcının kendi eklediği özel satır.
const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => Crypto.randomUUID());

const ownerColumns = () => ({
  userId: text('user_id').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString())
    .$onUpdateFn(() => new Date().toISOString()),
  deletedAt: text('deleted_at'),
});

export const exercises = sqliteTable('exercises', {
  id: id(),
  userId: text('user_id'), // null = paylaşılan kütüphane
  name: text('name').notNull(),
  category: text('category').notNull(),
  imageUri: text('image_uri'),
  isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
  // Weight field becomes optional "added weight" on top of bodyweight (from
  // daily check-ins) when computing estimated 1RM for this exercise.
  isBodyweight: integer('is_bodyweight', { mode: 'boolean' }).notNull().default(false),
  // Each set splits into a left/right pair instead of one row.
  isUnilateral: integer('is_unilateral', { mode: 'boolean' }).notNull().default(false),
  // 'pin' is for machines where load is set by a pin/notch position, not a
  // real kg/lb weight — set weight is then a plain count, no unit conversion.
  weightMode: text('weight_mode', { enum: ['kg', 'pin'] }).notNull().default('kg'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString())
    .$onUpdateFn(() => new Date().toISOString()),
  deletedAt: text('deleted_at'),
});

export const programs = sqliteTable('programs', {
  id: id(),
  ...ownerColumns(),
  name: text('name').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const programDays = sqliteTable('program_days', {
  id: id(),
  ...ownerColumns(),
  programId: text('program_id')
    .notNull()
    .references(() => programs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
});

export const programDayExercises = sqliteTable('program_day_exercises', {
  id: id(),
  ...ownerColumns(),
  programDayId: text('program_day_id')
    .notNull()
    .references(() => programDays.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id')
    .notNull()
    .references(() => exercises.id),
  orderIndex: integer('order_index').notNull().default(0),
  targetSets: integer('target_sets'),
  targetReps: text('target_reps'),
  targetRir: real('target_rir'),
  notes: text('notes'),
});

export const workoutSessions = sqliteTable('workout_sessions', {
  id: id(),
  ...ownerColumns(),
  date: text('date').notNull(),
  name: text('name'),
  programDayId: text('program_day_id').references(() => programDays.id),
  startedAt: text('started_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  finishedAt: text('finished_at'),
  notes: text('notes'),
  avgHeartRate: integer('avg_heart_rate'),
  maxHeartRate: integer('max_heart_rate'),
  caloriesBurned: real('calories_burned'),
  healthSyncedAt: text('health_synced_at'),
  vo2Max: real('vo2_max'),
  oxygenSaturation: real('oxygen_saturation'),
  heartRateVariability: real('heart_rate_variability'),
  respiratoryRate: real('respiratory_rate'),
});

export const exerciseLogs = sqliteTable('exercise_logs', {
  id: id(),
  ...ownerColumns(),
  workoutSessionId: text('workout_session_id')
    .notNull()
    .references(() => workoutSessions.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id')
    .notNull()
    .references(() => exercises.id),
  orderIndex: integer('order_index').notNull().default(0),
  notes: text('notes'),
});

export const setLogs = sqliteTable('set_logs', {
  id: id(),
  ...ownerColumns(),
  exerciseLogId: text('exercise_log_id')
    .notNull()
    .references(() => exerciseLogs.id, { onDelete: 'cascade' }),
  setNumber: integer('set_number').notNull(),
  weight: real('weight'),
  // Not always a whole number — the reps input accepts decimals (partial
  // reps), so this has to stay real, not integer (see matching Postgres
  // column: an integer column here once rejected a real "7.5" reps row and
  // stuck the entire upload queue behind it).
  reps: real('reps'),
  rir: real('rir'),
  rpe: real('rpe'),
  notes: text('notes'),
  // Null for normal bilateral sets; set on both rows of a unilateral pair.
  side: text('side', { enum: ['left', 'right'] }),
  mediaUri: text('media_uri'),
  mediaType: text('media_type', { enum: ['image', 'video'] }),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const workoutSessionMedia = sqliteTable('workout_session_media', {
  id: id(),
  ...ownerColumns(),
  workoutSessionId: text('workout_session_id')
    .notNull()
    .references(() => workoutSessions.id, { onDelete: 'cascade' }),
  uri: text('uri').notNull(),
  cloudPath: text('cloud_path'),
  type: text('type', { enum: ['image', 'video'] }).notNull(),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const dailyCheckins = sqliteTable(
  'daily_checkins',
  {
    id: id(),
    ...ownerColumns(),
    date: text('date').notNull(),
    bedTime: text('bed_time'),
    wakeTime: text('wake_time'),
    sleepHours: real('sleep_hours'),
    napHours: real('nap_hours'),
    stressLevel: integer('stress_level'),
    weightKg: real('weight_kg'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [unique().on(table.userId, table.date)]
);

// Health Connect data is normally queried live from the phone every time
// (see lib/health-connect.ts's own comments — "already the log, nothing to
// duplicate") and is Android-only, so it never reaches the web build at
// all. This table is the one deliberate exception: a once-a-day snapshot,
// written when the native app comes to the foreground (same trigger as the
// existing daily-HR-graph refetch), so the web build has *something* to
// show instead of nothing. One row per user per day — heartRateSeries
// stores the same downsampled {value,label}[] shape already used for the
// native chart (see lib/health-connect.ts's downsampleToChartPoints), as a
// JSON string, same convention as `route`/`extra_data` elsewhere in this
// schema — never one row per sample, that's the volume/PowerSync-queue
// risk this table is specifically designed to avoid.
export const healthMetricsDaily = sqliteTable(
  'health_metrics_daily',
  {
    id: id(),
    ...ownerColumns(),
    date: text('date').notNull(),
    steps: integer('steps'),
    restingHeartRate: integer('resting_heart_rate'),
    totalCaloriesBurned: real('total_calories_burned'),
    avgHeartRate: real('avg_heart_rate'),
    heartRateSeries: text('heart_rate_series'),
    sleepStages: text('sleep_stages'),
    // Same {value,label}[] JSON convention as heartRateSeries above, but for
    // the sleep window specifically (see querySleepHeartRateTimeSeries in
    // lib/health-connect.ts) — kept as its own column rather than merged
    // into heartRateSeries since the two are shown as separate charts on
    // separate screens (daytime on Bugün, sleep on History's day-detail).
    sleepHeartRateSeries: text('sleep_heart_rate_series'),
    syncedAt: text('synced_at').notNull(),
  },
  (table) => [unique().on(table.userId, table.date)]
);

export const waterLogs = sqliteTable('water_logs', {
  id: id(),
  ...ownerColumns(),
  date: text('date').notNull(),
  amountMl: integer('amount_ml').notNull(),
  loggedAt: text('logged_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const coffeeLogs = sqliteTable('coffee_logs', {
  id: id(),
  ...ownerColumns(),
  date: text('date').notNull(),
  loggedAt: text('logged_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const dayNotes = sqliteTable(
  'day_notes',
  {
    id: id(),
    ...ownerColumns(),
    date: text('date').notNull(),
    name: text('name'),
    note: text('note'),
  },
  (table) => [unique().on(table.userId, table.date)]
);

export const runRoutes = sqliteTable('run_routes', {
  id: id(),
  ...ownerColumns(),
  name: text('name').notNull(),
  points: text('points').notNull(),
  distanceMeters: real('distance_meters').notNull(),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const cardioSessions = sqliteTable('cardio_sessions', {
  id: id(),
  ...ownerColumns(),
  date: text('date').notNull(),
  name: text('name'),
  // 'run' is the default for every pre-existing row (this column didn't
  // exist before — all cardio sessions so far were runs). Drives which
  // fields/labels a screen shows (pace-segments for run, none of that for
  // motor) — see lib/activity-type.ts.
  activityType: text('activity_type', { enum: ['run', 'swim', 'bike', 'motor'] })
    .notNull()
    .default('run'),
  plannedRouteId: text('planned_route_id').references(() => runRoutes.id),
  startedAt: text('started_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  finishedAt: text('finished_at'),
  distanceMeters: real('distance_meters'),
  durationSeconds: integer('duration_seconds'),
  elevationGainMeters: real('elevation_gain_meters'),
  route: text('route'),
  notes: text('notes'),
  avgHeartRate: integer('avg_heart_rate'),
  maxHeartRate: integer('max_heart_rate'),
  caloriesBurned: real('calories_burned'),
  healthSyncedAt: text('health_synced_at'),
  vo2Max: real('vo2_max'),
  oxygenSaturation: real('oxygen_saturation'),
  heartRateVariability: real('heart_rate_variability'),
  respiratoryRate: real('respiratory_rate'),
  avgCadence: real('avg_cadence'),
  maxCadence: real('max_cadence'),
  // Speed-derived movement breakdown (see lib/pace-segments.ts) — computed
  // once at finish/import time from Health Connect's raw Speed samples and
  // stored here (rather than recomputed live) so the Analiz/Koşu trend can
  // sum across many past sessions from local SQLite instead of re-querying
  // Health Connect once per session on every screen visit.
  runSeconds: integer('run_seconds'),
  walkSeconds: integer('walk_seconds'),
  stoppedSeconds: integer('stopped_seconds'),
  // Free-form JSON string (object of label -> value) for anything a source
  // (e.g. the Telegram/Huawei Health screenshot importer) surfaces that
  // doesn't have its own dedicated column — Huawei's own proprietary
  // training-effect/recovery scores, per-km splits, pace-zone breakdowns,
  // etc. Deliberately unstructured: these vary by source and aren't used in
  // any calculation, only displayed as-is.
  extraData: text('extra_data'),
  // The original source screenshot (Supabase Storage public URL), when a
  // session was imported from one (Telegram bot) — chart-shaped data
  // (heart-rate curve, recovery graph, pace-zone donut, etc.) can't be
  // reliably turned into exact numbers by a vision model (no per-point
  // labels to read), so rather than losing that richness the raw image is
  // kept and shown as-is in the run summary screen instead of trying to
  // reconstruct it as data.
  sourceImageUrl: text('source_image_url'),
  // JSON array of {label, startPercent, endPercent} — the vision model's
  // best-effort estimate of where each visual section (route map, heart
  // rate chart, performance scores, etc.) sits within sourceImageUrl's
  // height, 0-100 top to bottom. Used to "sprite crop" the one stored
  // image into separate-looking panels in the UI without needing to
  // actually cut the image server-side — see run/summary/[id].tsx.
  imageSections: text('image_sections'),
  // JSON array of {x, y}, each 0-100 — the shape of the route LINE traced
  // out of the screenshot's route-map section, relative to that crop's own
  // box. Deliberately NOT real coordinates (no lat/lng can be recovered
  // from a static image, see project memory) — never feed these into
  // real-map rendering or distance math, they're for drawing a stylized
  // line silhouette only (same rendering path as a real GPS route's SVG
  // projection, just skipping the lat/lng step since these are already
  // relative points).
  routeShapePoints: text('route_shape_points'),
});

export const settings = sqliteTable(
  'settings',
  {
    id: id(),
    ...ownerColumns(),
    unit: text('unit', { enum: ['kg', 'lb'] }).notNull().default('kg'),
    repMetric: text('rep_metric', { enum: ['rir', 'rpe'] }).notNull().default('rir'),
    waterGoalMl: integer('water_goal_ml').notNull().default(2500),
    calorieGoal: integer('calorie_goal').notNull().default(2000),
    proteinGoal: integer('protein_goal').notNull().default(150),
    carbsGoal: integer('carbs_goal').notNull().default(200),
    fatGoal: integer('fat_goal').notNull().default(65),
    themeMode: text('theme_mode', { enum: ['light', 'dark', 'system'] }).notNull().default('system'),
    dailyDrinkCard: text('daily_drink_card', { enum: ['water', 'coffee'] }).notNull().default('water'),
    defaultBedTime: text('default_bed_time'),
    defaultWakeTime: text('default_wake_time'),
    mediaCloudBackup: integer('media_cloud_backup', { mode: 'boolean' }).notNull().default(false),
    language: text('language', { enum: ['en', 'tr'] }).notNull().default('en'),
    defaultRepMetricValue: real('default_rep_metric_value'),
  },
  (table) => [unique().on(table.userId)]
);

// The 4 built-in meal categories every account starts with — always
// available, can't be deleted. `mealCategories` below holds only the
// user's own additional ones; `nutritionLogs.mealType` /
// `nutritionPlanMeals.mealType` store either one of these 4 keys or a
// `mealCategories.id`, as a plain string (see comment on those columns).
export const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

// User-added meal categories beyond the 4 built-in ones (e.g. "Gece Atıştırması").
// Same shape as `supplements` — a small user-maintained catalog.
export const mealCategories = sqliteTable('meal_categories', {
  id: id(),
  ...ownerColumns(),
  name: text('name').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const foods = sqliteTable('foods', {
  id: id(),
  userId: text('user_id'), // null = global katalog (TürKomp/OFF/kürasyon)
  name: text('name').notNull(),
  category: text('category').notNull(),
  caloriesPer100g: real('calories_per_100g').notNull(),
  proteinPer100g: real('protein_per_100g').notNull(),
  carbsPer100g: real('carbs_per_100g').notNull(),
  fatPer100g: real('fat_per_100g').notNull(),
  fiberPer100g: real('fiber_per_100g'),
  saturatedFatPer100g: real('saturated_fat_per_100g'),
  unsaturatedFatPer100g: real('unsaturated_fat_per_100g'),
  transFatPer100g: real('trans_fat_per_100g'),
  sugarsPer100g: real('sugars_per_100g'),
  saltPer100g: real('salt_per_100g'),
  // Free-text supplementary label info that doesn't fit the per-100g macro
  // columns (vitamins, enzyme blends, etc.) — e.g. protein powders listing a
  // vitamin/enzyme premix. Not part of macro totals math, shown as-is.
  extraNutrients: text('extra_nutrients'),
  barcode: text('barcode'),
  portions: text('portions'),
  source: text('source', { enum: ['curated', 'turkomp', 'off', 'custom'] })
    .notNull()
    .default('custom'),
  isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString())
    .$onUpdateFn(() => new Date().toISOString()),
  deletedAt: text('deleted_at'),
});

export const nutritionPlans = sqliteTable('nutrition_plans', {
  id: id(),
  ...ownerColumns(),
  name: text('name').notNull(),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const nutritionPlanMeals = sqliteTable('nutrition_plan_meals', {
  id: id(),
  ...ownerColumns(),
  planId: text('plan_id')
    .notNull()
    .references(() => nutritionPlans.id, { onDelete: 'cascade' }),
  foodId: text('food_id')
    .notNull()
    .references(() => foods.id),
  // One of the 4 keys in `mealTypes`, or a `mealCategories.id` for a
  // user-added custom category — both live in this one plain string column,
  // no need to distinguish (ids are unique across both spaces).
  mealType: text('meal_type').notNull(),
  amountGrams: real('amount_grams').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
});

export const nutritionLogs = sqliteTable('nutrition_logs', {
  id: id(),
  ...ownerColumns(),
  date: text('date').notNull(),
  foodId: text('food_id')
    .notNull()
    .references(() => foods.id),
  // One of the 4 keys in `mealTypes`, or a `mealCategories.id` for a
  // user-added custom category — both live in this one plain string column,
  // no need to distinguish (ids are unique across both spaces).
  mealType: text('meal_type').notNull(),
  amountGrams: real('amount_grams').notNull(),
  notes: text('notes'),
  loggedAt: text('logged_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// Locks in the calorie/macro goals that were active the first time a day got
// a nutrition log, so later goal changes in Settings don't retroactively
// rewrite what past days were being measured against.
export const nutritionGoalSnapshots = sqliteTable(
  'nutrition_goal_snapshots',
  {
    id: id(),
    ...ownerColumns(),
    date: text('date').notNull(),
    calorieGoal: integer('calorie_goal').notNull(),
    proteinGoal: integer('protein_goal').notNull(),
    carbsGoal: integer('carbs_goal').notNull(),
    fatGoal: integer('fat_goal').notNull(),
  },
  (table) => [unique().on(table.userId, table.date)]
);

// User-defined grouping for the supplement routine (e.g. "Morning",
// "Pre-workout") — same shape/purpose as `mealCategories`, but with no
// built-in defaults: every category here is one the user created.
export const supplementCategories = sqliteTable('supplement_categories', {
  id: id(),
  ...ownerColumns(),
  name: text('name').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// A user-maintained catalog of supplements/vitamins ("Creatine", "Vitamin D").
// isDefault identifies an item in the daily routine; the user explicitly marks
// it taken in Today. defaultAmount is free text since doses span g/mg/mcg/IU/tablet.
// categoryId is nullable (set null on delete) — an uncategorized supplement is
// a normal state, not an error, both before this feature existed and after a
// category is removed.
export const supplements = sqliteTable('supplements', {
  id: id(),
  ...ownerColumns(),
  name: text('name').notNull(),
  defaultAmount: text('default_amount'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  categoryId: text('category_id').references(() => supplementCategories.id, { onDelete: 'set null' }),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const supplementLogs = sqliteTable('supplement_logs', {
  id: id(),
  ...ownerColumns(),
  date: text('date').notNull(),
  supplementId: text('supplement_id')
    .notNull()
    .references(() => supplements.id, { onDelete: 'cascade' }),
  amount: text('amount'),
  loggedAt: text('logged_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const programsRelations = relations(programs, ({ many }) => ({
  days: many(programDays),
}));

export const programDaysRelations = relations(programDays, ({ one, many }) => ({
  program: one(programs, { fields: [programDays.programId], references: [programs.id] }),
  exercises: many(programDayExercises),
}));

export const programDayExercisesRelations = relations(programDayExercises, ({ one }) => ({
  programDay: one(programDays, { fields: [programDayExercises.programDayId], references: [programDays.id] }),
  exercise: one(exercises, { fields: [programDayExercises.exerciseId], references: [exercises.id] }),
}));

export const exercisesRelations = relations(exercises, ({ many }) => ({
  logs: many(exerciseLogs),
}));

export const workoutSessionsRelations = relations(workoutSessions, ({ one, many }) => ({
  programDay: one(programDays, { fields: [workoutSessions.programDayId], references: [programDays.id] }),
  exerciseLogs: many(exerciseLogs),
}));

export const exerciseLogsRelations = relations(exerciseLogs, ({ one, many }) => ({
  workoutSession: one(workoutSessions, { fields: [exerciseLogs.workoutSessionId], references: [workoutSessions.id] }),
  exercise: one(exercises, { fields: [exerciseLogs.exerciseId], references: [exercises.id] }),
  sets: many(setLogs),
}));

export const setLogsRelations = relations(setLogs, ({ one }) => ({
  exerciseLog: one(exerciseLogs, { fields: [setLogs.exerciseLogId], references: [exerciseLogs.id] }),
}));

export const cardioSessionsRelations = relations(cardioSessions, ({ one }) => ({
  plannedRoute: one(runRoutes, { fields: [cardioSessions.plannedRouteId], references: [runRoutes.id] }),
}));

export const foodsRelations = relations(foods, ({ many }) => ({
  planMeals: many(nutritionPlanMeals),
  logs: many(nutritionLogs),
}));

export const nutritionPlansRelations = relations(nutritionPlans, ({ many }) => ({
  meals: many(nutritionPlanMeals),
}));

export const nutritionPlanMealsRelations = relations(nutritionPlanMeals, ({ one }) => ({
  plan: one(nutritionPlans, { fields: [nutritionPlanMeals.planId], references: [nutritionPlans.id] }),
  food: one(foods, { fields: [nutritionPlanMeals.foodId], references: [foods.id] }),
}));

export const nutritionLogsRelations = relations(nutritionLogs, ({ one }) => ({
  food: one(foods, { fields: [nutritionLogs.foodId], references: [foods.id] }),
}));

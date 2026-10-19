import { asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import { db } from '@/db/client';
import nutritionSeedDataRaw from '@/db/nutrition-seed-data.json';
import { seedExercises } from '@/db/seed-data';
import {
  cardioSessions,
  exerciseLogs,
  exercises,
  foods,
  nutritionLogs,
  nutritionPlanMeals,
  programDayExercises,
  settings,
  workoutSessions,
} from '@/db/schema';
import { totalDistance, type RoutePoint } from '@/lib/geo';
import { supabase } from '@/lib/supabase';

const nutritionSeedData = nutritionSeedDataRaw as (typeof foods.$inferInsert)[];

// Seeded rows are stamped with the current user's id (not left null for a
// shared/global catalog) — the Postgres RLS insert policy
// (`with check (user_id = auth.uid())`) rejects null-user_id inserts from an
// authenticated client, so a null userId here would queue an insert that can
// never upload: PowerSync retries the same failed CRUD transaction forever,
// which blocks every other pending change behind it in the upload queue.
// Checks by name rather than "table is empty" — _layout.tsx only waits up to
// 5s for the first sync to land before running this, so on a slow/cold first
// sync (e.g. a brand new device) the local table can still look empty while
// rows are already on their way down from Supabase. An empty-table check
// would then insert the whole library a second time with fresh ids once
// those synced rows land; checking by name makes this safe to run regardless
// of how much of the first sync has arrived.
export async function seedExercisesIfEmpty(userId: string) {
  const existingNames = new Set((await db.select({ name: exercises.name }).from(exercises)).map((row) => row.name));
  const missing = seedExercises.filter((exercise) => !existingNames.has(exercise.name));
  if (missing.length === 0) {
    return;
  }
  await db.insert(exercises).values(missing.map((exercise) => ({ ...exercise, userId })));
}

// Unlike exercises/foods (which dedupe by name), settings has no natural
// key to check against besides its own uniqueness (one row per user) — so
// the exercises/foods fix (check by value instead of table emptiness)
// doesn't apply here. The local emptiness check alone is unreliable on a
// slow/cold first sync for the same reason as before: a settings row can
// already exist on Supabase (real, from an earlier device) while this
// device's local copy of it hasn't landed yet, so the local check sees
// "no settings" and inserts a second one — which then permanently fails to
// upload (`settings_user_id_key` unique violation), observed for real
// 2026-08-12 on a brand-new device. Fixed at the source instead of
// relying on the generic discard safety net in supabase-connector.ts: ask
// Supabase directly whether a row already exists before inserting
// locally, the same direct-query pattern already used by
// repairOrphanedCatalogReferences below.
export async function seedSettingsIfEmpty(userId: string, mediaCloudBackup = false, language: 'en' | 'tr' = 'en') {
  const existing = await db.select({ id: settings.id }).from(settings).where(eq(settings.userId, userId)).limit(1);
  if (existing.length > 0) {
    return;
  }
  const { data: serverRows } = await supabase.from('settings').select('id').eq('user_id', userId).limit(1);
  if (serverRows && serverRows.length > 0) {
    return;
  }
  await db.insert(settings).values({ userId, mediaCloudBackup, language });
}

// Same name-based check as seedExercisesIfEmpty, and for the same reason:
// see the comment there.
export async function seedFoodsIfEmpty(userId: string) {
  const existingNames = new Set((await db.select({ name: foods.name }).from(foods)).map((row) => row.name));
  const missing = nutritionSeedData.filter((food) => !existingNames.has(food.name));
  if (missing.length === 0) {
    return;
  }
  const chunkSize = 200;
  for (let i = 0; i < missing.length; i += chunkSize) {
    await db.insert(foods).values(missing.slice(i, i + chunkSize).map((food) => ({ ...food, userId })));
  }
}

// One-time backfill for devices seeded before `portions` existed on foods.
// Matches by name (seed names are unique) so existing food ids — and any
// nutritionLogs/nutritionPlanMeals already pointing at them — stay intact.
export async function backfillFoodPortionsIfMissing() {
  const [alreadyBackfilled] = await db.select({ id: foods.id }).from(foods).where(isNotNull(foods.portions)).limit(1);
  if (alreadyBackfilled) {
    return;
  }
  await db.transaction(async (tx) => {
    for (const item of nutritionSeedData) {
      if (!item.portions) {
        continue;
      }
      await tx.update(foods).set({ portions: item.portions }).where(eq(foods.name, item.name));
    }
  });
}

// One-time cleanup for a real bug found 2026-09-03: some devices ended up
// with the exact same food name inserted more than once — e.g. "Tavuk
// Göğsü, çiğ" 5 times — most likely from seedFoodsIfEmpty's name-based
// "existingNames" check racing itself (two overlapping calls both read the
// same not-yet-inserted state and both insert the same missing name).
// repairOrphanedCatalogReferences (which runs right before this in
// _layout.tsx) already remaps nutritionLogs/nutritionPlanMeals to whichever
// id Supabase accepted as canonical for a name, so most rows in a duplicate
// group are usually already unreferenced by the time this runs — but not
// guaranteed, so this still repoints any straggling references itself
// before deleting, rather than assuming that. Grouped and scoped to this
// user's own rows only (foods.userId), never touches the null-userId
// shared/global catalog rows.
export async function dedupeFoods(userId: string) {
  const rows = await db
    .select({ id: foods.id, name: foods.name })
    .from(foods)
    .where(eq(foods.userId, userId))
    .orderBy(asc(foods.createdAt));
  const byName = new Map<string, string[]>();
  for (const row of rows) {
    const list = byName.get(row.name);
    if (list) {
      list.push(row.id);
    } else {
      byName.set(row.name, [row.id]);
    }
  }
  for (const ids of byName.values()) {
    if (ids.length < 2) {
      continue;
    }
    const [keepId, ...dropIds] = ids;
    for (const dropId of dropIds) {
      await db.update(nutritionLogs).set({ foodId: keepId }).where(eq(nutritionLogs.foodId, dropId));
      await db.update(nutritionPlanMeals).set({ foodId: keepId }).where(eq(nutritionPlanMeals.foodId, dropId));
      await db.delete(foods).where(eq(foods.id, dropId));
    }
  }
}

// One-time correction for "Eti Lifalif Yulaf Ezmesi" — the seeded Open Food
// Facts values were off from the package label; matches by barcode since it's
// the stable unique key (unlike name, which was later found ambiguous with the
// "İnce Öğütülmüş" variant).
export async function fixEtiLifalifYulafEzmesiNutrition() {
  await db
    .update(foods)
    .set({
      caloriesPer100g: 367,
      proteinPer100g: 15,
      carbsPer100g: 55,
      fatPer100g: 7.2,
      fiberPer100g: 13,
      saturatedFatPer100g: 1.5,
      transFatPer100g: 0,
      sugarsPer100g: 1.5,
      saltPer100g: 0.01,
    })
    .where(eq(foods.barcode, '8690526069500'));
}

// One-time addition of detailed label values (saturated fat, sugars, salt)
// read off the packaging for a few products. Runs every startup — all
// writes are idempotent (same values each time).
export async function applyDetailedNutritionUpdate() {
  await db
    .update(foods)
    .set({
      saturatedFatPer100g: 8.7,
      sugarsPer100g: 6.5,
      saltPer100g: 0.2,
      portions: JSON.stringify([{ label: '1 tatlı kaşığı', grams: 10 }]),
    })
    .where(eq(foods.barcode, '8695077125651'));

  await db
    .update(foods)
    .set({
      portions: JSON.stringify([
        { label: '1 yemek kaşığı', grams: 12 },
        { label: '1 tatlı kaşığı', grams: 8 },
        { label: 'Kahvaltılık paket', grams: 15 },
      ]),
    })
    .where(eq(foods.name, 'Tereyağı'));

  // Renames a device that already got the earlier (wrongly named) insert
  // before this rename existed — a plain rename+update, not a second insert.
  await db
    .update(foods)
    .set({ name: 'Protein Ocean High+ Protein Tozu Çikolatalı Kek Aromalı' })
    .where(eq(foods.name, 'High Plus Protein Çikolatalı Kek Aromalı'));

  // Adds the "1 yemek kaşığı" portion shortcut to three Calve sauces that
  // were already seeded (by name) on existing devices before this shortcut
  // was added to the catalog — seedFoodsIfEmpty only inserts missing-by-name
  // items, so already-present rows never pick up a catalog `portions` change
  // on their own. Matches by barcode, mirrors the other portions-only update
  // above for barcode 8695077125651.
  await db
    .update(foods)
    .set({
      portions: JSON.stringify([
        { label: '1 yemek kaşığı', grams: 15 },
        { label: '1 porsiyon (15 g/ml)', grams: 15 },
        { label: '1 paket (240 g/ml)', grams: 240 },
      ]),
    })
    .where(eq(foods.barcode, '8690637921100'));

  await db
    .update(foods)
    .set({
      portions: JSON.stringify([
        { label: '1 yemek kaşığı', grams: 15 },
        { label: '1 porsiyon', grams: 100 },
      ]),
    })
    .where(eq(foods.barcode, '8690637805219'));

  await db
    .update(foods)
    .set({
      portions: JSON.stringify([
        { label: '1 yemek kaşığı', grams: 15 },
        { label: '1 paket (250 g/ml)', grams: 250 },
      ]),
    })
    .where(eq(foods.barcode, '8683130067796'));

  // Double-space/stray-nbsp typos found in the seed catalog's names, fixed
  // in nutrition-seed-data.json for new installs — same rename-in-place
  // pattern as above so devices that already seeded the old (unfixed) name
  // pick up the correction too, instead of only new installs.
  const nameTypoFixes: [string, string][] = [
    ['ayran,  tam yağlı', 'ayran, tam yağlı'],
    ['Emülsifiye Et  ürünü, sosis,  dana', 'Emülsifiye Et ürünü, sosis, dana'],
    ['Emülsifiye Et  ürünü, sosis,  Hindi', 'Emülsifiye Et ürünü, sosis, Hindi'],
    ['Emülsifiye Et  ürünü, sosis,  Piliç', 'Emülsifiye Et ürünü, sosis, Piliç'],
    ['Kayısı, Hacıhaliloğlu, kükürtlü, kuru', 'Kayısı, Hacıhaliloğlu, kükürtlü, kuru'],
    ['Kuru Çorba Karışımı,  ezogelin', 'Kuru Çorba Karışımı, ezogelin'],
    ['Kuru Çorba Karışımı,  Mercimek', 'Kuru Çorba Karışımı, Mercimek'],
    ['Limon sosu,  doğal', 'Limon sosu, doğal'],
    ['Salep, toz,  Maraş', 'Salep, toz, Maraş'],
    ['Şarap, beyaz  ( alk.% 11-12.5 hacmen)', 'Şarap, beyaz ( alk.% 11-12.5 hacmen)'],
    // English name baked into the Turkish `name` field itself (a one-off
    // hack from 2026-09-11/13) instead of going through the
    // nutrition-name-translations.json dictionary like every other catalog
    // item (see getFoodNameLabel/findFoodNamesByEnglishQuery in
    // src/lib/food-name.ts). `name` stays Turkish-only; the English side
    // now lives in the translations file.
    ["Tam On Ananas Aromalı Kuru Üzüm (Pineapple Flavored Sultanas)", 'Tam On Ananas Aromalı Kuru Üzüm'],
    ['Balkan Doğal Süt %1,5 Yağlı (Balkan Natural Milk 1.5% Fat)', 'Balkan Doğal Süt %1,5 Yağlı'],
    ["Kelly's Corn Flakes Klasik Mısır Gevreği (Kelly's Corn Flakes Classic)", "Kelly's Corn Flakes Klasik Mısır Gevreği"],
    ['Mutfağım Hızlı Dondurulmuş Parmak Patates (Mutfağım Frozen French Fries)', 'Mutfağım Hızlı Dondurulmuş Parmak Patates'],
    ['Yörsan Protein Sade UHT Süt, Laktozsuz (Yörsan Protein Plain UHT Milk, Lactose-Free)', 'Yörsan Protein Sade UHT Süt, Laktozsuz'],
    ['Churchill - Ev Yapımı Limonlu Soda (Churchill - Homemade Lemon Soda)', 'Churchill - Ev Yapımı Limonlu Soda'],
  ];
  for (const [oldName, newName] of nameTypoFixes) {
    await db.update(foods).set({ name: newName }).where(eq(foods.name, oldName));
  }
}

// Before the "resume active session" feature existed, navigating away from an
// in-progress workout/run without finishing it left the row with finishedAt
// NULL forever. useActiveSession()/useActiveCardioSession() pick the highest-id
// NULL row as "active" — once the real current session finishes, an old
// leftover row like this resurfaces as "active", making the app look like it
// never finished. Closing out every NULL row except the newest one fixes this;
// once every start-flow checks for an active session first (already the case),
// there's never more than one NULL row at a time, so this is a no-op after the
// first run.
export async function closeStaleOpenSessions() {
  const openSessions = await db
    .select({ id: workoutSessions.id, startedAt: workoutSessions.startedAt })
    .from(workoutSessions)
    .where(isNull(workoutSessions.finishedAt))
    .orderBy(desc(workoutSessions.startedAt));
  if (openSessions.length > 1) {
    await db.transaction(async (tx) => {
      for (const session of openSessions.slice(1)) {
        await tx.update(workoutSessions).set({ finishedAt: session.startedAt }).where(eq(workoutSessions.id, session.id));
      }
    });
  }

  const openCardioSessions = await db
    .select({ id: cardioSessions.id, startedAt: cardioSessions.startedAt, route: cardioSessions.route })
    .from(cardioSessions)
    .where(isNull(cardioSessions.finishedAt))
    .orderBy(desc(cardioSessions.startedAt));
  if (openCardioSessions.length > 1) {
    await db.transaction(async (tx) => {
      for (const session of openCardioSessions.slice(1)) {
        const route: RoutePoint[] = session.route ? JSON.parse(session.route) : [];
        await tx
          .update(cardioSessions)
          .set({ finishedAt: session.startedAt, distanceMeters: totalDistance(route), durationSeconds: 0 })
          .where(eq(cardioSessions.id, session.id));
      }
    });
  }
}

// Builds "which local id maps to which name" and "which name maps to the
// Supabase-confirmed id" for one catalog table (exercises or foods) — the
// two lookups repairOrphanedCatalogReferences needs to remap a foreign key
// that points at a local id Supabase never accepted.
async function buildCatalogIdMaps(supabaseTable: 'exercises' | 'foods', localTable: SQLiteTable & { id: SQLiteColumn; name: SQLiteColumn }) {
  // PostgREST defaults to capping an unpaginated select at 1000 rows —
  // foods alone has 2000+, so a plain .select() here would silently only
  // see about half the catalog and leave the rest looking orphaned.
  const serverIds = new Set<string>();
  const serverIdByName = new Map<string, string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data: page } = await supabase
      .from(supabaseTable)
      .select('id, name')
      .range(from, from + pageSize - 1);
    for (const row of (page ?? []) as { id: string; name: string }[]) {
      serverIds.add(row.id);
      if (!serverIdByName.has(row.name)) {
        serverIdByName.set(row.name, row.id);
      }
    }
    if (!page || page.length < pageSize) {
      break;
    }
  }

  const localRows = await db.select({ id: localTable.id, name: localTable.name }).from(localTable);
  const nameByLocalId = new Map<string, string>();
  for (const row of localRows) {
    nameByLocalId.set(row.id as string, row.name as string);
  }

  return { serverIds, serverIdByName, nameByLocalId };
}

// A device that seeded its own local copy of a default exercise/food before
// this device's userId/duplicate/permanent-failure fixes existed (see
// src/db/supabase-connector.ts) never got that specific row to Supabase —
// it stays local-only, permanently, since retrying the exact same upload
// can never succeed. Meanwhile another device (or an earlier successful
// seed) already created an equivalent row there under a different id. Any
// log/plan row that still points at the orphaned local id can then never
// sync either, purely because of *which* row it references, not because
// the log entry itself is bad — its own upload fails a foreign key
// constraint forever and gets silently discarded too, taking real workout/
// nutrition history down with it. This remaps those references to the
// name-matched row that IS confirmed to exist on Supabase, so the log
// entries can finally sync instead.
export async function repairOrphanedCatalogReferences() {
  const exerciseMaps = await buildCatalogIdMaps('exercises', exercises);
  const foodMaps = await buildCatalogIdMaps('foods', foods);

  const remap = async <T extends SQLiteTable & { id: SQLiteColumn }>(
    table: T,
    fk: SQLiteColumn,
    fkKey: string,
    maps: Awaited<ReturnType<typeof buildCatalogIdMaps>>
  ) => {
    const rows = await db.select({ id: table.id, fk }).from(table);
    for (const row of rows) {
      const fkValue = row.fk as string;
      if (maps.serverIds.has(fkValue)) {
        continue;
      }
      const name = maps.nameByLocalId.get(fkValue);
      const correctId = name ? maps.serverIdByName.get(name) : undefined;
      if (!correctId || correctId === fkValue) {
        continue;
      }
      // fkKey is always a real column key on T (callers only ever pass
      // 'exerciseId' or 'foodId' for the exact tables that have them) —
      // Drizzle's .set() can't verify a dynamically-keyed object against a
      // generic T, so this narrows it back to something it'll accept.
      await db
        .update(table)
        .set({ [fkKey]: correctId } as Record<string, string>)
        .where(eq(table.id, row.id as string));
    }
  };

  await remap(exerciseLogs, exerciseLogs.exerciseId, 'exerciseId', exerciseMaps);
  await remap(programDayExercises, programDayExercises.exerciseId, 'exerciseId', exerciseMaps);
  await remap(nutritionLogs, nutritionLogs.foodId, 'foodId', foodMaps);
  await remap(nutritionPlanMeals, nutritionPlanMeals.foodId, 'foodId', foodMaps);
}

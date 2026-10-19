import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

// The pre-Faz-2 database (integer ids, no user_id) — kept open only as a
// read-only source for uuid-migration.ts's one-time import into the
// PowerSync-managed database (see db/powersync.ts). Never written to again;
// it's the natural backup of everything that existed before this migration.
export const sqliteDb = openDatabaseSync('fitness.db', { enableChangeListener: true });

// Untyped on purpose: schema.ts now describes the *new* (uuid) shape, but
// this file still has the pre-migration (integer) one. This wrapper only
// exists to run the pre-Faz-2 drizzle-kit migrations (see migrations/) that
// bring the legacy file's columns up to date before uuid-migration.ts reads
// from it — it's never used for typed queries.
export const legacyMigratorDb = drizzle(sqliteDb);

export { db } from '@/db/powersync';

// Web counterpart to client.native.ts. The legacy pre-Faz-2 local database
// this file normally opens only ever existed on Kağan's original phone —
// a browser session has no such history to migrate, and expo-sqlite's web
// implementation (worker + wasm, bridged synchronously) times out on
// `openDatabaseSync` here rather than just being empty, so it can't be
// opened the same way at all. `sqliteDb` is stubbed to always report "no
// legacy rows", which makes runUuidMigration's own early-return
// (`if (legacyExercises.length === 0) return;`) a clean no-op. `legacyMigratorDb`
// is unused on web — src/app/_layout.tsx skips calling useMigrations() with
// it on this platform (see the Platform.OS branch there).
export const sqliteDb = {
  getAllAsync: async () => [] as unknown[],
};

export const legacyMigratorDb = null;

export { db } from '@/db/powersync';

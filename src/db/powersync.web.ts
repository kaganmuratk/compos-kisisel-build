import { PowerSyncDatabase } from '@powersync/web';
import { DrizzleAppSchema, wrapPowerSyncWithDrizzle } from '@powersync/drizzle-driver';

import * as schema from '@/db/schema';

// See powersync.native.ts for why mealTypes is excluded and why this is a
// separate database file. The web SDK stores its data in IndexedDB rather
// than a native SQLite file, but takes the same {schema, database} shape.
const { mealTypes: _mealTypes, ...drizzleSchema } = schema;

// Metro can't rewrite the SDK's default import.meta.url-based worker spawn
// (that's a Vite/webpack trick) — without an explicit path here, the worker
// script 404s silently and every query hangs forever. `worker.js` (copied
// into public/ by `npx @powersync/web copy-assets`, see metro.config.js)
// handles both the per-tab database connection and the shared sync
// coordinator, so the same path covers both options.
const powerSyncWorkerPath = '/@powersync/worker.js';

export const powerSyncDb = new PowerSyncDatabase({
  schema: new DrizzleAppSchema(drizzleSchema),
  database: {
    dbFilename: 'fitness-sync.db',
    worker: powerSyncWorkerPath,
    // Keep the browser app single-tab so a closed shared worker cannot be
    // reused by a later login or hot-reloaded route.
    enableMultiTabs: false,
  },
  sync: {
    worker: powerSyncWorkerPath,
  },
});

export const db = wrapPowerSyncWithDrizzle(powerSyncDb, { schema });

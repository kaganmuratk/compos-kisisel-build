import { PowerSyncDatabase } from '@powersync/react-native';
import { DrizzleAppSchema, wrapPowerSyncWithDrizzle } from '@powersync/drizzle-driver';

import * as schema from '@/db/schema';

// DrizzleAppSchema only accepts tables/relations — `mealTypes` (a plain
// enum-value array, not a table) has to be excluded here.
const { mealTypes: _mealTypes, ...drizzleSchema } = schema;

// A separate database file from the pre-Faz-2 one ('fitness.db', still
// opened read-only in db/client.ts as the uuid-migration source) — PowerSync
// manages its own tables via auto-generated views backed by internal
// `ps_data__` storage, which needs the real table names (e.g. `programs`)
// free to claim. Using a fresh file sidesteps any collision with the old
// database's plain tables entirely, and makes the old file a natural,
// untouched backup.
export const powerSyncDb = new PowerSyncDatabase({
  schema: new DrizzleAppSchema(drizzleSchema),
  database: {
    dbFilename: 'fitness-sync.db',
  },
});

export const db = wrapPowerSyncWithDrizzle(powerSyncDb, { schema });

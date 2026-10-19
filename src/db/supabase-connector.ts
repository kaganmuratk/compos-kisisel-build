import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector } from '@powersync/common';
import { UpdateType } from '@powersync/common';

import { alertMessage } from '@/lib/alert';
import { supabase } from '@/lib/supabase';

// console.error is invisible on a standalone/preview build with no dev
// server attached, so upload failures need a way to surface without
// adb/logcat access — shown once per app session to avoid alert spam on
// every retry.
let hasAlertedUploadError = false;

// Only these three tables are safe to permanently discard a failing write
// for (see the isPermanentFailure block below for why, and why nothing
// else may ever be added here without the same level of proof). Each has
// its own specific, independently-verified argument — never added by
// pattern-matching "this looks similar to an existing entry" (see
// feedback_data_integrity_caution in project memory for why that
// reasoning caused real data loss once already):
// - exercises, foods: "shared catalog" tables where every device seeds its
//   own local copy of the same default rows — a duplicate is expected and
//   recoverable (a name-matched row already exists on Supabase; see
//   repairOrphanedCatalogReferences in seed.ts), so losing this one local
//   copy costs nothing.
// - settings: the ONLY code path that ever INSERTs a new settings row is
//   seedSettingsIfEmpty (src/db/seed.ts), which only runs before the app
//   becomes visible/usable (_layout.tsx gates all UI behind `seeded`).
//   useUpdateSettings (the only other writer) is a plain UPDATE keyed by
//   an already-loaded row's id — it can never create a row, and bails out
//   entirely if no row exists yet. So a duplicate-key failure on settings
//   can only ever be an untouched, unedited default-value row from that
//   automated seed race — never something a person actually customized —
//   making it always safe to discard, unlike a mutation-created duplicate
//   would be.
// No other table has either property: nutritionLogs, exerciseLogs,
// setLogs, workoutSessions, etc. are each unique, irreplaceable content a
// person actually entered, through a real mutation, at a time the UI was
// genuinely visible to them.
const DISCARDABLE_TABLES = new Set(['exercises', 'foods', 'settings']);

const powerSyncUrl = process.env.EXPO_PUBLIC_POWERSYNC_URL;

if (!powerSyncUrl) {
  throw new Error('EXPO_PUBLIC_POWERSYNC_URL eksik.');
}

// Bridges PowerSync's local CRUD queue to Supabase: fetchCredentials hands
// PowerSync the current Supabase session (so its RLS policies apply the same
// way they do for any other Supabase client call), uploadData replays each
// queued local change as a Supabase Data API call. PowerSync itself only
// handles the download direction (Postgres -> local, via logical
// replication) — writes always go back through Supabase, same as the RLS
// design in supabase/schema.sql expects.
export const supabaseConnector: PowerSyncBackendConnector = {
  async fetchCredentials() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      return null;
    }
    return {
      endpoint: powerSyncUrl,
      token: session.access_token,
    };
  },

  async uploadData(database: AbstractPowerSyncDatabase) {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) {
      return;
    }

    let failingEntry: (typeof transaction.crud)[number] | undefined;
    try {
      for (const entry of transaction.crud) {
        failingEntry = entry;
        const table = supabase.from(entry.table);
        switch (entry.op) {
          case UpdateType.PUT:
            await table.upsert({ id: entry.id, ...entry.opData }).throwOnError();
            break;
          case UpdateType.PATCH:
            // A genuine UPDATE, not upsert(). entry.opData is only the
            // changed columns (PowerSync diffs against the last-synced
            // state), so it never carries user_id — upsert()'s
            // INSERT-ON-CONFLICT path still requires that (missing, so
            // null) column to satisfy the INSERT policy's `user_id =
            // auth.uid()` check, which fails RLS even though the row
            // already belongs to this user and the UPDATE policy alone
            // would've allowed it. A plain update only evaluates the
            // UPDATE policy against the row's actual, already-correct
            // user_id.
            await table.update(entry.opData ?? {}).eq('id', entry.id).throwOnError();
            break;
          case UpdateType.DELETE:
            await table.delete().eq('id', entry.id).throwOnError();
            break;
        }
      }
      await transaction.complete();
    } catch (error) {
      console.error('PowerSync uploadData hatası:', error);
      const message = error instanceof Error ? error.message : String(error);
      // PostgrestError's own docs say to branch on `code` (the Postgres
      // SQLSTATE, e.g. '23505') rather than message text — more robust than
      // matching substrings, and catches every variant of a given error
      // class instead of only the specific wordings already seen once.
      const code = error != null && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;

      // Targeted, provable recovery for daily_checkins specifically — NOT a
      // blanket DISCARDABLE_TABLES entry, because unlike settings this table
      // holds real, irreplaceable user edits (sleep/weight/stress). A
      // duplicate-key failure here (23505, unique(user_id, date)) means a
      // race created two local rows for the same day (fixed in
      // useSaveCheckin's withCheckinLock, 2026-08-13, but this can still be
      // an already-queued leftover from before that fix existed). The
      // failing row is either genuinely stale (safe to drop) or holds edits
      // the server's row is missing (must not be dropped) — never assume
      // which: fetch the server's actual row for that (user_id, date) and
      // compare updated_at directly instead of guessing. Only attempted
      // when this is the transaction's ONLY entry, so completing it can
      // never silently skip some other, unrelated pending write.
      if (
        code === '23505' &&
        transaction.crud.length === 1 &&
        failingEntry?.table === 'daily_checkins' &&
        failingEntry.op === UpdateType.PUT &&
        failingEntry.opData?.user_id &&
        failingEntry.opData?.date
      ) {
        try {
          const { data: serverRow } = await supabase
            .from('daily_checkins')
            .select('id, updated_at')
            .eq('user_id', failingEntry.opData.user_id as string)
            .eq('date', failingEntry.opData.date as string)
            .maybeSingle();
          if (serverRow) {
            const localUpdatedAt = failingEntry.opData.updated_at as string | undefined;
            const isLocalNewer = localUpdatedAt != null && new Date(localUpdatedAt) > new Date(serverRow.updated_at);
            if (isLocalNewer) {
              // The local row has edits the server doesn't — apply them to
              // the server's real row instead of losing them.
              const { id: _id, user_id: _userId, date: _date, ...rest } = failingEntry.opData as Record<string, unknown>;
              await supabase.from('daily_checkins').update(rest).eq('id', serverRow.id).throwOnError();
            }
            console.error(
              `daily_checkins çakışması çözüldü (${isLocalNewer ? 'sunucudaki satır güncellendi' : 'yerel satır zaten güncel değildi, atlandı'}), local id=${failingEntry.id}`
            );
            await transaction.complete();
            return;
          }
        } catch (recoveryError) {
          // Recovery itself failed (network, RLS, whatever) — fall through
          // to the normal retry-later path below rather than swallowing it.
          console.error('daily_checkins çakışma kurtarma denemesi başarısız:', recoveryError);
        }
      }

      // Same two-device/offline race can happen for day_notes: the server
      // has already created the one row for (user_id, date), while a device
      // that had not downloaded it yet inserts a different local UUID for
      // that same day. This is not discardable data — the note may be the
      // person's newest edit. Merge its editable fields into the server's
      // canonical row when it is newer, then complete the obsolete local
      // INSERT so it cannot block every later queued write behind it.
      if (
        code === '23505' &&
        transaction.crud.length === 1 &&
        failingEntry?.table === 'day_notes' &&
        failingEntry.op === UpdateType.PUT &&
        failingEntry.opData?.user_id &&
        failingEntry.opData?.date
      ) {
        try {
          const { data: serverRow } = await supabase
            .from('day_notes')
            .select('id, updated_at')
            .eq('user_id', failingEntry.opData.user_id as string)
            .eq('date', failingEntry.opData.date as string)
            .maybeSingle();
          if (serverRow) {
            const localUpdatedAt = failingEntry.opData.updated_at as string | undefined;
            const isLocalNewer = localUpdatedAt != null && new Date(localUpdatedAt) > new Date(serverRow.updated_at);
            if (isLocalNewer) {
              const { id: _id, user_id: _userId, date: _date, ...rest } = failingEntry.opData as Record<string, unknown>;
              await supabase.from('day_notes').update(rest).eq('id', serverRow.id).throwOnError();
            }
            console.error(
              `day_notes çakışması çözüldü (${isLocalNewer ? 'sunucudaki not güncellendi' : 'sunucudaki not daha yeni, yerel kopya atlandı'}), local id=${failingEntry.id}`
            );
            await transaction.complete();
            return;
          }
        } catch (recoveryError) {
          console.error('day_notes çakışma kurtarma denemesi başarısız:', recoveryError);
        }
      }

      // SQLSTATE class 22 (Data Exception) and 23 (Integrity Constraint
      // Violation), plus 42501 (RLS), all mean "this exact local row can
      // never be accepted, no matter how many times it's retried" — see
      // the git history of this file for the concrete cases hit tonight
      // (null user_id from before every insert stamped one; a stale
      // duplicate of a one-row-per-user table; a foreign key pointing at a
      // row that was itself already discarded this same way; a float in a
      // column SQLite let through but Postgres didn't).
      //
      // Calling transaction.complete() without actually uploading tells
      // PowerSync this write succeeded when it didn't — PowerSync's own
      // consistency model then treats the local row as confirmed-synced,
      // and can prune it locally the next time a download reconciles
      // local state against the server's (which never had this row).
      // That's fine — even desirable — for exercises/foods, where a
      // name-matched duplicate already exists on Supabase (this device's
      // own copy is genuinely redundant). It is NOT fine for anything
      // else: discarding a real nutritionLogs/exerciseLogs/etc. row this
      // way silently destroys the only copy of something a person
      // actually entered, locally AND on every other device, the instant
      // the next sync reconciles. That exact loss happened tonight before
      // this table restriction existed — never repeat it. Every other
      // table's permanent failures are left throwing (stuck in the queue,
      // retried forever) on purpose: a stuck queue is recoverable
      // (repairOrphanedCatalogReferences in seed.ts fixes the dangling
      // foreign-key case that's actually been observed here, on the next
      // app boot); silently discarded unique data is not.
      const isPermanentFailure =
        code != null &&
        (code.startsWith('22') || code.startsWith('23') || code === '42501') &&
        transaction.crud.every((entry) => DISCARDABLE_TABLES.has(entry.table));
      if (isPermanentFailure) {
        console.error('Kalıcı hata (code=' + code + '), işlem atlanıyor:', JSON.stringify(transaction.crud));
        if (!hasAlertedUploadError) {
          hasAlertedUploadError = true;
          const tables = [...new Set(transaction.crud.map((entry) => entry.table))].join(', ');
          alertMessage(
            'Senkron: düzeltilemeyen kayıt atlandı',
            `${tables} tablosunda yerel bir kayıt kalıcı olarak senkronlanamadı, atlandı: ${message}`
          );
        }
        await transaction.complete();
        return;
      }

      // Any other error (network, transient, or a permanent failure on a
      // table that isn't safe to discard) is left in the queue — PowerSync
      // retries uploadData after its default wait period.
      throw error;
    }
  },
};

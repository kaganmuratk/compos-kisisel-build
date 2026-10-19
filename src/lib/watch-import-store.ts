import * as SecureStore from 'expo-secure-store';

// A detected watch session goes through this store in two steps: (1) once
// imported, its id is added to the "processed" set so it's never imported
// again, and (2) a small notice record is kept so the Bugün screen can show
// "X eklendi" until the user acknowledges it — at which point only the
// notice is cleared, the processed id stays forever. Purely local/per-
// device: the underlying watch data itself only exists on whichever phone
// Gadgetbridge/Health Sync is bridging into, so there's nothing to sync
// across devices here. SecureStore (already a dependency for the Supabase
// session) is reused rather than pulling in a new storage library — a
// bounded list of short ids/records comfortably fits its per-key size limit.
export type WatchImportNotice = {
  id: string; // Health Connect ExerciseSession id
  label: string;
  startTime: string;
  endTime: string;
  kind: 'cardio' | 'workout';
  composSessionId: string;
};

const PROCESSED_KEY = 'compos-processed-watch-sessions';
const NOTICES_KEY = 'compos-pending-watch-notices';
const MAX_TRACKED = 200;

async function readProcessedIds(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(PROCESSED_KEY);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

export async function isWatchSessionProcessed(id: string): Promise<boolean> {
  const processed = await readProcessedIds();
  return processed.includes(id);
}

async function markWatchSessionProcessed(id: string): Promise<void> {
  const processed = await readProcessedIds();
  if (processed.includes(id)) {
    return;
  }
  await SecureStore.setItemAsync(PROCESSED_KEY, JSON.stringify([...processed, id].slice(-MAX_TRACKED)));
}

export async function getPendingWatchNotices(): Promise<WatchImportNotice[]> {
  const raw = await SecureStore.getItemAsync(NOTICES_KEY);
  return raw ? (JSON.parse(raw) as WatchImportNotice[]) : [];
}

// Called right after an auto-import succeeds — marks the session processed
// (so it's never re-imported) and records the notice to show for it.
export async function recordWatchSessionImported(notice: WatchImportNotice): Promise<void> {
  await markWatchSessionProcessed(notice.id);
  const notices = await getPendingWatchNotices();
  const next = [...notices.filter((n) => n.id !== notice.id), notice].slice(-MAX_TRACKED);
  await SecureStore.setItemAsync(NOTICES_KEY, JSON.stringify(next));
}

// User acknowledged the "X eklendi" card — clears only the notice, the
// session stays marked processed.
export async function dismissWatchNotice(id: string): Promise<void> {
  const notices = await getPendingWatchNotices();
  await SecureStore.setItemAsync(NOTICES_KEY, JSON.stringify(notices.filter((n) => n.id !== id)));
}

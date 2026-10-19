import { eq, isNull, desc } from 'drizzle-orm';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { db } from '@/db/client';
import { cardioSessions } from '@/db/schema';
import { selectAcceptedPoints, type RoutePoint } from '@/lib/geo';

export const BACKGROUND_LOCATION_TASK = 'background-location-task';

// Debug visibility into the raw fixes arriving from either tracking path
// (this background task, or the live screen's foreground watcher), independent
// of the accuracy/movement filters — read from the live run screen so a
// stalled route can be told apart from "GPS just isn't accurate enough here"
// instead of looking like a silent black box.
export let lastRawFix: { accuracy: number | null; capturedAt: number; targetSessionId: string | null } | null = null;

export function reportRawFix(accuracy: number | null, targetSessionId: string | null) {
  lastRawFix = { accuracy, capturedAt: Date.now(), targetSessionId };
}

// The background task and the foreground watcher both call
// appendAcceptedPoints for the same session, often within the same second.
// Each call does an async read-modify-write (read route, compute accepted
// points against it, write route back) with an `await` in between — without
// serialization, two calls can both read the same stale route before either
// writes, so both independently accept fixes against the same outdated
// `lastAccepted` point. That lets ordinary GPS jitter from the two parallel
// location subscriptions repeatedly clear MIN_MOVEMENT_METERS against a
// point that's no longer actually the route's last one, inflating total
// distance well beyond anything real. Queue calls per session so each one
// sees the previous one's write before computing its own.
const writeQueues = new Map<string, Promise<void>>();

function runSerialized(sessionId: string, task: () => Promise<void>): Promise<void> {
  const previous = writeQueues.get(sessionId) ?? Promise.resolve();
  const next = previous.then(task, task);
  writeQueues.set(
    sessionId,
    next.catch(() => {})
  );
  return next;
}

// Appends whatever of `locations` passes the shared accept/reject rules onto
// `sessionId`'s route. Used by both the background task and the live
// screen's foreground watcher, so a run tracks correctly whichever path
// actually gets fixes through — some Android devices/manufacturers are known
// to be unreliable about delivering background TaskManager location updates,
// so the foreground path (src/app/run/[sessionId].tsx) is a deliberate,
// independent fallback rather than a duplicate.
export function appendAcceptedPoints(sessionId: string, locations: Location.LocationObject[]): Promise<void> {
  return runSerialized(sessionId, async () => {
    const [session] = await db.select().from(cardioSessions).where(eq(cardioSessions.id, sessionId));
    if (!session) {
      return;
    }
    const existingRoute: RoutePoint[] = session.route ? JSON.parse(session.route) : [];
    const newPoints = selectAcceptedPoints(
      existingRoute,
      locations.map((location) => ({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        timestamp: location.timestamp,
        altitude: location.coords.altitude,
        accuracy: location.coords.accuracy ?? null,
      }))
    );
    if (newPoints.length === 0) {
      return;
    }
    await db
      .update(cardioSessions)
      .set({ route: JSON.stringify([...existingRoute, ...newPoints]) })
      .where(eq(cardioSessions.id, sessionId));
  });
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) {
    return;
  }

  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations?.length) {
    return;
  }

  const [activeSession] = await db
    .select()
    .from(cardioSessions)
    .where(isNull(cardioSessions.finishedAt))
    .orderBy(desc(cardioSessions.startedAt))
    .limit(1);

  const latest = locations[locations.length - 1];
  reportRawFix(latest.coords.accuracy ?? null, activeSession?.id ?? null);

  if (!activeSession) {
    return;
  }

  await appendAcceptedPoints(activeSession.id, locations);
});

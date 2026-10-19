import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { count, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';

import { db } from '@/db/client';
import { cardioSessions } from '@/db/schema';
import { powerSyncDb } from '@/db/powersync';
import { supabaseConnector } from '@/db/supabase-connector';
import { useAuth } from '@/hooks/use-auth';
import type { ActivityType } from '@/lib/activity-type';
import { getTodayDateString } from '@/lib/date';
import { totalDistance, totalElevationGain, type RoutePoint } from '@/lib/geo';
import { queryCyclingDetails, queryDistanceAndElevationForRange, queryRawSpeedSamples, queryWorkoutHealthSummary } from '@/lib/health-connect';
import { computeMovementBreakdown } from '@/lib/pace-segments';

export function useActiveCardioSession() {
  return useQuery({
    queryKey: ['cardio-sessions', 'active'],
    queryFn: async () => {
      const [session] = await db
        .select()
        .from(cardioSessions)
        .where(isNull(cardioSessions.finishedAt))
        .orderBy(desc(cardioSessions.startedAt))
        .limit(1);
      return session ?? null;
    },
  });
}

export function useTodayCardioSessionCount() {
  const date = getTodayDateString();
  return useQuery({
    queryKey: ['cardio-sessions', 'today-count', date],
    queryFn: async () => {
      const [{ value } = { value: 0 }] = await db
        .select({ value: count() })
        .from(cardioSessions)
        .where(eq(cardioSessions.date, date));
      return value ?? 0;
    },
  });
}

export function useStartCardioSession() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: { name?: string; notes?: string; plannedRouteId?: string; activityType?: ActivityType } = {}) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const [session] = await db
        .insert(cardioSessions)
        .values({ userId: user.id, date: getTodayDateString(), ...values })
        .returning();
      return session;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cardio-sessions', 'active'] }),
  });
}

// For runs that happened but were never tracked live (app wasn't working,
// forgot to start it, etc.) — inserts an already-finished session. No real
// GPS trace either way, but `route` can carry a computed walking route
// (start+end place picked, see run/manual.tsx) or a single marker point —
// same JSON-array-of-points shape a live GPS-tracked run stores, so
// run/summary/[id].tsx renders it with no extra handling either way.
export function useAddManualCardioSession() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: {
      date: string;
      name?: string;
      notes?: string;
      durationSeconds: number;
      distanceMeters?: number | null;
      route?: string;
      activityType?: ActivityType;
    }) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const sessionId = Crypto.randomUUID();
      // A web tab can outlive the worker client after a storage reset or an
      // auth transition. Rebind before writing so a closed extension is
      // reopened instead of leaving the save action inert.
      await powerSyncDb.connect(supabaseConnector);
      const startedAt = new Date(`${values.date}T12:00:00`);
      const finishedAt = new Date(startedAt.getTime() + values.durationSeconds * 1000);
      await db
        .insert(cardioSessions)
        .values({
          id: sessionId,
          userId: user.id,
          date: values.date,
          name: values.name,
          notes: values.notes,
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationSeconds: values.durationSeconds,
          distanceMeters: values.distanceMeters ?? null,
          route: values.route,
          ...(values.activityType && { activityType: values.activityType }),
        });
      return { id: sessionId };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cardio-sessions'] }),
  });
}

// Turns a watch-recorded run/walk/hike/ride (detected via Health Connect's
// ExerciseSession, see queryRecentWatchSessions) into a normal finished
// cardio session — real start/end clock times and, when the watch actually
// captured one, a real GPS route (not the noon-anchored placeholder
// useAddManualCardioSession uses, since here the true time is known).
// Distance/elevation are derived from the route with the exact same math a
// live-tracked run uses (totalDistance/totalElevationGain), not whatever
// Health Connect itself computed, so imported and live-tracked sessions stay
// consistent with each other.
export function useImportCardioSessionFromHealthConnect() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: {
      date: string;
      name?: string;
      startedAt: string;
      finishedAt: string;
      route: RoutePoint[];
      activityType?: ActivityType;
      details?: Record<string, string>;
    }) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const hasRoute = values.route.length > 1;
      // No GPS route (indoor/treadmill sessions never have one) doesn't
      // mean no distance data — the watch itself measured it and Health
      // Connect has it as its own Distance/ElevationGained records. Only
      // fall back to those when there's no route to derive it from
      // directly; a real route is more precise than an aggregate.
      const watchDistance = hasRoute ? null : await queryDistanceAndElevationForRange(values.startedAt, values.finishedAt);
      const [session] = await db
        .insert(cardioSessions)
        .values({
          userId: user.id,
          date: values.date,
          name: values.name,
          startedAt: values.startedAt,
          finishedAt: values.finishedAt,
          durationSeconds: Math.round((new Date(values.finishedAt).getTime() - new Date(values.startedAt).getTime()) / 1000),
          distanceMeters: hasRoute ? totalDistance(values.route) : watchDistance!.distanceMeters,
          elevationGainMeters: hasRoute ? totalElevationGain(values.route) : watchDistance!.elevationGainMeters,
          route: values.route.length > 0 ? JSON.stringify(values.route) : undefined,
          ...(values.activityType && { activityType: values.activityType }),
          ...(values.details && Object.keys(values.details).length > 0 && { extraData: JSON.stringify(values.details) }),
        })
        .returning();
      if (!session) {
        return session;
      }

      const summary = await queryWorkoutHealthSummary(values.startedAt, values.finishedAt);
      const cyclingDetails = values.activityType === 'bike' ? await queryCyclingDetails(values.startedAt, values.finishedAt) : {};
      // Empty samples (no permission, no watch data in this window) must
      // stay absent rather than write "0 min run/walk" — same
      // dataOrigins-empty-means-no-data distinction queryDailyHealthSummary
      // makes elsewhere, just without an aggregate to check: no raw samples
      // at all is the equivalent signal here.
      const speedSamples = await queryRawSpeedSamples(values.startedAt, values.finishedAt);
      const movement = speedSamples.length > 0 ? computeMovementBreakdown(speedSamples, values.startedAt, values.finishedAt) : null;
      if (summary || movement || Object.keys(cyclingDetails).length > 0) {
        await db
          .update(cardioSessions)
          .set({
            ...summary,
            ...(movement && {
              runSeconds: movement.runSeconds,
              walkSeconds: movement.walkSeconds,
              stoppedSeconds: movement.stoppedSeconds,
            }),
            ...(Object.keys(cyclingDetails).length > 0 && {
              extraData: JSON.stringify({ ...(values.details ?? {}), ...cyclingDetails }),
            }),
            healthSyncedAt: new Date().toISOString(),
          })
          .where(eq(cardioSessions.id, session.id));
      }
      return session;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cardio-sessions'] }),
  });
}

export function useCardioSession(id: string, options?: { live?: boolean }) {
  return useQuery({
    queryKey: ['cardio-sessions', id],
    queryFn: async () => {
      const [session] = await db.select().from(cardioSessions).where(eq(cardioSessions.id, id));
      return session ?? null;
    },
    refetchInterval: options?.live ? 3000 : undefined,
  });
}

export function useDeleteCardioSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.delete(cardioSessions).where(eq(cardioSessions.id, id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cardio-sessions'] });
    },
  });
}

export function useUpdateCardioSessionMeta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...values }: { id: string; name?: string | null; notes?: string | null }) =>
      db.update(cardioSessions).set(values).where(eq(cardioSessions.id, id)),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cardio-sessions', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['cardio-sessions'] });
    },
  });
}

export function useCardioHistory() {
  return useQuery({
    queryKey: ['cardio-sessions'],
    queryFn: () =>
      db
        .select()
        .from(cardioSessions)
        .where(isNotNull(cardioSessions.finishedAt))
        .orderBy(desc(cardioSessions.date), desc(cardioSessions.startedAt)),
  });
}

export function useFinishCardioSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const [session] = await db.select().from(cardioSessions).where(eq(cardioSessions.id, id));
      if (!session) {
        return;
      }
      const route: RoutePoint[] = session.route ? JSON.parse(session.route) : [];
      const durationSeconds = Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000);
      const finishedAt = new Date().toISOString();
      let elevationGainMeters = totalElevationGain(route);
      await db
        .update(cardioSessions)
        .set({
          finishedAt,
          distanceMeters: totalDistance(route),
          elevationGainMeters,
          durationSeconds,
        })
        .where(eq(cardioSessions.id, id));

      // Optional enrichment, never blocks/fails the finish itself — see
      // queryWorkoutHealthSummary's own doc comment for why a null result
      // is the expected everyday outcome here, not an error to surface.
      const summary = await queryWorkoutHealthSummary(session.startedAt, finishedAt);
      const cyclingDetails = session.activityType === 'bike' ? await queryCyclingDetails(session.startedAt, finishedAt) : {};
      // Phone GPS rarely reports altitude at all (most Android devices have
      // no barometer feeding expo-location), so totalElevationGain(route)
      // above comes out exactly 0 far more often than a real run had zero
      // climb. A route-based session never queries Health Connect's own
      // ElevationGained otherwise (see useImportCardioSessionFromHealthConnect's
      // "a real route is more precise than an aggregate" — that still holds
      // when the route actually has altitude). Only backfill from the
      // watch's barometer data when the route gave literally nothing.
      if (elevationGainMeters === 0) {
        const watchElevation = await queryDistanceAndElevationForRange(session.startedAt, finishedAt);
        if (watchElevation.elevationGainMeters != null) {
          elevationGainMeters = watchElevation.elevationGainMeters;
        }
      }
      const speedSamples = await queryRawSpeedSamples(session.startedAt, finishedAt);
      const movement = speedSamples.length > 0 ? computeMovementBreakdown(speedSamples, session.startedAt, finishedAt) : null;
      if (summary || movement || Object.keys(cyclingDetails).length > 0 || elevationGainMeters !== totalElevationGain(route)) {
        await db
          .update(cardioSessions)
          .set({
            ...summary,
            elevationGainMeters,
            ...(movement && {
              runSeconds: movement.runSeconds,
              walkSeconds: movement.walkSeconds,
              stoppedSeconds: movement.stoppedSeconds,
            }),
            ...(Object.keys(cyclingDetails).length > 0 && {
              extraData: JSON.stringify({ ...(session.extraData ? JSON.parse(session.extraData) : {}), ...cyclingDetails }),
            }),
            healthSyncedAt: new Date().toISOString(),
          })
          .where(eq(cardioSessions.id, id));
      }
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['cardio-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['cardio-sessions', id] });
    },
  });
}

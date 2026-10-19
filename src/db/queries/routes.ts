import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { desc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { cardioSessions, runRoutes } from '@/db/schema';
import { useAuth } from '@/hooks/use-auth';
import type { LatLng } from '@/lib/directions';

export function useRunRoutes() {
  return useQuery({
    queryKey: ['run-routes'],
    queryFn: () => db.select().from(runRoutes).orderBy(desc(runRoutes.createdAt)),
  });
}

export function useRunRoute(id: string | null) {
  return useQuery({
    queryKey: ['run-routes', id],
    queryFn: async () => {
      if (id === null) {
        return null;
      }
      const [route] = await db.select().from(runRoutes).where(eq(runRoutes.id, id));
      return route ?? null;
    },
  });
}

export function useAddRunRoute() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: { name: string; points: LatLng[]; distanceMeters: number }) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const [route] = await db
        .insert(runRoutes)
        .values({
          userId: user.id,
          name: values.name,
          points: JSON.stringify(values.points),
          distanceMeters: values.distanceMeters,
        })
        .returning();
      return route;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['run-routes'] }),
  });
}

export function useDeleteRunRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await db.transaction(async (tx) => {
        // cardioSessions.plannedRouteId has no onDelete clause in Postgres —
        // a session still pointing at a deleted route would get rejected on
        // upload (dangling FK), permanently jamming the sync queue.
        await tx.update(cardioSessions).set({ plannedRouteId: null }).where(eq(cardioSessions.plannedRouteId, id));
        await tx.delete(runRoutes).where(eq(runRoutes.id, id));
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['run-routes'] }),
  });
}

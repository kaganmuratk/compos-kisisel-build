import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { supplementCategories, supplements } from '@/db/schema';
import { useAuth } from '@/hooks/use-auth';

export type SupplementCategory = { id: string; name: string };

export function useSupplementCategories() {
  return useQuery({
    queryKey: ['supplement-categories'],
    queryFn: () => db.select().from(supplementCategories).orderBy(supplementCategories.orderIndex),
  });
}

export function useAddSupplementCategory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const trimmed = name.trim();
      if (!trimmed) return;
      const existing = await db.select({ id: supplementCategories.id }).from(supplementCategories);
      return db.insert(supplementCategories).values({ userId: user.id, name: trimmed, orderIndex: existing.length });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supplement-categories'] }),
  });
}

export function useRenameSupplementCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await db.update(supplementCategories).set({ name: trimmed }).where(eq(supplementCategories.id, id));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supplement-categories'] }),
  });
}

export function useRemoveSupplementCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.delete(supplementCategories).where(eq(supplementCategories.id, id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supplement-categories'] }),
  });
}

// One-time backfill (see _layout.tsx's boot chain, same shape as
// dedupeSupplementLogs) — the "Uncategorized" bucket used to be a synthetic,
// unmanageable grouping (categoryId IS NULL, no row backing it). The user
// asked for it to behave like any other category (rename/delete), so this
// turns whatever's currently uncategorized into a real, renamable row the
// first time it finds any — a no-op on every later boot since nothing stays
// uncategorized after this runs once. Genuinely new uncategorized items can
// still appear later (a new supplement saved with no category chosen, or an
// existing one left orphaned by deleting its category) — those are shown by
// a dynamic, non-editable fallback group in the UI, not by this function.
export async function ensureUncategorizedSupplementCategory(userId: string, language: 'en' | 'tr') {
  const [orphan] = await db.select({ id: supplements.id }).from(supplements).where(isNull(supplements.categoryId)).limit(1);
  if (!orphan) return;
  const name = language === 'tr' ? 'Kategorisiz' : 'Uncategorized';
  const [existingCategory] = await db.select({ id: supplementCategories.id }).from(supplementCategories).where(eq(supplementCategories.name, name)).limit(1);
  const categoryId =
    existingCategory?.id ??
    (await db.insert(supplementCategories).values({ userId, name, orderIndex: 0 }).returning({ id: supplementCategories.id }))[0].id;
  await db.update(supplements).set({ categoryId }).where(isNull(supplements.categoryId));
}

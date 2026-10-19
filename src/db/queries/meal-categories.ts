import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { mealCategories, mealTypes } from '@/db/schema';
import { useAuth } from '@/hooks/use-auth';
import { mealTypeLabels, mealTypeLabelsTr, mealTypeOrder } from '@/lib/meal-types';
import { useSettings } from '@/db/queries/settings';

export type MealCategory = { id: string; label: string; isCustom: boolean };

// The 4 built-in categories, plus whatever the user has added — the single
// list every screen should iterate/look up against instead of the old fixed
// `mealTypeOrder`/`mealTypeLabels`, so custom categories show up everywhere
// the 4 defaults used to be the only option.
export function useMealCategories() {
  const { data: settings } = useSettings();
  const query = useQuery({
    queryKey: ['meal-categories'],
    queryFn: () => db.select().from(mealCategories).orderBy(mealCategories.orderIndex),
  });
  const defaults: MealCategory[] = mealTypeOrder.map((mealType) => ({
    id: mealType,
    label: (settings?.language === 'tr' ? mealTypeLabelsTr : mealTypeLabels)[mealType],
    isCustom: false,
  }));
  const custom: MealCategory[] = (query.data ?? []).map((row) => ({
    id: row.id,
    label: row.name,
    isCustom: true,
  }));
  return { ...query, data: [...defaults, ...custom] };
}

export function getMealCategoryLabel(categories: MealCategory[], mealType: string) {
  return categories.find((c) => c.id === mealType)?.label ?? mealType;
}

export function useAddMealCategory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const trimmed = name.trim();
      if (!trimmed) return;
      const existing = await db.select({ id: mealCategories.id }).from(mealCategories);
      return db.insert(mealCategories).values({ userId: user.id, name: trimmed, orderIndex: existing.length });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meal-categories'] }),
  });
}

export function useRemoveMealCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.delete(mealCategories).where(eq(mealCategories.id, id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meal-categories'] }),
  });
}

// Re-exported so callers don't need to know the 4 built-in keys live in the
// schema module.
export { mealTypes };

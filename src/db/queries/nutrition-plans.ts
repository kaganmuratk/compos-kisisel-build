import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eq, max } from 'drizzle-orm';

import { db } from '@/db/client';
import { nutritionLogs, nutritionPlanMeals, nutritionPlans } from '@/db/schema';
import { useAuth } from '@/hooks/use-auth';
import { getTodayDateString } from '@/lib/date';
import type { MealType } from '@/db/queries/nutrition';

export function useNutritionPlans() {
  return useQuery({
    queryKey: ['nutrition-plans'],
    queryFn: () => db.query.nutritionPlans.findMany({ with: { meals: true } }),
  });
}

export function useAddNutritionPlan() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const [plan] = await db.insert(nutritionPlans).values({ userId: user.id, name }).returning();
      return plan;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['nutrition-plans'] }),
  });
}

export function useNutritionPlan(id: string) {
  return useQuery({
    queryKey: ['nutrition-plans', id],
    queryFn: async () => {
      const [plan] = await db.select().from(nutritionPlans).where(eq(nutritionPlans.id, id));
      return plan ?? null;
    },
  });
}

export function useDeleteNutritionPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (planId: string) => {
      await db.transaction(async (tx) => {
        await tx.delete(nutritionPlanMeals).where(eq(nutritionPlanMeals.planId, planId));
        await tx.delete(nutritionPlans).where(eq(nutritionPlans.id, planId));
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['nutrition-plans'] }),
  });
}

export function usePlanMeals(planId: string) {
  return useQuery({
    queryKey: ['nutrition-plans', planId, 'meals'],
    queryFn: () =>
      db.query.nutritionPlanMeals.findMany({
        where: eq(nutritionPlanMeals.planId, planId),
        orderBy: (fields, { asc }) => [asc(fields.orderIndex)],
        with: { food: true },
      }),
  });
}

function useInvalidatePlanMeals(planId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['nutrition-plans', planId, 'meals'] });
}

export function useAddMealToPlan(planId: string) {
  const invalidate = useInvalidatePlanMeals(planId);
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      foodId,
      mealType,
      amountGrams,
    }: {
      foodId: string;
      mealType: MealType;
      amountGrams: number;
    }) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const [{ nextIndex } = { nextIndex: 0 }] = await db
        .select({ nextIndex: max(nutritionPlanMeals.orderIndex) })
        .from(nutritionPlanMeals)
        .where(eq(nutritionPlanMeals.planId, planId));
      return db.insert(nutritionPlanMeals).values({
        userId: user.id,
        planId,
        foodId,
        mealType,
        amountGrams,
        orderIndex: (nextIndex ?? -1) + 1,
      });
    },
    onSuccess: invalidate,
  });
}

export function useRemoveMealFromPlan(planId: string) {
  const invalidate = useInvalidatePlanMeals(planId);
  return useMutation({
    mutationFn: (id: string) => db.delete(nutritionPlanMeals).where(eq(nutritionPlanMeals.id, id)),
    onSuccess: invalidate,
  });
}

export function usePlanMeal(mealId: string) {
  return useQuery({
    queryKey: ['nutrition-plan-meal', mealId],
    queryFn: () =>
      db.query.nutritionPlanMeals.findFirst({
        where: eq(nutritionPlanMeals.id, mealId),
        with: { food: true },
      }),
  });
}

export function useUpdatePlanMeal(planId: string) {
  const invalidate = useInvalidatePlanMeals(planId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...values }: { id: string; mealType?: MealType; amountGrams?: number }) =>
      db.update(nutritionPlanMeals).set(values).where(eq(nutritionPlanMeals.id, id)),
    onSuccess: (_data, variables) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['nutrition-plan-meal', variables.id] });
    },
  });
}

export function useApplyPlan() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (planId: string) => {
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const date = getTodayDateString();
      const meals = await db.query.nutritionPlanMeals.findMany({
        where: eq(nutritionPlanMeals.planId, planId),
      });
      for (const meal of meals) {
        await db.insert(nutritionLogs).values({
          userId: user.id,
          date,
          foodId: meal.foodId,
          mealType: meal.mealType,
          amountGrams: meal.amountGrams,
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['nutrition-logs'] }),
  });
}

import type { MealType } from '@/db/queries/nutrition';

export const mealTypeLabels: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

export const mealTypeLabelsTr: Record<MealType, string> = {
  breakfast: 'Kahvaltı',
  lunch: 'Öğle yemeği',
  dinner: 'Akşam yemeği',
  snack: 'Atıştırmalıklar',
};

export const mealTypeOrder: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

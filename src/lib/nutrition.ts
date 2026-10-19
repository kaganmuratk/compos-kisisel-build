export type MacroSource = {
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  saturatedFatPer100g?: number | null;
  unsaturatedFatPer100g?: number | null;
  transFatPer100g?: number | null;
  sugarsPer100g?: number | null;
  fiberPer100g?: number | null;
  saltPer100g?: number | null;
};

export function caloriesFromMacros(protein?: number | null, carbs?: number | null, fat?: number | null) {
  return (protein ?? 0) * 4 + (carbs ?? 0) * 4 + (fat ?? 0) * 9;
}

function scale(value: number | null | undefined, factor: number): number | null {
  return value != null ? value * factor : null;
}

export function macrosFor(food: MacroSource, amountGrams: number) {
  const factor = amountGrams / 100;
  return {
    kcal: food.caloriesPer100g * factor,
    protein: food.proteinPer100g * factor,
    carbs: food.carbsPer100g * factor,
    fat: food.fatPer100g * factor,
    saturatedFat: scale(food.saturatedFatPer100g, factor),
    unsaturatedFat: scale(food.unsaturatedFatPer100g, factor),
    transFat: scale(food.transFatPer100g, factor),
    sugars: scale(food.sugarsPer100g, factor),
    fiber: scale(food.fiberPer100g, factor),
    salt: scale(food.saltPer100g, factor),
  };
}

export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export type NutritionDetailLabels = {
  fiber: string;
  sugar: string;
  saturatedFat: string;
  salt: string;
};

// English fallback for the few callers that only need `totals` and never
// render `detailLine`/`detailParts` — those pass no labels, so this default
// never actually reaches a screen.
const DEFAULT_DETAIL_LABELS: NutritionDetailLabels = { fiber: 'Fiber', sugar: 'Sugar', saturatedFat: 'Saturated fat', salt: 'Salt' };

// Sums a day's logged foods into totals (kcal/protein/carbs/fat plus the
// detailed sub-macros) and builds a single "Lif 4 g · Şeker 12 g" style line
// for whichever detailed fields at least one logged food actually has data
// for — logs without that field just don't contribute to it, rather than
// silently reading as a false "0". `detailParts` carries the same entries
// with a stable `key` alongside the localized text, so callers that need to
// single out one entry (e.g. showing salt on its own line) can match on
// `key` instead of string-matching the localized label.
export function summarizeNutritionLogs(logs: (MacroSource & { amountGrams: number })[], labels: NutritionDetailLabels = DEFAULT_DETAIL_LABELS) {
  const totals = logs.reduce(
    (acc, log) => {
      const m = macrosFor(log, log.amountGrams);
      acc.kcal += m.kcal;
      acc.protein += m.protein;
      acc.carbs += m.carbs;
      acc.fat += m.fat;
      acc.saturatedFat += m.saturatedFat ?? 0;
      acc.sugars += m.sugars ?? 0;
      acc.fiber += m.fiber ?? 0;
      acc.salt += m.salt ?? 0;
      return acc;
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0, saturatedFat: 0, sugars: 0, fiber: 0, salt: 0 }
  );

  const detailParts = [
    logs.some((l) => l.fiberPer100g != null) ? { key: 'fiber' as const, text: `${labels.fiber} ${round(totals.fiber, 1)} g` } : null,
    logs.some((l) => l.sugarsPer100g != null) ? { key: 'sugar' as const, text: `${labels.sugar} ${round(totals.sugars, 1)} g` } : null,
    logs.some((l) => l.saturatedFatPer100g != null) ? { key: 'saturatedFat' as const, text: `${labels.saturatedFat} ${round(totals.saturatedFat, 1)} g` } : null,
    logs.some((l) => l.saltPer100g != null) ? { key: 'salt' as const, text: `${labels.salt} ${round(totals.salt, 2)} g` } : null,
  ].filter((part): part is { key: 'fiber' | 'sugar' | 'saturatedFat' | 'salt'; text: string } => part != null);

  return { totals, detailLine: detailParts.map((part) => part.text).join(' · '), detailParts };
}

export type FoodPortion = { label: string; grams: number };

export function parsePortions(portions: string | null | undefined): FoodPortion[] {
  if (!portions) {
    return [];
  }
  try {
    const parsed = JSON.parse(portions);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export type WeightUnit = 'kg' | 'lb';

const KG_TO_LB = 2.20462;

// Weight is always stored in kg; convert only at the display/input boundary.
export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'lb' ? Math.round(kg * KG_TO_LB * 10) / 10 : kg;
}

export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'lb' ? Math.round((value / KG_TO_LB) * 10) / 10 : value;
}

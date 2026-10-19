export type ActivityType = 'run' | 'swim' | 'bike' | 'motor';

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  run: 'Run',
  swim: 'Swim',
  bike: 'Bike',
  motor: 'Motorcycle',
};

const ACTIVITY_TYPE_LABELS_TR: Record<ActivityType, string> = {
  run: 'Koşu',
  swim: 'Yüzme',
  bike: 'Bisiklet',
  motor: 'Motosiklet',
};

export function getActivityTypeLabel(type: ActivityType, language: 'en' | 'tr' = 'en'): string {
  return language === 'tr' ? ACTIVITY_TYPE_LABELS_TR[type] : ACTIVITY_TYPE_LABELS[type];
}

export function activityTypeUsesSpeed(activityType: ActivityType): boolean {
  return activityType === 'bike' || activityType === 'motor';
}

export function isActivityType(value: string): value is ActivityType {
  return value === 'run' || value === 'swim' || value === 'bike' || value === 'motor';
}

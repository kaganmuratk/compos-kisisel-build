import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { settings } from '@/db/schema';

export async function getSettingsRow() {
  const [row] = await db.select().from(settings).limit(1);
  return row;
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: getSettingsRow,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      unit?: 'kg' | 'lb';
      repMetric?: 'rir' | 'rpe';
      waterGoalMl?: number;
      calorieGoal?: number;
      proteinGoal?: number;
      carbsGoal?: number;
      fatGoal?: number;
      themeMode?: 'light' | 'dark' | 'system';
      dailyDrinkCard?: 'water' | 'coffee';
      defaultBedTime?: string | null;
      defaultWakeTime?: string | null;
      mediaCloudBackup?: boolean;
      language?: 'en' | 'tr';
      defaultRepMetricValue?: number | null;
    }) => {
      const row = await getSettingsRow();
      if (!row) {
        return;
      }
      return db.update(settings).set(values).where(eq(settings.id, row.id));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });
}

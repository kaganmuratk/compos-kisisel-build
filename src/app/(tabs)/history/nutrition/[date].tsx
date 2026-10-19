import { router, useLocalSearchParams } from 'expo-router';

import NutritionScreen from '@/app/(tabs)/nutrition';

export default function NutritionDayRecapScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  return <NutritionScreen date={date} onBack={() => router.replace({ pathname: '/history/day/[date]', params: { date } })} />;
}

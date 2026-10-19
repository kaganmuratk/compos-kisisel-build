import * as FileSystem from 'expo-file-system/legacy';

import type { DayEntry } from '@/db/queries/history-days';

const EXPORT_DIR = `${FileSystem.documentDirectory}exports/`;

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function createHistoryCsv(days: DayEntry[], startDate?: string, endDate?: string) {
  const header = ['Tarih', 'Antrenmanlar', 'Kardiyo', 'Kalori', 'Uyku (saat)', 'Şekerleme (saat)', 'Stres', 'Kilo (kg)', 'Su (ml)', 'Kahve', 'Not', 'Takviyeler'];
  const rows = days
    .filter((day) => (!startDate || day.date >= startDate) && (!endDate || day.date <= endDate))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => [
      day.date,
      day.workouts.map((workout) => workout.name ?? 'Antrenman').join(' · '),
      day.runs.map((run) => `${run.name ?? run.activityType} (${run.distanceMeters ?? 0} m)`).join(' · '),
      day.nutrition?.totalCalories,
      day.checkin?.sleepHours,
      day.checkin?.napHours,
      day.checkin?.stressLevel,
      day.checkin?.weightKg,
      day.water,
      day.coffee,
      day.dayNote?.note,
      day.supplements.map((supplement) => `${supplement.name}${supplement.amount ? ` (${supplement.amount})` : ''}`).join(' · '),
    ].map(csvCell).join(','));

  return [header.map(csvCell).join(','), ...rows].join('\n');
}

export async function writeHistoryCsv(csv: string, fileName: string) {
  if (!FileSystem.documentDirectory) {
    throw new Error('Dışa aktarma klasörü bulunamadı.');
  }
  await FileSystem.makeDirectoryAsync(EXPORT_DIR, { intermediates: true });
  const uri = `${EXPORT_DIR}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  return uri;
}

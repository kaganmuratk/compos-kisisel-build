import { formatShortDate } from '@/lib/date';

export type BarPeriod = 'day' | 'week' | 'month';
export type PeriodBar = { key: string; label: string; value: number };

const monthFormatter = new Intl.DateTimeFormat('tr-TR', { month: 'short', year: '2-digit' });

function mondayOf(dateString: string): string {
  const d = new Date(dateString);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

// Groups daily {date, value} entries into day/week/month bars, always keyed by
// a unique period bucket (never raw entries) — a day can have more than one
// entry (e.g. two runs), so grouping happens even at 'day' granularity to
// avoid duplicate labels/keys and to show a single combined bar per day.
// `sum` totals the period (e.g. weekly running distance); `avg` averages per
// day in the period (e.g. average daily calorie intake, comparable to a daily
// goal).
export function buildPeriodBars(
  entries: { date: string; value: number }[],
  period: BarPeriod,
  aggregate: 'sum' | 'avg'
): PeriodBar[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  const groups = new Map<string, { sum: number; count: number }>();
  for (const entry of sorted) {
    const key = period === 'day' ? entry.date : period === 'week' ? mondayOf(entry.date) : entry.date.slice(0, 7);
    const group = groups.get(key) ?? { sum: 0, count: 0 };
    group.sum += entry.value;
    group.count += 1;
    groups.set(key, group);
  }

  const keys = [...groups.keys()].sort();
  const sliceCount = period === 'day' ? 10 : period === 'week' ? 8 : 6;
  const recentKeys = keys.slice(-sliceCount);

  return recentKeys.map((key) => {
    const group = groups.get(key)!;
    const label =
      period === 'day' || period === 'week' ? formatShortDate(key) : monthFormatter.format(new Date(`${key}-01`));
    return { key, label, value: aggregate === 'avg' ? group.sum / group.count : group.sum };
  });
}

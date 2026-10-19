import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PaletteText as ThemedText, useNutritionPalette } from '@/components/nutrition-ui';
import { PeriodToggle } from '@/components/period-toggle';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedView } from '@/components/themed-view';
import { TimeSeriesChart } from '@/components/time-series-chart';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useNutritionDaysHistory, useNutritionGoalSnapshotsHistory } from '@/db/queries/nutrition';
import { useSettings } from '@/db/queries/settings';
import { addDaysToDateString, getTodayDateString } from '@/lib/date';
import { buildPeriodBars, type BarPeriod } from '@/lib/period-bars';
import { useT } from '@/lib/i18n';

const ranges = [7, 30, 90, null] as const;
// 'day' only makes sense for the 7-day range — at 30/90/all it would only
// ever show its last 10 points (see buildPeriodBars' sliceCount) out of a
// much bigger window, silently hiding most of the selected range. Rather
// than let that combination be picked at all, 'day' is hidden outside 7G;
// 30G in turn only makes sense bucketed weekly (a month of daily points
// would crowd the axis, and monthly buckets would just be a single bar).
const disabledPeriods = (range: number | null): BarPeriod[] => range === 7 ? ['week', 'month'] : range === 30 ? ['day', 'month'] : ['day'];
const defaultPeriod = (range: number | null): BarPeriod => range === 7 ? 'day' : range === 30 ? 'week' : 'month';
const weekdayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

// useNutritionDaysHistory only returns dates that have at least one logged
// food — a day with no log is simply absent, not a zero-calorie row. Left
// as-is, the chart silently skips those days (e.g. "26, 1, 3, 7, 10" for a
// week with gaps), which reads as broken data rather than "you didn't log
// that day." Filling every calendar day in the window with 0 makes an
// unlogged day count as 0 kcal against the target, same as it should.
function fillMissingDays(days: { date: string; totalCalories: number }[], range: number | null): { date: string; totalCalories: number }[] {
  const byDate = new Map(days.map((item) => [item.date, item.totalCalories]));
  const end = getTodayDateString();
  const start = range == null
    ? days.reduce((min, item) => (item.date < min ? item.date : min), end)
    : addDaysToDateString(end, -(range - 1));
  const filled: { date: string; totalCalories: number }[] = [];
  for (let date = start; date <= end; date = addDaysToDateString(date, 1)) {
    filled.push({ date, totalCalories: byDate.get(date) ?? 0 });
  }
  return filled;
}

export default function NutritionAnalysisScreen() {
  const p = useNutritionPalette();
  const styles = useMemo(() => createStyles(p), [p]);
  const { t, language } = useT();
  const { data: entries = [] } = useNutritionDaysHistory();
  const { data: snapshots = [] } = useNutritionGoalSnapshotsHistory();
  const { data: settings } = useSettings();
  const [period, setPeriod] = useState<BarPeriod>('week');
  const [range, setRange] = useState<number | null>(30);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const goal = settings?.calorieGoal ?? 2000;
  const goals = new Map(snapshots.map((item) => [item.date, item.calorieGoal]));
  const selected = range == null ? entries : entries.slice(0, range);
  const avgCalories = selected.length ? Math.round(selected.reduce((sum, item) => sum + item.totalCalories, 0) / selected.length) : 0;
  const dense = fillMissingDays(selected, range);
  const actualBars = buildPeriodBars(dense.map((item) => ({ date: item.date, value: item.totalCalories })), period, 'avg');
  const targets = new Map(buildPeriodBars(dense.map((item) => ({ date: item.date, value: goals.get(item.date) ?? goal })), period, 'avg').map((item) => [item.key, item.value]));
  // 'day' shows the weekday (Pzt/Sal/…) instead of the date — with up to 10
  // points on screen (see buildPeriodBars' sliceCount) that's the more
  // useful read at a glance; the tooltip still shows the full "13 Eyl" via
  // `label`. Week/month have far fewer points and keep the fuller label.
  const axisLabelFor = (item: { key: string; label: string }) => period === 'day' ? t(weekdayKeys[new Date(`${item.key}T00:00:00`).getDay()]) : item.label;
  const actual = actualBars.map((item) => ({ value: item.value, label: item.label, axisLabel: axisLabelFor(item), dateKey: item.key }));
  const target = actualBars.map((item) => ({ value: targets.get(item.key) ?? goal, label: item.label, axisLabel: axisLabelFor(item), dateKey: item.key }));
  const monthList = entries.filter((item) => { const date = new Date(`${item.date}T00:00:00`); return date.getFullYear() === selectedMonth.getFullYear() && date.getMonth() === selectedMonth.getMonth(); }).sort((a, b) => b.date.localeCompare(a.date));
  const years = new Set(entries.map((item) => item.date.slice(0, 4)));
  const changeRange = (nextRange: number | null) => { setRange(nextRange); if (disabledPeriods(nextRange).includes(period)) setPeriod(defaultPeriod(nextRange)); };
  const changeMonth = (offset: number) => setSelectedMonth((value) => new Date(value.getFullYear(), value.getMonth() + offset, 1));
  const changeYear = (offset: number) => setSelectedMonth((value) => new Date(value.getFullYear() + offset, value.getMonth(), 1));

  return <ThemedView lightColor={p.background} darkColor={p.background} style={styles.page}><SafeAreaView style={styles.safe} edges={['top']}><ScreenHeader eyebrow={t('foodAndTargets').toUpperCase()} title={t('nutrition').toUpperCase()} accentColor={p.yellow} backHref="/analysis" /><View style={styles.averageRow}><ThemedText style={styles.averageLabel}>{t(range === 7 ? 'lastSevenDays' : range === 30 ? 'lastThirtyDays' : range === 90 ? 'lastNinetyDays' : 'allTime').toUpperCase()}</ThemedText><ThemedText style={styles.averageValue}>{avgCalories} <ThemedText style={styles.averageUnit}>kcal</ThemedText></ThemedText></View><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><TimeSeriesChart title={t('calorieIntakeVsTarget').toUpperCase()} unit="kcal" data={actual} secondaryData={target} kind="calories" color={p.yellow} secondaryColor={p.text} seriesLabels={[t('actual').toUpperCase(), t('target').toUpperCase()]} surfaceColor={p.card} borderColor={p.border} footer={<View style={styles.chartFooter}><View style={styles.chips}>{ranges.map((item) => <Pressable key={String(item)} onPress={() => changeRange(item)} style={[styles.chip, range === item && styles.chipSelected]}><ThemedText style={[styles.chipText, range === item && styles.chipTextSelected]}>{item == null ? t('all').toUpperCase() : `${item}${t('daysAbbrev')}`}</ThemedText></Pressable>)}</View><PeriodToggle value={period} onChange={setPeriod} hidden={disabledPeriods(range)} /></View>} /><View style={styles.legend}><Legend color={p.yellow} label={t('actual').toUpperCase()} /><Legend color={p.text} label={t('dailyGoal').toUpperCase()} /></View><View style={styles.historyDivider} /><ThemedText style={styles.historyHeading}>{t('historyByMonth').toUpperCase()}</ThemedText><View style={styles.monthControls}><Pressable accessibilityLabel="Previous month" onPress={() => changeMonth(-1)} hitSlop={10}><ThemedText style={styles.monthArrow}>‹</ThemedText></Pressable><ThemedText style={styles.monthLabel}>{new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-US', { month: 'short' }).format(selectedMonth).toUpperCase()} {selectedMonth.getFullYear()}</ThemedText><Pressable accessibilityLabel="Next month" onPress={() => changeMonth(1)} hitSlop={10}><ThemedText style={styles.monthArrow}>›</ThemedText></Pressable>{years.size > 1 ? <View style={styles.yearControls}><Pressable accessibilityLabel="Previous year" onPress={() => changeYear(-1)} hitSlop={8}><ThemedText style={styles.yearArrow}>‹</ThemedText></Pressable><ThemedText style={styles.yearLabel}>{selectedMonth.getFullYear()}</ThemedText><Pressable accessibilityLabel="Next year" onPress={() => changeYear(1)} hitSlop={8}><ThemedText style={styles.yearArrow}>›</ThemedText></Pressable></View> : null}</View>{monthList.length ? <View style={styles.historyList}>{monthList.map((item) => { const targetCalories = goals.get(item.date) ?? goal; const date = new Date(`${item.date}T00:00:00`); return <View key={item.date} style={styles.historyCard}><View style={styles.date}><ThemedText style={styles.dayOfWeek}>{t(weekdayKeys[date.getDay()])}</ThemedText><ThemedText style={styles.dayNumber}>{date.getDate()}</ThemedText></View><View style={styles.value}><ThemedText style={[styles.actualValue, item.totalCalories > targetCalories && styles.actualOver]}>{Math.round(item.totalCalories)}</ThemedText><ThemedText style={styles.valueSeparator}> / </ThemedText><ThemedText style={styles.targetValue}>{targetCalories}</ThemedText><ThemedText style={styles.valueUnit}> kcal</ThemedText></View></View>; })}</View> : <ThemedText style={styles.empty}>{t('noEntriesThisMonth').toUpperCase()}</ThemedText>}</ScrollView></SafeAreaView></ThemedView>;
}

function Legend({ color, label }: { color: string; label: string }) { const p = useNutritionPalette(); const styles = useMemo(() => createStyles(p), [p]); return <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: color }]} /><ThemedText style={styles.legendText}>{label}</ThemedText></View>; }
const createStyles = (p: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({ page: { flex: 1, backgroundColor: p.background }, safe: { flex: 1, paddingHorizontal: Spacing.three }, content: { gap: Spacing.three, paddingBottom: Spacing.six }, averageRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: Spacing.three, marginBottom: Spacing.two }, averageLabel: { color: p.muted, fontFamily: Fonts.technical, fontSize: 12, letterSpacing: 1 }, averageValue: { color: p.yellow, fontFamily: Fonts.metric, fontSize: 22, fontVariant: ['tabular-nums'] }, averageUnit: { color: p.muted, fontFamily: Fonts.technical, fontSize: 10 }, chartFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, legend: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.three }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }, legendLine: { width: 18, height: 2 }, legendText: { color: p.muted, fontFamily: Fonts.technical, fontSize: 8 }, chips: { flexDirection: 'row', gap: Spacing.one }, chip: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderWidth: StyleSheet.hairlineWidth, borderColor: p.border, borderRadius: Radius.sm }, chipSelected: { backgroundColor: p.raised }, chipText: { color: p.muted, fontFamily: Fonts.technical, fontSize: 8 }, chipTextSelected: { color: p.text }, historyDivider: { height: StyleSheet.hairlineWidth, backgroundColor: p.border, marginVertical: Spacing.one }, historyHeading: { color: p.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 }, monthControls: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: Spacing.two }, monthArrow: { color: p.yellow, fontFamily: Fonts.technical, fontSize: 20 }, monthLabel: { color: p.text, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 0.7 }, yearControls: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: Spacing.one }, yearArrow: { color: p.muted, fontFamily: Fonts.technical, fontSize: 16 }, yearLabel: { color: p.muted, fontFamily: Fonts.technical, fontSize: 9 }, historyList: { borderWidth: StyleSheet.hairlineWidth, borderColor: p.border, borderRadius: Radius.lg, overflow: 'hidden' }, historyCard: { minHeight: 48, paddingHorizontal: Spacing.three, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.border }, date: { gap: 2 }, dayOfWeek: { color: p.muted, fontFamily: Fonts.technical, fontSize: 10 }, dayNumber: { color: p.text, fontFamily: Fonts.metric, fontSize: 16, fontVariant: ['tabular-nums'] }, value: { flexDirection: 'row', alignItems: 'baseline' }, actualValue: { color: p.text, fontFamily: Fonts.metric, fontSize: 15, fontVariant: ['tabular-nums'] }, actualOver: { color: p.yellow }, valueSeparator: { color: p.muted, fontFamily: Fonts.technical, fontSize: 13 }, targetValue: { color: p.muted, fontFamily: Fonts.metric, fontSize: 13, fontVariant: ['tabular-nums'] }, valueUnit: { color: p.muted, fontFamily: Fonts.technical, fontSize: 11 }, empty: { color: p.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.7, textAlign: 'center', paddingVertical: Spacing.four } });

import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PeriodToggle } from '@/components/period-toggle';
import { ScreenHeader } from '@/components/screen-header';
import { PaletteText as ThemedText, useNutritionPalette } from '@/components/nutrition-ui';
import { ThemedView } from '@/components/themed-view';
import { TimeSeriesChart } from '@/components/time-series-chart';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useCheckinHistory, useWaterHistory } from '@/db/queries/daily';
import { useSettings } from '@/db/queries/settings';
import { type ChartMetricKind } from '@/lib/chart-scale';
import { formatShortDate } from '@/lib/date';
import { useT } from '@/lib/i18n';
import { buildPeriodBars, type BarPeriod } from '@/lib/period-bars';
import { fromKg } from '@/lib/units';

type BodyMetric = 'weight' | 'sleep' | 'stress' | 'water';
const chartScaleKinds: Record<BodyMetric, ChartMetricKind> = { weight: 'weight', sleep: 'sleep', stress: 'stress', water: 'water' };
const ranges = [7, 30, 90, null] as const;
// 'day' only makes sense for the 7-day range — at 30/90/all it would only
// ever show its last 10 points (see buildPeriodBars' sliceCount) out of a
// much bigger window, silently hiding most of the selected range. See the
// same rule on the nutrition analysis screen.
const disabledPeriods = (range: number | null): BarPeriod[] => range === 7 ? ['week', 'month'] : range === 30 ? ['day', 'month'] : ['day'];
const defaultPeriod = (range: number | null): BarPeriod => range === 7 ? 'day' : range === 30 ? 'week' : 'month';
const weekdayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

export default function BodyMetricAnalysisScreen() {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const theme = { text: palette.text, textSecondary: palette.muted, border: palette.border, accent: palette.red };
  const { t, language } = useT();
  const metricLabels: Record<BodyMetric, string> = { weight: t('weight').toUpperCase(), sleep: t('sleep').toUpperCase(), stress: t('stress').toUpperCase(), water: t('water').toUpperCase() };
  const { metric } = useLocalSearchParams<{ metric: BodyMetric }>();
  const { data: checkins = [] } = useCheckinHistory();
  const { data: waterDays = [] } = useWaterHistory();
  const { data: settings } = useSettings();
  const [range, setRange] = useState<number | null>(30);
  const [period, setPeriod] = useState<BarPeriod>('week');
  const [selectedMonth, setSelectedMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const unit = settings?.unit ?? 'kg';
  const records = (metric === 'water' ? waterDays.map((entry) => ({ date: entry.date, value: entry.total })) : checkins.map((entry) => ({ date: entry.date, value: metric === 'weight' ? entry.weightKg == null ? null : fromKg(entry.weightKg, unit) : metric === 'sleep' ? entry.sleepHours : entry.stressLevel })).filter((entry): entry is { date: string; value: number } => entry.value != null)).sort((a, b) => a.date.localeCompare(b.date));
  const filteredRecords = range == null ? records : records.slice(-range);
  const avgValue = filteredRecords.length ? filteredRecords.reduce((sum, entry) => sum + entry.value, 0) / filteredRecords.length : null;
  const bars = buildPeriodBars(filteredRecords, period, 'avg');
  // 'day' shows the weekday (Pzt/Sal/…) instead of the date — with up to
  // 10 points on screen (see buildPeriodBars' sliceCount) that's the more
  // useful read at a glance; the tooltip still shows the full date via
  // `label`. Week/month have far fewer points and keep the fuller label.
  const axisLabelFor = (bar: { key: string; label: string }) => period === 'day' ? t(weekdayKeys[new Date(`${bar.key}T00:00:00`).getDay()]) : bar.label;
  const chartData = bars.map((bar) => ({ value: bar.value, label: bar.label, axisLabel: axisLabelFor(bar), dateKey: bar.key }));
  const targetData = metric === 'water' ? bars.map((bar) => ({ value: settings?.waterGoalMl ?? 2500, label: bar.label, axisLabel: axisLabelFor(bar), dateKey: bar.key })) : undefined;
  const tooltipUnit = metric === 'weight' ? unit : metric === 'sleep' ? t('hours').toLowerCase() : metric === 'water' ? 'ml' : undefined;
  const monthList = records.filter((entry) => { const date = new Date(`${entry.date}T00:00:00`); return date.getFullYear() === selectedMonth.getFullYear() && date.getMonth() === selectedMonth.getMonth(); }).reverse();
  const years = new Set(records.map((entry) => entry.date.slice(0, 4)));
  const changeRange = (nextRange: number | null) => { setRange(nextRange); if (disabledPeriods(nextRange).includes(period)) setPeriod(defaultPeriod(nextRange)); };
  const changeMonth = (offset: number) => setSelectedMonth((value) => new Date(value.getFullYear(), value.getMonth() + offset, 1));
  const changeYear = (offset: number) => setSelectedMonth((value) => new Date(value.getFullYear() + offset, value.getMonth(), 1));
  // water/stress are per-day integers, but an *averaged* value (the header
  // stat, or a week/month-bucketed history row) is a mean of several days
  // and lands on an arbitrary decimal (e.g. "1249.6153846153845 ml") unless
  // rounded here too — Math.round, not toFixed(0), since these are whole
  // units (ml, a 1-5 stress score) with no fractional meaning at all.
  const valueText = (value: number) => metric === 'weight' ? `${value.toFixed(1)} ${unit}` : metric === 'sleep' ? `${value.toFixed(1)} ${t('hours').toLowerCase()}` : metric === 'water' ? `${Math.round(value)} ml` : `${Math.round(value)} / 5`;
  const title = metric === 'weight' ? `${metricLabels.weight} (${unit})` : metricLabels[metric];

  const monthLabel = new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-US', { month: 'short' }).format(selectedMonth).toUpperCase();
  return <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.container}><SafeAreaView style={styles.safeArea} edges={['top']}><ScreenHeader eyebrow={t('bodySignals').toUpperCase()} title={title} accentColor={theme.accent} backHref="/analysis/body" /><View style={styles.averageRow}><ThemedText style={styles.averageLabel}>{t(range === 7 ? 'lastSevenDays' : range === 30 ? 'lastThirtyDays' : range === 90 ? 'lastNinetyDays' : 'allTime').toUpperCase()}</ThemedText><ThemedText style={styles.averageValue}>{avgValue == null ? '—' : valueText(avgValue)}</ThemedText></View><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><TimeSeriesChart title={title} unit={tooltipUnit} data={chartData} secondaryData={targetData} kind={chartScaleKinds[metric]} color={theme.accent} secondaryColor={palette.text} seriesLabels={metric === 'water' ? [t('actual').toUpperCase(), t('target').toUpperCase()] : undefined} surfaceColor={palette.card} borderColor={palette.border} footer={<View style={styles.chartFooter}><View style={styles.chips}>{ranges.map((item) => <Pressable key={String(item)} onPress={() => changeRange(item)} style={[styles.chip, range === item && styles.chipSelected]}><ThemedText style={[styles.chipText, range === item && styles.chipTextSelected]}>{item == null ? t('all').toUpperCase() : `${item}${t('daysAbbrev')}`}</ThemedText></Pressable>)}</View><PeriodToggle value={period} onChange={setPeriod} hidden={disabledPeriods(range)} /></View>} /><View style={styles.historyDivider} /><ThemedText style={styles.historyHeading}>{t('historyByMonth').toUpperCase()}</ThemedText><View style={styles.monthControls}><Pressable accessibilityLabel="Previous month" onPress={() => changeMonth(-1)} hitSlop={10}><ThemedText style={styles.monthArrow}>‹</ThemedText></Pressable><ThemedText style={styles.monthLabel}>{monthLabel} {selectedMonth.getFullYear()}</ThemedText><Pressable accessibilityLabel="Next month" onPress={() => changeMonth(1)} hitSlop={10}><ThemedText style={styles.monthArrow}>›</ThemedText></Pressable>{years.size > 1 ? <View style={styles.yearControls}><Pressable accessibilityLabel="Previous year" onPress={() => changeYear(-1)} hitSlop={8}><ThemedText style={styles.yearArrow}>‹</ThemedText></Pressable><ThemedText style={styles.yearLabel}>{selectedMonth.getFullYear()}</ThemedText><Pressable accessibilityLabel="Next year" onPress={() => changeYear(1)} hitSlop={8}><ThemedText style={styles.yearArrow}>›</ThemedText></Pressable></View> : null}</View>{monthList.length ? <View style={styles.historyList}>{monthList.map((entry) => <View key={entry.date} style={styles.historyCard}><ThemedText style={styles.date}>{formatShortDate(entry.date)}</ThemedText><ThemedText style={styles.value}>{valueText(entry.value)}</ThemedText></View>)}</View> : <ThemedText style={styles.empty}>{t('noEntriesThisMonth').toUpperCase()}</ThemedText>}</ScrollView></SafeAreaView></ThemedView>;
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({ container: { flex: 1 }, safeArea: { flex: 1, paddingHorizontal: Spacing.three }, averageRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: Spacing.three, marginBottom: Spacing.two }, averageLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 12, letterSpacing: 1 }, averageValue: { color: palette.red, fontFamily: Fonts.metric, fontSize: 22, fontVariant: ['tabular-nums'] }, content: { gap: Spacing.three, paddingBottom: Spacing.six }, chartFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, chips: { flexDirection: 'row', gap: Spacing.one }, chip: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: Radius.sm }, chipSelected: { backgroundColor: palette.raised }, chipText: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 8 }, chipTextSelected: { color: palette.text }, historyDivider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginVertical: Spacing.one }, historyHeading: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 }, monthControls: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: Spacing.two }, monthArrow: { color: palette.red, fontFamily: Fonts.technical, fontSize: 20 }, monthLabel: { color: palette.text, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 0.7 }, yearControls: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: Spacing.one }, yearArrow: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 16 }, yearLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9 }, historyList: { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: Radius.lg, overflow: 'hidden' }, historyCard: { minHeight: 48, paddingHorizontal: Spacing.three, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border }, date: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 10 }, value: { color: palette.text, fontFamily: Fonts.metric, fontSize: 17, fontVariant: ['tabular-nums'] }, empty: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.7, textAlign: 'center', paddingVertical: Spacing.four } });

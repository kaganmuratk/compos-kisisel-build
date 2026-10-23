import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PaletteText as ThemedText, useNutritionPalette } from '@/components/nutrition-ui';
import { PeriodToggle } from '@/components/period-toggle';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedView } from '@/components/themed-view';
import { TimeSeriesChart } from '@/components/time-series-chart';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useCardioHistory } from '@/db/queries/cardio';
import { ACTIVITY_TYPE_LABELS, getActivityTypeLabel, type ActivityType } from '@/lib/activity-type';
import { formatShortDate } from '@/lib/date';
import { formatDuration } from '@/lib/geo';
import { buildPeriodBars, type BarPeriod } from '@/lib/period-bars';
import { useT } from '@/lib/i18n';

const ranges = [7, 30, 90, null] as const;
// 'day' only makes sense for the 7-day range — at 30/90/all it would only
// ever show its last 10 points (see buildPeriodBars' sliceCount) out of a
// much bigger window, silently hiding most of the selected range. See the
// same rule on the nutrition analysis screen.
const disabledPeriods = (range: number | null): BarPeriod[] => (range === 7 ? ['week', 'month'] : range === 30 ? ['day', 'month'] : ['day']);
const defaultPeriod = (range: number | null): BarPeriod => (range === 7 ? 'day' : range === 30 ? 'week' : 'month');
const weekdayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

export default function RunAnalysisScreen() {const palette=useNutritionPalette();const styles=useMemo(()=>createStyles(palette),[palette]);
  const { t, language } = useT();
  const { activity } = useLocalSearchParams<{ activity?: ActivityType }>();
  const { data: sessions = [] } = useCardioHistory();
  const [period, setPeriod] = useState<BarPeriod>('week');
  const [range, setRange] = useState<number | null>(30);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const activityType = activity ?? 'run';

  if (!activity)
    return (
      <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.page}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <ScreenHeader backHref="/analysis" eyebrow={t('movementType').toUpperCase()} title={t('activity').toUpperCase()} accentColor={palette.green} />
          <View style={styles.grid}>
            {(Object.keys(ACTIVITY_TYPE_LABELS) as ActivityType[]).map((type) => (
              <Pressable key={type} onPress={() => router.push({ pathname: '/analysis/run', params: { activity: type } })} style={styles.tile}>
                <ThemedText style={styles.activityName}>{getActivityTypeLabel(type, language).toUpperCase()}</ThemedText>
                <ThemedText style={styles.open}>{t('openAnalysis').toUpperCase()}</ThemedText>
              </Pressable>
            ))}
          </View>
        </SafeAreaView>
      </ThemedView>
    );

  const selected = sessions.filter((session) => (session.activityType ?? 'run') === activityType);
  const ranged = range == null ? selected : selected.slice(0, range);
  const avgDistanceKm = ranged.length ? ranged.reduce((sum, session) => sum + (session.distanceMeters ?? 0), 0) / 1000 / ranged.length : 0;
  const bars = buildPeriodBars(
    selected.map((session) => ({ date: session.date, value: (session.distanceMeters ?? 0) / 1000 })),
    period,
    'sum'
  );
  // 'day' shows the weekday (Pzt/Sal/…) instead of the date — with up to
  // 10 points on screen (see buildPeriodBars' sliceCount) that's the more
  // useful read at a glance; the tooltip still shows the full date via
  // `label`. Week/month have far fewer points and keep the fuller label.
  const axisLabelFor = (bar: { key: string; label: string }) => (period === 'day' ? t(weekdayKeys[new Date(`${bar.key}T00:00:00`).getDay()]) : bar.label);
  const data = bars.map((bar) => ({ value: bar.value, label: bar.label, axisLabel: axisLabelFor(bar), dateKey: bar.key }));
  const monthList = ranged
    .filter((session) => {
      const date = new Date(`${session.date}T00:00:00`);
      return date.getFullYear() === selectedMonth.getFullYear() && date.getMonth() === selectedMonth.getMonth();
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const years = new Set(selected.map((session) => session.date.slice(0, 4)));
  const changeRange = (nextRange: number | null) => {
    setRange(nextRange);
    if (disabledPeriods(nextRange).includes(period)) setPeriod(defaultPeriod(nextRange));
  };
  const changeMonth = (offset: number) => setSelectedMonth((value) => new Date(value.getFullYear(), value.getMonth() + offset, 1));
  const changeYear = (offset: number) => setSelectedMonth((value) => new Date(value.getFullYear() + offset, value.getMonth(), 1));
  const monthLabel = new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-US', { month: 'short' }).format(selectedMonth).toUpperCase();

  return (
    <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.page}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader backHref="/analysis/run" eyebrow={t('activity').toUpperCase()} title={getActivityTypeLabel(activityType, language).toUpperCase()} accentColor={palette.green} />
        <View style={styles.averageRow}>
          <ThemedText style={styles.averageLabel}>{t(range === 7 ? 'lastSevenDays' : range === 30 ? 'lastThirtyDays' : range === 90 ? 'lastNinetyDays' : 'allTime').toUpperCase()}</ThemedText>
          <ThemedText style={styles.averageValue}>
            {avgDistanceKm.toFixed(1)} <ThemedText style={styles.averageUnit}>km {t('perSession')}</ThemedText>
          </ThemedText>
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <TimeSeriesChart
            title={t('distance').toUpperCase()}
            unit="km"
            data={data}
            kind="speed"
            color={palette.green}
            surfaceColor={palette.card}
            borderColor={palette.border}
            footer={
              <View style={styles.chartFooter}>
                <View style={styles.chips}>
                  {ranges.map((item) => (
                    <Pressable key={String(item)} onPress={() => changeRange(item)} style={[styles.chip, range === item && styles.chipSelected]}>
                      <ThemedText style={[styles.chipText, range === item && styles.chipTextSelected]}>{item == null ? t('all').toUpperCase() : `${item}${t('daysAbbrev')}`}</ThemedText>
                    </Pressable>
                  ))}
                </View>
                <PeriodToggle value={period} onChange={setPeriod} hidden={disabledPeriods(range)} />
              </View>
            }
          />
          <View style={styles.historyDivider} />
          <ThemedText style={styles.historyHeading}>{t('historyByMonth').toUpperCase()}</ThemedText>
          <View style={styles.monthControls}>
            <Pressable accessibilityLabel="Previous month" onPress={() => changeMonth(-1)} hitSlop={10}>
              <ThemedText style={styles.monthArrow}>‹</ThemedText>
            </Pressable>
            <ThemedText style={styles.monthLabel}>
              {monthLabel} {selectedMonth.getFullYear()}
            </ThemedText>
            <Pressable accessibilityLabel="Next month" onPress={() => changeMonth(1)} hitSlop={10}>
              <ThemedText style={styles.monthArrow}>›</ThemedText>
            </Pressable>
            {years.size > 1 ? (
              <View style={styles.yearControls}>
                <Pressable accessibilityLabel="Previous year" onPress={() => changeYear(-1)} hitSlop={8}>
                  <ThemedText style={styles.yearArrow}>‹</ThemedText>
                </Pressable>
                <ThemedText style={styles.yearLabel}>{selectedMonth.getFullYear()}</ThemedText>
                <Pressable accessibilityLabel="Next year" onPress={() => changeYear(1)} hitSlop={8}>
                  <ThemedText style={styles.yearArrow}>›</ThemedText>
                </Pressable>
              </View>
            ) : null}
          </View>
          {monthList.length ? (
            <View style={styles.historyList}>
              {monthList.map((session) => (
                <View key={session.id} style={styles.historyCard}>
                  <ThemedText style={styles.date}>{formatShortDate(session.date)}</ThemedText>
                  <ThemedText style={styles.value}>
                    {((session.distanceMeters ?? 0) / 1000).toFixed(2)} km · {formatDuration(session.durationSeconds ?? 0)}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : (
            <ThemedText style={styles.empty}>{t('noEntriesThisMonth').toUpperCase()}</ThemedText>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}
const createStyles=(palette:ReturnType<typeof useNutritionPalette>)=>StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.background },
  safe: { flex: 1, paddingHorizontal: Spacing.three },
  content: { gap: Spacing.three, paddingBottom: Spacing.six },
  averageRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: Spacing.three, marginBottom: Spacing.two },
  averageLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 12, letterSpacing: 1 },
  averageValue: { color: palette.green, fontFamily: Fonts.metric, fontSize: 22, fontVariant: ['tabular-nums'] },
  averageUnit: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { width: '48%', minHeight: 150, justifyContent: 'space-between', padding: Spacing.three, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border },
  activityName: { color: palette.green, fontFamily: Fonts.metricMedium, fontSize: 21 },
  open: { color: palette.text, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.7 },
  chartFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', gap: Spacing.one },
  chip: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: Radius.sm },
  chipSelected: { backgroundColor: palette.blue },
  chipText: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 8 },
  chipTextSelected: { color: palette.background },
  historyDivider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginVertical: Spacing.one },
  historyHeading: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 },
  monthControls: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  monthArrow: { color: palette.green, fontFamily: Fonts.technical, fontSize: 20 },
  monthLabel: { color: palette.text, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 0.7 },
  yearControls: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  yearArrow: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 16 },
  yearLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9 },
  historyList: { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: Radius.lg, overflow: 'hidden' },
  historyCard: {
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  date: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 10 },
  value: { color: palette.text, fontFamily: Fonts.metric, fontSize: 15, fontVariant: ['tabular-nums'] },
  empty: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.7, textAlign: 'center', paddingVertical: Spacing.four },
});

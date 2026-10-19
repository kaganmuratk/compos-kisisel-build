import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNutritionPalette } from '@/components/nutrition-ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useHistoryDays, type DayEntry } from '@/db/queries/history-days';
import { dateStringFromDate, getTodayDateString } from '@/lib/date';
import { useT } from '@/lib/i18n';

type CalendarCell = { date: string; day: number } | null;

function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1); const leading = (first.getDay() + 6) % 7; const count = new Date(year, month + 1, 0).getDate();
  const cells: CalendarCell[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= count; day += 1) cells.push({ date: dateStringFromDate(new Date(year, month, day)), day });
  while (cells.length % 7) cells.push(null); return cells;
}

export default function HistoryScreen() {
  const { t, language } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const weekdayLabels = [t('monday'), t('tuesday'), t('wednesday'), t('thursday'), t('friday'), t('saturday'), t('sunday')];
  const days = useHistoryDays(); const today = getTodayDateString(); const [viewedYear, setViewedYear] = useState(() => new Date().getFullYear()); const [viewedMonth, setViewedMonth] = useState(() => new Date().getMonth());
  const daysByDate = useMemo(() => new Map(days.map((entry) => [entry.date, entry])), [days]);
  const weeks = useMemo(() => { const grid = buildMonthGrid(viewedYear, viewedMonth); return Array.from({ length: grid.length / 7 }, (_, i) => grid.slice(i * 7, i * 7 + 7)); }, [viewedYear, viewedMonth]);
  const monthEntries = useMemo(() => Array.from(daysByDate.values()).filter((entry) => { const value = new Date(`${entry.date}T12:00:00`); return value.getFullYear() === viewedYear && value.getMonth() === viewedMonth; }), [daysByDate, viewedMonth, viewedYear]);
  const workoutCount = monthEntries.reduce((sum, day) => sum + day.workouts.length, 0); const activityCount = monthEntries.reduce((sum, day) => sum + day.runs.length, 0);
  const moveMonth = (direction: -1 | 1) => { const next = new Date(viewedYear, viewedMonth + direction, 1); setViewedYear(next.getFullYear()); setViewedMonth(next.getMonth()); };
  return <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.page}><SafeAreaView style={styles.safeArea} edges={['top']}>
    <View style={styles.brandRow}><ThemedText style={styles.brand}>COMPOS</ThemedText><ThemedText style={styles.area}>{t('history').toUpperCase()}</ThemedText></View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.pageHeading}><ThemedText style={styles.eyebrow}>{t('yourRecord').toUpperCase()}</ThemedText><ThemedText style={styles.title}>{t('history').toUpperCase()}</ThemedText></View>
      <View style={styles.metricRow}><Metric styles={styles} palette={palette} value={String(monthEntries.length)} label={t('daysLogged').toUpperCase()} tone="blue" /><Metric styles={styles} palette={palette} value={String(workoutCount)} label={t('workouts').toUpperCase()} tone="green" /><Metric styles={styles} palette={palette} value={String(activityCount)} label={t('activities').toUpperCase()} tone="yellow" /></View>
      <View style={styles.calendarCard}>
        <View style={styles.monthNav}><Pressable accessibilityLabel="Previous month" onPress={() => moveMonth(-1)} style={[styles.navButton, { width: 44, height: 44 }]}><ThemedText style={styles.navSymbol}>&lt;</ThemedText></Pressable><ThemedText style={styles.monthLabel}>{new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-US', { month: 'long', year: 'numeric' }).format(new Date(viewedYear, viewedMonth, 1)).toUpperCase()}</ThemedText><Pressable accessibilityLabel="Next month" onPress={() => moveMonth(1)} style={[styles.navButton, { width: 44, height: 44 }]}><ThemedText style={styles.navSymbol}>&gt;</ThemedText></Pressable></View>
        <View style={styles.weekdayRow}>{weekdayLabels.map((label) => <ThemedText key={label} style={styles.weekday}>{label}</ThemedText>)}</View>
        <View style={styles.grid}>{weeks.map((week, index) => <View key={index} style={styles.weekRow}>{week.map((cell, cellIndex) => { if (!cell) return <View key={cellIndex} style={styles.dayCell} />; const entry = daysByDate.get(cell.date); const workout = (entry?.workouts.length ?? 0) > 0; const activity = (entry?.runs.length ?? 0) > 0; const isToday = cell.date === today; return <Pressable key={cellIndex} accessibilityLabel={`${cell.date}${entry ? ', has records' : ''}`} onPress={() => router.push({ pathname: '/history/day/[date]', params: { date: cell.date } })} style={[styles.dayCell, isToday && styles.todayCell]}><ThemedText style={[styles.dayNumber, isToday && styles.todayNumber]}>{cell.day}</ThemedText><View style={styles.dotRow}>{workout && <View style={[styles.dot, styles.workoutDot]} />}{activity && <View style={[styles.dot, styles.activityDot]} />}</View></Pressable>; })}</View>)}</View>
      </View>
      <View style={styles.legend}><LegendDot styles={styles} palette={palette} tone="green" label={t('workout').toUpperCase()} /><LegendDot styles={styles} palette={palette} tone="yellow" label={t('activity').toUpperCase()} /></View>
    </ScrollView>
  </SafeAreaView></ThemedView>;
}
function Metric({ styles, palette, value, label, tone }: { styles: ReturnType<typeof createStyles>; palette: ReturnType<typeof useNutritionPalette>; value: string; label: string; tone: 'blue' | 'green' | 'yellow' }) { return <View style={styles.metric}><ThemedText style={[styles.metricValue, { color: palette[tone] }]}>{value}</ThemedText><ThemedText style={styles.metricLabel}>{label}</ThemedText></View>; }
function LegendDot({ styles, palette, tone, label }: { styles: ReturnType<typeof createStyles>; palette: ReturnType<typeof useNutritionPalette>; tone: 'green' | 'yellow'; label: string }) { return <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: palette[tone] }]} /><ThemedText style={styles.legendLabel}>{label}</ThemedText></View>; }
function cardShadowFor(palette: ReturnType<typeof useNutritionPalette>) { return palette.background === '#FAFAF8' ? { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 } : {}; }
const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({ page: { flex: 1, backgroundColor: palette.background }, safeArea: { flex: 1, paddingHorizontal: Spacing.three }, brandRow: { height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: palette.border }, brand: { color: palette.text, fontFamily: Fonts.metric, fontSize: 18, letterSpacing: 2 }, area: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 8, letterSpacing: 1.2 }, content: { gap: Spacing.three, paddingBottom: Spacing.six }, pageHeading: { paddingVertical: Spacing.three }, eyebrow: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 }, title: { color: palette.text, fontFamily: Fonts.metric, fontSize: 38, lineHeight: 42 }, metricRow: { flexDirection: 'row', gap: Spacing.one }, metric: { ...cardShadowFor(palette), flex: 1, minHeight: 76, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: Spacing.two, justifyContent: 'space-between' }, metricValue: { fontFamily: Fonts.metric, fontSize: 30, lineHeight: 32 }, metricLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 7, letterSpacing: 0.5 }, calendarCard: { ...cardShadowFor(palette), backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: Spacing.two, gap: Spacing.one }, monthNav: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: palette.border }, navButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }, navSymbol: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 18 }, monthLabel: { color: palette.text, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 0.7 }, weekdayRow: { flexDirection: 'row', paddingTop: Spacing.one }, weekday: { flex: 1, color: palette.muted, fontFamily: Fonts.technical, fontSize: 7, textAlign: 'center' }, grid: { gap: Spacing.half }, weekRow: { flexDirection: 'row', gap: Spacing.half }, dayCell: { flex: 1, aspectRatio: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: 'transparent' }, todayCell: { borderColor: palette.blue, backgroundColor: withAlpha(palette.blue, 0.10) }, dayNumber: { color: palette.text, fontFamily: Fonts.metricMedium, fontSize: 18, lineHeight: 20 }, todayNumber: { color: palette.blue }, dotRow: { height: 4, flexDirection: 'row', gap: 2 }, dot: { width: 4, height: 4, borderRadius: 2 }, workoutDot: { backgroundColor: palette.green }, activityDot: { backgroundColor: palette.yellow }, foodDot: { backgroundColor: palette.red }, legend: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.three }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 }, legendLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 7, letterSpacing: 0.4 } });

function withAlpha(hex: string, alpha: number): string { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`; }

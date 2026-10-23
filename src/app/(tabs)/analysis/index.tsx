import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { PaletteText as ThemedText, cardShadowFor, useNutritionPalette } from '@/components/nutrition-ui';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useHistoryDays } from '@/db/queries/history-days';
import { useT } from '@/lib/i18n';

type InsightIconName = 'exercise' | 'nutrition' | 'activity' | 'body';

function InsightIcon({ name, color }: { name: InsightIconName; color: string }) {
  const common = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      {name === 'exercise' && <><Line x1={4} y1={9} x2={4} y2={15} {...common} /><Line x1={7} y1={7} x2={7} y2={17} {...common} /><Line x1={17} y1={7} x2={17} y2={17} {...common} /><Line x1={20} y1={9} x2={20} y2={15} {...common} /><Line x1={7} y1={12} x2={17} y2={12} {...common} /></>}
      {name === 'nutrition' && <><Path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M16 3v18M16 3c3 1 4 4 4 7h-4" {...common} /></>}
      {name === 'activity' && <Path d="M3 13h4l2-6 4 11 2-5h6" {...common} />}
      {name === 'body' && <><Circle cx={12} cy={6} r={3} {...common} /><Path d="M7 21v-4l2-5 3 2 3-2 2 5v4M9 12 7 9M15 12l2-3" {...common} /></>}
    </Svg>
  );
}

export default function AnalysisScreen() {
  const { t } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const cardShadow = cardShadowFor(palette);
  const sections: { key: string; label: string; description: string; icon: InsightIconName; href: Href; tone: 'blue' | 'yellow' | 'green' | 'red' }[] = [
    { key: 'exercises', label: t('exercises').toUpperCase(), description: t('setsMovementHistory').toUpperCase(), icon: 'exercise', href: '/analysis/exercises', tone: 'blue' },
    { key: 'nutrition', label: t('nutrition').toUpperCase(), description: t('dailyFoodTargets').toUpperCase(), icon: 'nutrition', href: '/analysis/nutrition', tone: 'yellow' },
    { key: 'activity', label: t('activity').toUpperCase(), description: t('activityDescription').toUpperCase(), icon: 'activity', href: '/analysis/run', tone: 'green' },
    { key: 'body', label: t('body').toUpperCase(), description: t('bodyDescription').toUpperCase(), icon: 'body', href: '/analysis/body', tone: 'red' },
  ];
  const historyDays = useHistoryDays();
  const [statsPeriod, setStatsPeriod] = useState<'week' | 'month'>('week');
  const periodDays = statsPeriod === 'week' ? 7 : 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (periodDays - 1));
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const withinPeriod = historyDays.filter((day) => day.date >= cutoffStr);
  const totals = [
    { label: t('workouts').toUpperCase(), value: withinPeriod.filter((day) => day.workouts.length > 0).length, tone: 'blue' as const },
    { label: t('activities').toUpperCase(), value: withinPeriod.filter((day) => day.runs.length > 0).length, tone: 'green' as const },
    { label: t('nutritionDays').toUpperCase(), value: withinPeriod.filter((day) => day.nutrition).length, tone: 'yellow' as const },
    { label: t('bodyCheckins').toUpperCase(), value: withinPeriod.filter((day) => day.checkin && day.checkin.weightKg != null && day.checkin.sleepHours != null && day.checkin.stressLevel != null).length, tone: 'red' as const },
  ];
  const maxTotal = Math.max(...totals.map((total) => total.value), periodDays);
  return (
    <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.page}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.brandRow}>
            <ThemedText style={styles.brand}>COMPOS</ThemedText>
            <ThemedText style={styles.area}>{t('insights').toUpperCase()}</ThemedText>
          </View>
          <View style={styles.pageHeading}>
            <ThemedText style={styles.eyebrow}>{t('yourProgress').toUpperCase()}</ThemedText>
            <ThemedText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.title}>{t('insights').toUpperCase()}</ThemedText>
          </View>
          <View style={styles.grid}>
            {sections.map((section) => (
              <Pressable
                key={section.key}
                accessibilityRole="button"
                accessibilityLabel={`Open ${section.label.toLowerCase()} insights`}
                onPress={() => router.push(section.href)}
                style={({ pressed }) => [styles.tile, cardShadow, pressed && styles.pressed]}>
                <View style={[styles.iconBox, { backgroundColor: `${palette[section.tone]}20` }]}>
                  <InsightIcon name={section.icon} color={palette[section.tone]} />
                </View>
                <View style={styles.tileCopy}>
                  <ThemedText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.tileTitle}>{section.label}</ThemedText>
                  <ThemedText style={styles.tileDescription}>{section.description}</ThemedText>
                </View>
              </Pressable>
            ))}
          </View>
          <View style={styles.progress}>
            <View style={styles.progressHeader}>
              <ThemedText style={styles.progressTitle}>{t('activeDays').toUpperCase()}</ThemedText>
              <View style={styles.periodToggle}>
                <Pressable onPress={() => setStatsPeriod('week')} style={[styles.periodChip, statsPeriod === 'week' && styles.periodChipSelected]}>
                  <ThemedText style={[styles.periodChipText, statsPeriod === 'week' && styles.periodChipTextSelected]}>{t('thisWeek').toUpperCase()}</ThemedText>
                </Pressable>
                <Pressable onPress={() => setStatsPeriod('month')} style={[styles.periodChip, statsPeriod === 'month' && styles.periodChipSelected]}>
                  <ThemedText style={[styles.periodChipText, statsPeriod === 'month' && styles.periodChipTextSelected]}>{t('thisMonth').toUpperCase()}</ThemedText>
                </Pressable>
              </View>
            </View>
            {totals.map((total) => <View key={total.label} style={styles.progressRow}><View style={styles.progressCopy}><ThemedText style={styles.progressLabel}>{total.label}</ThemedText><ThemedText style={[styles.progressValue, { color: palette[total.tone] }]}>{total.value} <ThemedText style={styles.progressUnit}>/ {periodDays} {t('daysUnit')}</ThemedText></ThemedText></View><View style={styles.barTrack}><View style={[styles.barFill, { backgroundColor: palette[total.tone], width: `${(total.value / maxTotal) * 100}%` }]} /></View></View>)}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.background },
  safeArea: { flex: 1, paddingHorizontal: Spacing.three },
  content: { paddingBottom: Spacing.six },
  brandRow: { height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: palette.border },
  brand: { color: palette.text, fontFamily: Fonts.metric, fontSize: 18, letterSpacing: 2 },
  area: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 8, letterSpacing: 1.2 },
  pageHeading: { paddingVertical: Spacing.three },
  eyebrow: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 },
  title: { color: palette.text, fontFamily: Fonts.metric, fontSize: 38, lineHeight: 42 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  // Top-aligned (not space-between): with space-between a tile whose
  // description wraps to more lines pushed its title down, so titles in the
  // same row sat at different heights at larger text sizes.
  tile: { width: '48%', minHeight: 160, justifyContent: 'flex-start', gap: Spacing.three, padding: Spacing.three, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border },
  iconBox: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  tileCopy: { gap: Spacing.one },
  tileTitle: { color: palette.text, fontFamily: Fonts.metricMedium, fontSize: 21, lineHeight: 24 },
  tileDescription: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 8, lineHeight: 13, letterSpacing: 0.45 },
  pressed: { opacity: 0.72 },
  progress: { minHeight: 220, marginTop: Spacing.four, paddingVertical: Spacing.three, gap: Spacing.three, borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.border },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressTitle: { color: palette.text, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 1 },
  periodToggle: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: Radius.sm, overflow: 'hidden' },
  periodChip: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, minHeight: 28, justifyContent: 'center' },
  periodChipSelected: { backgroundColor: palette.blue },
  periodChipText: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 8, letterSpacing: 0.5 },
  periodChipTextSelected: { color: palette.background },
  progressRow: { gap: Spacing.one },
  progressCopy: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  progressLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 0.7 },
  progressValue: { fontFamily: Fonts.metric, fontSize: 30, lineHeight: 32 },
  progressUnit: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 10 },
  barTrack: { height: 12, backgroundColor: palette.raised },
  barFill: { height: 12 },
});

import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PaletteText as ThemedText, cardShadowFor, useNutritionPalette } from '@/components/nutrition-ui';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useCheckinHistory, useWaterHistory } from '@/db/queries/daily';
import { useSettings } from '@/db/queries/settings';
import { useT } from '@/lib/i18n';
import { fromKg } from '@/lib/units';

export default function BodyAnalysisScreen() {
  const { t } = useT(); const palette = useNutritionPalette(); const styles = useMemo(() => createStyles(palette), [palette]); const cardShadow = cardShadowFor(palette);
  const { data: settings } = useSettings(); const unit = settings?.unit ?? 'kg'; const { data: checkins = [] } = useCheckinHistory(); const { data: waterDays = [] } = useWaterHistory();
  const latestWeight = checkins.find((checkin) => checkin.weightKg != null); const latestSleep = checkins.find((checkin) => checkin.sleepHours != null); const latestStress = checkins.find((checkin) => checkin.stressLevel != null); const latestWater = waterDays[0]; const noData = t('noData').toUpperCase();
  const latest: Record<string, string> = { weight: latestWeight ? `${fromKg(latestWeight.weightKg!, unit).toFixed(1)} ${unit.toUpperCase()}` : noData, sleep: latestSleep ? `${latestSleep.sleepHours!.toFixed(1)} ${t('hours').toLowerCase()}` : noData, stress: latestStress ? `${latestStress.stressLevel!} / 5` : noData, water: latestWater ? `${latestWater.total} ML` : noData };
  const metrics = [['weight', `${t('weight').toUpperCase()} (${unit.toUpperCase()})`], ['sleep', t('sleep').toUpperCase()], ['stress', t('stress').toUpperCase()], ['water', t('water').toUpperCase()]] as const;
  return <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.page}><SafeAreaView style={styles.safe} edges={['top']}><ScreenHeader eyebrow={t('bodySignals').toUpperCase()} title={t('body').toUpperCase()} accentColor={palette.red} backHref="/analysis" /><View style={styles.grid}>{metrics.map(([key, label]) => <Pressable key={key} onPress={() => router.push({ pathname: '/analysis/body/[metric]', params: { metric: key } })} style={[styles.tile, cardShadow]}><View><ThemedText style={styles.metric}>{label}</ThemedText><ThemedText style={styles.latestLabel}>{t('latest').toUpperCase()}</ThemedText><ThemedText style={styles.latestValue}>{latest[key]}</ThemedText></View><ThemedText style={styles.open}>{t('viewTrend').toUpperCase()}</ThemedText></Pressable>)}</View></SafeAreaView></ThemedView>;
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({ page: { flex: 1, backgroundColor: palette.background }, safe: { flex: 1, paddingHorizontal: Spacing.three }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }, tile: { width: '48%', minHeight: 145, padding: Spacing.three, justifyContent: 'space-between', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }, metric: { color: palette.red, fontFamily: Fonts.metricMedium, fontSize: 21 }, latestLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 7, letterSpacing: .6, marginTop: Spacing.two }, latestValue: { color: palette.text, fontFamily: Fonts.metric, fontSize: 20, marginTop: 2 }, open: { color: palette.text, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: .7 } });

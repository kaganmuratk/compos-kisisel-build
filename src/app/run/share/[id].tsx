import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { PaletteText as ThemedText, useNutritionPalette } from '@/components/nutrition-ui';
import { ScreenHeader } from '@/components/screen-header';
import { RunShareCard } from '@/components/run-share-card';
import { RunShareCardDetailed } from '@/components/run-share-card-detailed';
import { ShareModeToggle, type ShareMode } from '@/components/share-mode-toggle';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useCardioSession } from '@/db/queries/cardio';
import { formatDayMonth } from '@/lib/date';
import type { RoutePoint } from '@/lib/geo';
import { useT } from '@/lib/i18n';
import { shareOrDownloadImage } from '@/lib/share-image';
import { softSheet } from '@/constants/soft-sheet';

export default function RunShareScreen() {
  const { t } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { id: sessionId } = useLocalSearchParams<{ id: string }>(); const cardRef = useRef<View>(null); const [sharing, setSharing] = useState(false); const [mode, setMode] = useState<ShareMode>('summary'); const [backgroundImageUri, setBackgroundImageUri] = useState<string | null>(null);
  const { data: session } = useCardioSession(sessionId); const points: RoutePoint[] = session?.route ? JSON.parse(session.route) : []; const placeName = points.length === 1 ? (points[0] as unknown as { text?: string }).text : undefined; const routeShapePoints = session?.routeShapePoints ? JSON.parse(session.routeShapePoints) : undefined;
  const pickBackgroundPhoto = async () => { const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) return; const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, legacy: true }); if (!result.canceled && result.assets[0]) setBackgroundImageUri(result.assets[0].uri); };
  const share = async () => { if (!cardRef.current) return; setSharing(true); try { const uri = mode === 'summary' ? await captureRef(cardRef, { format: 'png', quality: 1, width: 1080, height: 1920 }) : await captureRef(cardRef, { format: 'png', quality: 1 }); await shareOrDownloadImage(uri, `compos-activity-${Date.now()}.png`, { mimeType: 'image/png', dialogTitle: `${t('share')} ${t('activity').toLowerCase()}` }); } catch (error) { console.warn('Activity share failed:', error); } finally { setSharing(false); } };
  if (!session) return null;
  return <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.page}><SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
    <ScreenHeader onBack={() => router.back()} eyebrow={t('activityRecap').toUpperCase()} title={t('share').toUpperCase()} accentColor={palette.green} trailing={<View style={styles.actions}><Pressable accessibilityLabel={backgroundImageUri ? t('changePhoto') : t('addPhoto')} onPress={pickBackgroundPhoto} style={styles.photoButton}><ThemedText style={styles.photoText}>{(backgroundImageUri ? t('changePhoto') : t('addPhoto')).toUpperCase()}</ThemedText></Pressable>{backgroundImageUri && <Pressable accessibilityLabel={t('removePhoto')} onPress={() => setBackgroundImageUri(null)} hitSlop={8}><ThemedText style={styles.remove}>×</ThemedText></Pressable>}</View>} />
    <ShareModeToggle mode={mode} onChange={setMode} />
    {mode === 'summary' ? <View style={styles.cardWrapper}><RunShareCard ref={cardRef} title={session.name || formatDayMonth(session.date)} distanceMeters={session.distanceMeters ?? 0} durationSeconds={session.durationSeconds ?? 0} points={points} placeName={placeName} routeShapePoints={routeShapePoints} elevationGainMeters={session.elevationGainMeters ?? undefined} avgHeartRate={session.avgHeartRate} caloriesBurned={session.caloriesBurned} backgroundImageUri={backgroundImageUri} /></View> : <ScrollView style={styles.scroll} contentContainerStyle={styles.detailed}><RunShareCardDetailed ref={cardRef} title={session.name || formatDayMonth(session.date)} distanceMeters={session.distanceMeters ?? 0} durationSeconds={session.durationSeconds ?? 0} elevationGainMeters={session.elevationGainMeters ?? undefined} avgHeartRate={session.avgHeartRate} maxHeartRate={session.maxHeartRate} caloriesBurned={session.caloriesBurned} vo2Max={session.vo2Max} oxygenSaturation={session.oxygenSaturation} heartRateVariability={session.heartRateVariability} respiratoryRate={session.respiratoryRate} avgCadence={session.avgCadence} maxCadence={session.maxCadence} runSeconds={session.runSeconds} walkSeconds={session.walkSeconds} stoppedSeconds={session.stoppedSeconds} notes={session.notes} /></ScrollView>}
    <Pressable onPress={share} disabled={sharing} style={[styles.shareButton, sharing && styles.disabled]}>{sharing ? <ActivityIndicator color={palette.background} /> : <ThemedText style={styles.shareText}>{t('shareImage').toUpperCase()}</ThemedText>}</Pressable>
  </SafeAreaView></ThemedView>;
}
const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => softSheet({ page: { flex: 1, backgroundColor: palette.background }, safeArea: { flex: 1, paddingHorizontal: Spacing.three, gap: Spacing.three }, actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one }, photoButton: { minHeight: 30, justifyContent: 'center', paddingHorizontal: Spacing.two, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }, photoText: { color: palette.text, fontFamily: Fonts.technical, fontSize: 8, letterSpacing: 0.5 }, remove: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 22 }, cardWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center' }, scroll: { flex: 1 }, detailed: { alignItems: 'center', paddingVertical: Spacing.three }, shareButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.three, backgroundColor: palette.green }, shareText: { color: palette.background, fontFamily: Fonts.bold, fontSize: 13, letterSpacing: 0.7 }, disabled: { opacity: 0.6 } });

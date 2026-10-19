import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { NutritionPage, PaletteText as ThemedText, TrashIcon, useNutritionPalette } from '@/components/nutrition-ui';
import { WEB_CONTENT_MAX_WIDTH } from '@/components/themed-view';
import type { ShareMode } from '@/components/share-mode-toggle';
import { WorkoutShareCard, SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from '@/components/workout-share-card';
import { WorkoutShareCardDetailed } from '@/components/workout-share-card-detailed';
import { Fonts, Spacing } from '@/constants/theme';
import { useSession, useSessionExercises } from '@/db/queries/workout';
import { useSettings } from '@/db/queries/settings';
import { formatShortDate } from '@/lib/date';
import { formatDuration } from '@/lib/geo';
import { useT } from '@/lib/i18n';
import { shareOrDownloadImage } from '@/lib/share-image';
import { fromKg } from '@/lib/units';

export default function WorkoutShareScreen() {
  const { t } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { width: rawWindowWidth, height: windowHeight } = useWindowDimensions();
  // On web every screen's root ThemedView caps content at
  // WEB_CONTENT_MAX_WIDTH and centers it — useWindowDimensions() still
  // reports the full (much wider) browser window. Same fix as Nutrition/
  // Day share's preview scaling.
  const windowWidth = Math.min(rawWindowWidth, WEB_CONTENT_MAX_WIDTH);
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [mode, setMode] = useState<ShareMode>('summary');
  const [backgroundUri, setBackgroundUri] = useState<string | null>(null);
  const [textTheme, setTextTheme] = useState<'light' | 'dark'>('light');
  const { data: session } = useSession(sessionId);
  const { data: exerciseLogsList = [] } = useSessionExercises(sessionId);
  const { data: settings } = useSettings();
  const unit = settings?.unit ?? 'kg';
  const repMetric = settings?.repMetric ?? 'rir';
  const durationSeconds = session?.finishedAt
    ? Math.max(0, Math.round((new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 1000))
    : 0;
  const detailedExercises = exerciseLogsList.map((log) => ({
    name: log.exercise.name,
    setLabels: log.sets.map((set) => {
      const weight = log.exercise.weightMode === 'pin' ? `${set.weight ?? '–'} PIN` : `${set.weight != null ? fromKg(set.weight, unit) : '–'} ${unit}`;
      const effort = repMetric === 'rir' ? set.rir : set.rpe;
      return `${set.setNumber}. ${weight} × ${set.reps ?? '–'}${set.side ? ` · ${set.side.toUpperCase()}` : ''}${effort != null ? ` · ${repMetric.toUpperCase()} ${effort}` : ''}`;
    }),
  }));

  // Same fit-both-dimensions scaling as Nutrition/Day share — the poster is
  // a fixed 9:16 shape and the preview sits in a non-scrolling View.
  const availableHeight = Math.max(260, windowHeight - 320);
  const widthScale = (windowWidth - 48) / SHARE_CARD_WIDTH;
  const heightScale = availableHeight / SHARE_CARD_HEIGHT;
  const previewScale = Math.max(0.32, Math.min(1, widthScale, heightScale));

  const pickBackground = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, legacy: true });
    if (!result.canceled && result.assets[0]) {
      setBackgroundUri(result.assets[0].uri);
    }
  };

  // Reset to light text too — dark text with no photo means dark text on
  // the card's own dark fallback gradient, i.e. invisible.
  const removeBackground = () => {
    setBackgroundUri(null);
    setTextTheme('light');
  };

  const share = async () => {
    if (!cardRef.current) return;
    setSharing(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT });
      await shareOrDownloadImage(uri, `compos-workout-${Date.now()}.png`, {
        mimeType: 'image/png',
        dialogTitle: `${t('share')} ${t('workout').toLowerCase()}`,
      });
    } catch (error) {
      console.warn('Workout share failed:', error);
    } finally {
      setSharing(false);
    }
  };

  if (!session) return null;

  const title = session.name || formatShortDate(session.date);
  const totalSets = exerciseLogsList.reduce((sum, log) => sum + log.sets.length, 0);

  return (
    <NutritionPage title={t('share')} backColor={palette.blue}>
      <View style={styles.modeRow}>
        {(['summary', 'detailed'] as const).map((value) => {
          const selected = mode === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setMode(value)}
              style={[styles.modeButton, selected && styles.modeButtonSelected]}>
              <ThemedText style={[styles.modeLabel, selected && styles.modeLabelSelected]}>
                {value === 'summary' ? t('summary').toUpperCase() : t('detailed').toUpperCase()}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {backgroundUri ? (
        <View style={styles.iconRow}>
          <Pressable onPress={pickBackground} accessibilityLabel={t('changeBackgroundPhoto')} style={styles.iconButton}>
            <ThemedText style={styles.iconGlyph}>↻</ThemedText>
          </Pressable>
          <Pressable onPress={removeBackground} accessibilityLabel={t('removeBackground')} style={styles.iconButton}>
            <TrashIcon size={16} color={palette.red} />
          </Pressable>
          <View style={styles.iconDivider} />
          {(['light', 'dark'] as const).map((value) => {
            const selected = textTheme === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={value === 'light' ? 'Light text theme' : 'Dark text theme'}
                onPress={() => setTextTheme(value)}
                style={[styles.swatch, value === 'light' ? styles.swatchLight : styles.swatchDark, selected && styles.swatchSelected]}
              />
            );
          })}
        </View>
      ) : (
        <Pressable onPress={pickBackground} style={styles.backgroundButton}>
          <ThemedText style={styles.backgroundButtonLabel}>{t('addBackgroundPhoto').toUpperCase()}</ThemedText>
        </Pressable>
      )}

      <View style={styles.cardWrapper}>
        <View style={{ width: SHARE_CARD_WIDTH * previewScale, height: SHARE_CARD_HEIGHT * previewScale }}>
          <View style={{ width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT, transform: [{ scale: previewScale }], transformOrigin: 'top left' }}>
            {mode === 'summary' ? (
              <WorkoutShareCard
                ref={cardRef}
                title={title}
                durationLabel={formatDuration(durationSeconds)}
                exerciseNames={exerciseLogsList.map((log) => log.exercise.name)}
                totalSets={totalSets}
                backgroundUri={backgroundUri}
                textTheme={textTheme}
              />
            ) : (
              <WorkoutShareCardDetailed
                ref={cardRef}
                title={title}
                durationLabel={formatDuration(durationSeconds)}
                totalSets={totalSets}
                exercises={detailedExercises}
                backgroundUri={backgroundUri}
                textTheme={textTheme}
              />
            )}
          </View>
        </View>
      </View>

      <Pressable onPress={share} disabled={sharing} style={[styles.shareButton, sharing && styles.shareButtonDisabled]}>
        {sharing ? <ActivityIndicator color={palette.background} /> : <ThemedText style={styles.shareButtonLabel}>{t('shareImage').toUpperCase()}</ThemedText>}
      </Pressable>
    </NutritionPage>
  );
}

// swatchLight/swatchDark stay fixed white/near-black regardless of app
// theme — they're the card's own text-theme picker (light text vs dark
// text over the poster's background photo), not the app's light/dark mode.
const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({
  modeRow: { flexDirection: 'row', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 3, marginTop: Spacing.two },
  modeButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  modeButtonSelected: { backgroundColor: palette.blue },
  modeLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 },
  modeLabelSelected: { color: palette.background },
  cardWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backgroundButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, marginTop: Spacing.two },
  backgroundButtonLabel: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 1 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, marginTop: Spacing.two },
  iconButton: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, alignItems: 'center', justifyContent: 'center' },
  iconGlyph: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 15 },
  iconDivider: { width: 1, height: 20, backgroundColor: palette.border, marginHorizontal: Spacing.half },
  swatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: palette.border },
  swatchLight: { backgroundColor: '#FFFFFF' },
  swatchDark: { backgroundColor: '#14141A' },
  swatchSelected: { borderWidth: 2, borderColor: palette.blue },
  shareButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.blue, marginTop: Spacing.two },
  shareButtonDisabled: { opacity: 0.6 },
  shareButtonLabel: { color: palette.background, fontFamily: Fonts.technical, fontSize: 11, letterSpacing: 1 },
});

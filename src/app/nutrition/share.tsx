import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { NutritionPage, PaletteText as ThemedText, TrashIcon, useNutritionPalette } from '@/components/nutrition-ui';
import { NutritionShareCard, SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from '@/components/nutrition-share-card';
import { WEB_CONTENT_MAX_WIDTH } from '@/components/themed-view';
import { NutritionShareCardDetailed } from '@/components/nutrition-share-card-detailed';
import type { ShareMode } from '@/components/share-mode-toggle';
import { Fonts, Spacing } from '@/constants/theme';
import { useMealCategories } from '@/db/queries/meal-categories';
import { useNutritionLogsForDate } from '@/db/queries/nutrition';
import { formatDayMonth, getTodayDateString } from '@/lib/date';
import { useT } from '@/lib/i18n';
import { macrosFor, summarizeNutritionLogs } from '@/lib/nutrition';
import { shareOrDownloadImage } from '@/lib/share-image';

export default function NutritionShareScreen() {
  const { t } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const date = dateParam ?? getTodayDateString();
  const { width: rawWindowWidth, height: windowHeight } = useWindowDimensions();
  // On web every screen's root ThemedView caps content at
  // WEB_CONTENT_MAX_WIDTH and centers it — useWindowDimensions() still
  // reports the full (much wider) browser window. A scale computed from
  // the raw width barely shrank the card on a normal desktop-width tab,
  // so it rendered wider than the actual (narrower) content column and
  // got clipped on the left by that column's own bounds — read as
  // "zoomed"/cut off, worse the wider the browser window was.
  const windowWidth = Math.min(rawWindowWidth, WEB_CONTENT_MAX_WIDTH);
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [mode, setMode] = useState<ShareMode>('summary');
  const [backgroundUri, setBackgroundUri] = useState<string | null>(null);
  const [textTheme, setTextTheme] = useState<'light' | 'dark'>('light');
  const { data: logs = [] } = useNutritionLogsForDate(date);
  const { data: categories = [] } = useMealCategories();
  const { totals } = summarizeNutritionLogs(logs);
  const meals = categories
    .map((category) => ({
      label: category.label,
      items: logs
        .filter((log) => log.mealType === category.id)
        .map((log) => ({ name: log.foodName, amountGrams: log.amountGrams, kcal: macrosFor(log, log.amountGrams).kcal })),
    }))
    .filter((meal) => meal.items.length > 0);
  // Scaled to fit BOTH dimensions, not just width — the poster card is a
  // fixed 9:16 shape, so on a wide/short window a width-only scale left it
  // taller than the visible preview area. The preview sits in a plain
  // (non-scrolling) View sized to exactly this budget — no ScrollView here
  // on purpose, the card must always fit without scrolling — so
  // windowHeight minus a flat estimate for the header/mode row/photo
  // controls/share button above and below it is what's actually left.
  const availableHeight = Math.max(260, windowHeight - 320);
  const widthScale = (windowWidth - 48) / SHARE_CARD_WIDTH;
  const heightScale = availableHeight / SHARE_CARD_HEIGHT;
  const previewScale = Math.max(0.32, Math.min(1, widthScale, heightScale));
  // Detailed shares the exact same fixed 1080x1920 canvas as Summary — same
  // Instagram Story shape, not a content-driven short rectangle — so it
  // reuses previewScale/SHARE_CARD_HEIGHT rather than its own estimate.
  const detailedHeight = SHARE_CARD_HEIGHT;

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
      const uri = mode === 'summary'
        ? await captureRef(cardRef, { format: 'png', quality: 1, width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT })
        : await captureRef(cardRef, { format: 'png', quality: 1, width: SHARE_CARD_WIDTH, height: detailedHeight });
      await shareOrDownloadImage(uri, `compos-nutrition-${Date.now()}.png`, {
        mimeType: 'image/png',
        dialogTitle: 'Share Nutrition',
      });
    } catch (error) {
      console.warn('Nutrition share failed:', error);
    } finally {
      setSharing(false);
    }
  };

  return (
    <NutritionPage title={t('share')} backColor={palette.yellow}>
      <View style={styles.modeRow}>
        {(['summary', 'detailed'] as const).map((value) => {
          const selected = mode === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={value === 'summary' ? 'Summary share format' : 'Detailed share format'}
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
        // The photo already shows on the card itself right below — a
        // second small thumbnail up here plus full-width "change"/"remove"
        // text buttons and another full-width light/dark row was three
        // rows of competing UI. Small icon-only controls: change (↻),
        // remove (trash), and two tiny light/dark swatches, all in one row.
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

      {/* Plain (non-scrolling) View sized to availableHeight — the card is
          always scaled to fit inside it, so the screen never needs
          scrolling to see what you're about to share. */}
      <View style={styles.cardWrapper}>
        {mode === 'summary' ? (
          <View style={{ width: SHARE_CARD_WIDTH * previewScale, height: SHARE_CARD_HEIGHT * previewScale }}>
            {/* The transformed wrapper needs its OWN explicit native (pre-
                scale) width/height — left to size itself from content, it
                measured smaller than that content and clipped/misplaced it. */}
            <View style={{ width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT, transform: [{ scale: previewScale }], transformOrigin: 'top left' }}>
              <NutritionShareCard ref={cardRef} title={formatDayMonth(date)} backgroundUri={backgroundUri} textTheme={textTheme} {...totals} />
            </View>
          </View>
        ) : (
          <View style={{ width: SHARE_CARD_WIDTH * previewScale, height: detailedHeight * previewScale }}>
            <View style={{ width: SHARE_CARD_WIDTH, height: detailedHeight, transform: [{ scale: previewScale }], transformOrigin: 'top left' }}>
              <NutritionShareCardDetailed ref={cardRef} title={formatDayMonth(date)} backgroundUri={backgroundUri} textTheme={textTheme} {...totals} meals={meals} />
            </View>
          </View>
        )}
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
  modeButtonSelected: { backgroundColor: palette.yellow },
  modeLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 },
  modeLabelSelected: { color: palette.background },
  cardWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backgroundButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, marginTop: Spacing.two },
  backgroundButtonLabel: { color: palette.yellow, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 1 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, marginTop: Spacing.two },
  iconButton: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, alignItems: 'center', justifyContent: 'center' },
  iconGlyph: { color: palette.yellow, fontFamily: Fonts.technical, fontSize: 15 },
  iconDivider: { width: 1, height: 20, backgroundColor: palette.border, marginHorizontal: Spacing.half },
  swatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: palette.border },
  swatchLight: { backgroundColor: '#FFFFFF' },
  swatchDark: { backgroundColor: '#14141A' },
  swatchSelected: { borderWidth: 2, borderColor: palette.yellow },
  shareButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.yellow, marginTop: Spacing.two },
  shareButtonDisabled: { opacity: 0.6 },
  shareButtonLabel: { color: palette.background, fontFamily: Fonts.technical, fontSize: 11, letterSpacing: 1 },
});

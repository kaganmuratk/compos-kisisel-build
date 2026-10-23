import { router } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useNutritionPalette } from '@/components/nutrition-ui';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useT } from '@/lib/i18n';

// Shared header for every screen that ISN'T one of the app's 5 tab roots
// (Today/Nutrition/History/Insights/Settings — those alone show the COMPOS
// wordmark strip, each with their own local brandRow). Every drill-down and
// modal screen instead starts directly with this: a back button + eyebrow/
// title, no repeated branding chrome. Standard mobile nav pattern (iOS large
// title only at stack root, compact back+title once you push) — the COMPOS
// strip used to reappear on every sub-screen with inconsistent styling,
// which read as broken rather than as navigation chrome (2026-09-06).
// Also replaces the old separate ModalTopBar/ModalHeading pair: once neither
// showed a brand row, a modal's header and a pushed screen's header became
// the same shape, so they're one component now.
export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  accentColor,
  backHref,
  onBack,
  trailing,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  accentColor: string;
  backHref?: string;
  onBack?: () => void;
  trailing?: ReactNode;
}) {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.heading}>
      <BackButton color={accentColor} onPress={onBack ?? (() => router.dismissTo(backHref as never))} />
      <View style={styles.headingCopy}>
        <ThemedText style={[styles.eyebrow, { color: accentColor }]}>{eyebrow}</ThemedText>
        <ThemedText style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {title}
        </ThemedText>
        {subtitle ? <ThemedText style={styles.subtitle}>{subtitle}</ThemedText> : null}
      </View>
      {trailing}
    </View>
  );
}

// The app's one back button — every screen's ‹ comes from here, so it's the
// same glyph, size, color and touch area everywhere (2026-10-20: the day
// view's back arrow was visibly bigger than other screens'). The glyph is an
// icon, not text, so it doesn't follow the OS text size either.
export function BackButton({ onPress, color }: { onPress: () => void; color?: string }) {
  const { t } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable accessibilityLabel={t('back')} onPress={onPress} hitSlop={12} style={styles.back}>
      <ThemedText allowFontScaling={false} style={[styles.backSymbol, { color: color ?? palette.blue }]}>‹</ThemedText>
    </Pressable>
  );
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.three },
  back: { width: 28, height: 44, justifyContent: 'center' },
  backSymbol: { fontFamily: Fonts.technical, fontSize: 22 },
  headingCopy: { flex: 1 },
  eyebrow: { fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 },
  title: { color: palette.text, fontFamily: Fonts.metric, fontSize: 34, lineHeight: 39 },
  subtitle: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.7, marginTop: Spacing.one },
});

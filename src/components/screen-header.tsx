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
  const { t } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.heading}>
      <Pressable
        accessibilityLabel={t('back')}
        onPress={onBack ?? (() => router.push(backHref as never))}
        hitSlop={12}
        style={styles.back}>
        <ThemedText style={[styles.backSymbol, { color: accentColor }]}>‹</ThemedText>
      </Pressable>
      <View style={styles.headingCopy}>
        <ThemedText style={[styles.eyebrow, { color: accentColor }]}>{eyebrow}</ThemedText>
        <ThemedText style={styles.title} numberOfLines={1}>
          {title}
        </ThemedText>
        {subtitle ? <ThemedText style={styles.subtitle}>{subtitle}</ThemedText> : null}
      </View>
      {trailing}
    </View>
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

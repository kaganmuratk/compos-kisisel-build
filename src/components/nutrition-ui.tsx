import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { ThemedText, type ThemedTextProps } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, isSoftDesign, Spacing } from '@/constants/theme';
import { useSettings } from '@/db/queries/settings';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { softSheet } from '@/constants/soft-sheet';

export const nutritionPaletteDark = {
  background: '#0E0E12',
  card: '#15151C',
  raised: '#1B1B23',
  border: '#292934',
  text: '#F4F4F6',
  muted: '#8D8D99',
  blue: '#3D8DFF',
  green: '#2DD4A0',
  red: '#FF625C',
  yellow: '#F5C84C',
  // Soft design: surfaces a half-step lifter, the hairline quieter (rounded
  // cards read as separate without it) and the blue a touch calmer.
  ...(isSoftDesign ? { card: '#17171E', raised: '#1F1F28', border: '#24242E', blue: '#5B9BFF' } : {}),
};

// Every value here is nutritionPaletteDark's own hue/saturation with only
// lightness lowered (HSL, L reduced — hue/S untouched) for contrast against
// a light background, not an independently-picked shade — this is what
// keeps it reading as "the same palette, relit" rather than a different
// app in light mode. `muted` is a deliberate exception: it's used for small
// all-caps section labels (not de-emphasized metadata) that read as washed
// out at any true "muted gray", so it's nearly as dark as `text`. `border`
// is picked to clear the ~3:1 WCAG contrast a UI border needs against
// `background` — a first pass here measured under 3:1 and read as a
// barely-there hairline. See src/app/(tabs)/index.tsx's todayThemeLight for
// the pilot this was validated on first.
export const nutritionPaletteLight = {
  // v2 (2026-09-13, user-picked from a 3-way A/B/C comparison mockup, first
  // applied to Today then approved for rollout): white cards on a soft
  // warm-gray canvas, separated by cardShadowFor's shadow rather than a
  // strong border — a "paper on paper" look instead of v1's all-beige
  // card+background pairing, which read as flat/muddy despite the color
  // step. `border` is deliberately light now that shadow carries the
  // separation.
  background: '#F1F0ED',
  card: '#FFFFFF',
  raised: '#F6F5F2',
  border: '#DEDBD3',
  text: '#14171A',
  muted: '#1C1E21',
  blue: '#0061EB',
  green: '#1D906C',
  red: '#F50900',
  yellow: '#AE820A',
  ...(isSoftDesign ? { background: '#F2F1EE', raised: '#F7F6F3', border: '#E8E5DE', blue: '#1F66E5' } : {}),
};

// Back-compat default for screens not yet migrated to useNutritionPalette()
// — always dark, same as before this pair existed.
export const nutritionPalette = nutritionPaletteDark;

// Settings' theme picker can't call Appearance.setColorScheme on web (see
// that screen's comment on this) — react-native-web's useColorScheme only
// ever reflects the OS/browser prefers-color-scheme, never the in-app
// choice. Reading settings.themeMode directly here is what makes "Açık"
// actually take effect on web; on native, Appearance.setColorScheme already
// updates what useColorScheme() itself reports, so this is just a superset.
export function useNutritionPalette() {
  const nativeScheme = useColorScheme();
  const { data: settings } = useSettings();
  const mode = settings?.themeMode;
  const resolved = mode === 'light' || mode === 'dark' ? mode : nativeScheme === 'dark' ? 'dark' : 'light';
  return resolved === 'dark' ? nutritionPaletteDark : nutritionPaletteLight;
}

export function cardShadowFor(palette: ReturnType<typeof useNutritionPalette>) {
  return palette === nutritionPaletteLight
    ? { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 }
    : {};
}

// The plain `<ThemedText>` (src/components/themed-text.tsx) resolves its
// color from `useTheme()`, which on web only ever follows the OS/browser
// color scheme — not settings.themeMode — so a screen that switched its
// backgrounds to `useNutritionPalette()` but kept using plain `<ThemedText>`
// (or its `themeColor` prop) for foreground color ends up with light text on
// a light background, or dark-on-dark, whenever the in-app choice and the
// OS/browser scheme disagree. Any screen using useNutritionPalette() should
// import ThemedText from here instead of '@/components/themed-text' — same
// props, but color comes from the resolved palette.
export function PaletteText({ style, type, themeColor, ...props }: ThemedTextProps) {
  const palette = useNutritionPalette();
  const color = type === 'linkPrimary'
    ? palette.blue
    : themeColor === 'textSecondary'
    ? palette.muted
    : themeColor === 'accent'
      ? palette.blue
      : themeColor === 'destructive'
        ? palette.red
        : themeColor === 'accentOn'
          ? palette.background
          : themeColor === 'border'
            ? palette.border
            : palette.text;
  return <ThemedText {...props} type={type} style={[{ color }, style]} />;
}

export function NutritionPage({
  title,
  subtitle,
  children,
  right,
  back = true,
  onBack,
  backColor,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  right?: ReactNode;
  back?: boolean;
  onBack?: () => void;
  /** Overrides the back chevron's color (defaults to palette.blue) —
   * share-flow screens use palette.yellow to match their own poster card's
   * accent instead of the app's general blue. */
  backColor?: string;
}) {
  const ui = useSharedUiStyles();
  return (
    <ThemedView style={ui.page}>
      <SafeAreaView style={ui.safeArea} edges={['top', 'bottom']}>
        <View style={ui.header}>
          {back ? <NutritionBackButton onPress={onBack ?? (() => router.back())} color={backColor} /> : null}
          <View style={ui.headerCopy}>
            <ThemedText style={ui.title}>{title}</ThemedText>
            {subtitle ? <ThemedText style={ui.subtitle}>{subtitle}</ThemedText> : null}
          </View>
          {right ? <View style={ui.headerRight}>{right}</View> : null}
        </View>
        <View style={ui.body}>{children}</View>
      </SafeAreaView>
    </ThemedView>
  );
}

export function NutritionBackButton({ onPress, color }: { onPress: () => void; color?: string }) {
  const ui = useSharedUiStyles();
  return (
    <Pressable accessibilityLabel="Back" onPress={onPress} hitSlop={12} style={ui.backButton}>
      {/* Same glyph/size as screen-header.tsx's BackButton (icon: no OS text scaling). */}
      <ThemedText allowFontScaling={false} style={[ui.backSymbol, color ? { color } : null]}>‹</ThemedText>
    </Pressable>
  );
}

// Small trash-can icon for compact "remove" controls (share-flow background
// photo removal) — SVG rather than an icon font glyph, same reasoning as the
// rest of the app's icons: font-glyph icon boxes have misrendered before.
// No default `color` param anymore — it used to default to the (always-dark)
// nutritionPalette.red, which stayed dark-red even in light mode; callers
// that want the palette's red now pass `useNutritionPalette().red` explicitly.
export function TrashIcon({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Disclosure chevron for collapsible sections — SVG for the same reason as
// TrashIcon above.
export function ChevronIcon({ size = 16, color, direction = 'down' }: { size?: number; color: string; direction?: 'up' | 'down' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={direction === 'down' ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// "Create new X" action for a list screen's header — matches Training's
// hand-rolled 44×44 "+" square (src/app/(tabs)/training/index.tsx) so every
// "add a new item" affordance in the app looks the same, instead of some
// screens using a text button ("+ NEW PLAN") and others an icon.
export function NutritionIconButton({ onPress, accessibilityLabel, symbol = '+' }: { onPress: () => void; accessibilityLabel: string; symbol?: string }) {
  const ui = useSharedUiStyles();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} hitSlop={8} style={ui.iconButton}>
      <ThemedText style={ui.iconButtonSymbol}>{symbol}</ThemedText>
    </Pressable>
  );
}

export function NutritionTextButton({
  label,
  onPress,
  tone = 'default',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  tone?: 'default' | 'accent' | 'danger';
  disabled?: boolean;
}) {
  const palette = useNutritionPalette();
  const ui = useSharedUiStyles();
  const color = tone === 'accent' ? palette.blue : tone === 'danger' ? palette.red : palette.text;
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[ui.textButton, disabled && ui.disabled]}>
      <ThemedText style={[ui.textButtonLabel, { color }]}>{label}</ThemedText>
    </Pressable>
  );
}

export function NutritionPrimaryButton({
  label,
  onPress,
  disabled = false,
  pending = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  pending?: boolean;
}) {
  const ui = useSharedUiStyles();
  return (
    <Pressable disabled={disabled || pending} onPress={onPress} style={[ui.primaryButton, (disabled || pending) && ui.disabled]}>
      <ThemedText style={ui.primaryButtonLabel}>{pending ? 'WORKING…' : label}</ThemedText>
    </Pressable>
  );
}

export function NutritionEmpty({ children }: { children: ReactNode }) {
  const ui = useSharedUiStyles();
  return (
    <View style={ui.empty}>
      <ThemedText style={ui.emptyText}>{children}</ThemedText>
    </View>
  );
}

// Every screen that used to do `import { nutritionUi } from '...'` (a static,
// dark-only StyleSheet) now calls this hook instead — same shape, but built
// fresh from the current palette so it actually changes in light mode.
export function useNutritionUi() {
  const palette = useNutritionPalette();
  return useMemo(() => createNutritionUi(palette), [palette]);
}

function useSharedUiStyles() {
  const palette = useNutritionPalette();
  return useMemo(() => createUi(palette), [palette]);
}

const createNutritionUi = (palette: ReturnType<typeof useNutritionPalette>) => {
  const cardShadow = cardShadowFor(palette);
  return softSheet({
    card: {
      ...cardShadow,
      backgroundColor: palette.card,
      borderWidth: 1,
      borderColor: palette.border,
      padding: Spacing.three,
      gap: Spacing.two,
    },
    raisedCard: {
      ...cardShadow,
      backgroundColor: palette.raised,
      borderWidth: 1,
      borderColor: palette.border,
      padding: Spacing.three,
      gap: Spacing.two,
    },
    input: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.raised,
      color: palette.text,
      paddingHorizontal: Spacing.three,
      fontFamily: Fonts.medium,
      fontSize: 15,
    },
    technicalLabel: {
      color: palette.muted,
      fontFamily: Fonts.technical,
      fontSize: 9,
      lineHeight: 13,
      letterSpacing: 1.1,
    },
    bodyText: {
      color: palette.text,
      fontFamily: Fonts.medium,
      fontSize: 14,
      lineHeight: 19,
    },
    mutedText: {
      color: palette.muted,
      fontFamily: Fonts.technical,
      fontSize: 10,
      lineHeight: 15,
    },
    listContent: {
      gap: Spacing.two,
      paddingBottom: Spacing.six,
    },
  });
};

const createUi = (palette: ReturnType<typeof useNutritionPalette>) =>
  softSheet({
    page: { flex: 1, backgroundColor: palette.background },
    safeArea: { flex: 1, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
    header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.border, gap: Spacing.two },
    backButton: { width: 28, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
    backSymbol: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 22 },
    headerCopy: { flex: 1, gap: 1 },
    title: { color: palette.text, fontFamily: Fonts.metric, fontSize: 24, lineHeight: 27, letterSpacing: 0.3 },
    subtitle: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 8, lineHeight: 12, letterSpacing: 0.7 },
    headerRight: { alignItems: 'flex-end' },
    body: { flex: 1, paddingTop: Spacing.three },
    textButton: { minHeight: 44, paddingHorizontal: Spacing.two, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card },
    textButtonLabel: { fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.8 },
    iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border },
    iconButtonSymbol: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 24, lineHeight: 28 },
    primaryButton: { minHeight: 48, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.three },
    primaryButtonLabel: { color: palette.background, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 1.1 },
    disabled: { opacity: 0.45 },
    empty: { borderWidth: 1, borderStyle: 'dashed', borderColor: palette.border, padding: Spacing.four, alignItems: 'center', justifyContent: 'center' },
    emptyText: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  });

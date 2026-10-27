/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

import { readDesignVariant } from '@/constants/design-variant-storage';

// Two looks, picked in Settings → Görünüm → Tasarım and applied on the next
// app start: 'soft' (General Sans, rounded corners, softer surfaces — the
// default since 2026-10-27) and 'classic' (the original condensed/mono,
// square-cornered look, kept intact so it can be switched back to any time).
export type DesignVariant = 'soft' | 'classic';
export const designVariant: DesignVariant = readDesignVariant() === 'classic' ? 'classic' : 'soft';
export const isSoftDesign = designVariant === 'soft';

// Warm-neutral graphite + a single warm bronze/amber accent — see DESIGN.md for rationale.
export const Colors = {
  light: {
    text: '#14171A',
    background: '#FAFAF8',
    backgroundElement: '#F2F1EE',
    backgroundSelected: '#EAE8E3',
    textSecondary: '#6B7078',
    border: '#E4E2DD',
    accent: '#8C5A21',
    accentOn: '#FFFFFF',
    destructive: '#DC2626',
    ...(isSoftDesign ? { border: '#E8E5DE' } : {}),
  },
  dark: {
    text: '#F4F4F6',
    background: '#0E0E12',
    backgroundElement: '#15151C',
    backgroundSelected: '#1B1B23',
    textSecondary: '#8D8D99',
    border: '#292934',
    accent: '#E3AC6D',
    accentOn: '#241004',
    destructive: '#F87171',
    ...(isSoftDesign ? { backgroundElement: '#17171E', backgroundSelected: '#1F1F28', border: '#24242E' } : {}),
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// Families are registered in the root layout's useFonts. The soft variant
// registers General Sans under one alias per role (same file behind several
// names) so softSheet() can still tell a metric number from a small label.
const ClassicFonts = {
  regular: 'BricolageGrotesque_400Regular',
  medium: 'BricolageGrotesque_500Medium',
  semiBold: 'BricolageGrotesque_600SemiBold',
  bold: 'BricolageGrotesque_700Bold',
  metric: 'BarlowCondensed_700Bold',
  metricMedium: 'BarlowCondensed_600SemiBold',
  technical: 'IBMPlexMono_500Medium',
  technicalBold: 'IBMPlexMono_700Bold',
  mono: Platform.select({ ios: 'ui-monospace', default: 'monospace' }),
};

const SoftFonts: typeof ClassicFonts = {
  regular: 'GeneralSans_400Regular',
  medium: 'GeneralSans_500Medium',
  semiBold: 'GeneralSans_600SemiBold',
  bold: 'GeneralSans_700Bold',
  metric: 'GeneralSans_Metric',
  metricMedium: 'GeneralSans_MetricMedium',
  technical: 'GeneralSans_Label',
  technicalBold: 'GeneralSans_LabelBold',
  mono: ClassicFonts.mono,
};

export const Fonts = isSoftDesign ? SoftFonts : ClassicFonts;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

// Upper bound for the OS text-size setting (iOS Dynamic Type / Android font
// size). Text still grows with the setting up to this factor — 1.35 covers
// every standard (non-"accessibility") iOS size and Android's large presets —
// but beyond it the dense tables (set rows, charts, tooltips) can't stay
// legible on a phone-width screen. ThemedText and the app's TextInput apply
// it by default; fixed-size boxes that hold text scale with useFontScale().
export const MAX_FONT_SCALE = 1.35;

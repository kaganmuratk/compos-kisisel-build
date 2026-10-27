import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { softSheet } from '@/constants/soft-sheet';

// Shared full-bleed "poster" shell for every share card (Nutrition today,
// Workout/Run/Day-summary next) — replaces the old bordered dashboard-card
// look (boxes, grid dividers, a small kcal tile) with a single edge-to-edge
// image: an optional user photo as the background, a bottom scrim so text
// stays legible over any photo, a small watermark, and the caller's content
// floating directly on top. No borders, no card-within-card — the photo
// (or, without one, a moody brand-tinted gradient) *is* the design.
export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1920;

export type SharePosterCardProps = {
  backgroundUri?: string | null;
  /** Brand tint used for the no-photo fallback gradient and the accent rule. */
  accentColor: string;
  children: ReactNode;
  /** Fixed canvas height (defaults to POSTER_HEIGHT). Pass a taller value for
   * content that scrolls a list rather than sitting in one bottom block. */
  height?: number;
  /** 'end' (default) bottom-anchors content, matching a single stat block.
   * 'start' top-anchors it instead, for a list that flows downward under the
   * watermark rather than pinning to the bottom of the frame. */
  contentAlign?: 'start' | 'end';
  textTheme?: 'light' | 'dark';
};

export const SharePosterCard = forwardRef<View, SharePosterCardProps>(function SharePosterCard(
  { backgroundUri, accentColor, children, height = POSTER_HEIGHT, contentAlign = 'end', textTheme = 'light' },
  ref
) {
  return (
    <View ref={ref} style={[styles.card, { height }]} collapsable={false}>
      {backgroundUri ? (
        <Image source={{ uri: backgroundUri }} style={[StyleSheet.absoluteFill, styles.layerBackground]} contentFit="cover" />
      ) : (
        // `key` ties this element's identity to the canvas size it's meant
        // to fill — on web expo-linear-gradient renders an SVG that (at
        // least across this project's dev-mode hot reloads) has been seen
        // holding on to a stale intrinsic size when only its container's
        // dimensions change; changing `key` forces a full remount instead
        // of an update whenever `height` (the one dimension that varies
        // between card variants) changes, so the gradient is guaranteed to
        // paint at the size it currently has, not one it had earlier.
        <LinearGradient
          key={`bg-${height}`}
          colors={[withAlpha(accentColor, 0.28), '#0A0A0C', '#000000']}
          locations={[0, 0.55, 1]}
          style={[StyleSheet.absoluteFill, styles.layerBackground]}
        />
      )}
      {/* Darkens the lower two-thirds so text reads over any photo without
          needing per-photo tuning — a flat scrim rather than a full-frame
          tint keeps a bright/dark background photo's top still visible
          either way. Fixed regardless of textTheme: the chosen photo must
          look the same no matter which text color is picked, so contrast
          for dark text comes from textShadow (see `themeTextShadow` below),
          never from re-tinting the photo itself. */}
      <LinearGradient
        key={`scrim-${height}`}
        colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.86)']}
        locations={[0, 0.42, 1]}
        style={[StyleSheet.absoluteFill, styles.layerScrim]}
      />
      {/* Explicit zIndex on every layer — RNW does not reliably fall back to
          DOM paint order between position:absolute siblings and the normal-
          flow content view, so without this the scrim/background can end up
          painted over the text instead of under it. */}
      <Text
        style={[
          styles.watermark,
          styles.layerForeground,
          { color: textTheme === 'dark' ? 'rgba(20,20,24,0.9)' : 'rgba(255,255,255,0.82)' },
          themeTextShadow(textTheme),
        ]}
      >
        COMPOS
      </Text>
      <View style={[styles.content, styles.layerForeground, contentAlign === 'start' && styles.contentStart]}>{children}</View>
      <View style={[styles.accentRule, styles.layerForeground, { backgroundColor: accentColor }]} />
    </View>
  );
});

// Every share card's text sits directly on a photo, not a flat surface, so
// its own color alone can't guarantee contrast — a spot on the photo can
// happen to match the text color exactly. A dark glow behind light text
// keeps it readable over any photo without altering the photo/scrim itself
// the way re-tinting the background per textTheme did. Dark text skips the
// glow entirely: dark-theme photos are the light/bright ones by design, so
// the near-black color already reads solid on them — a light glow around
// dark glyphs only softened their edges into a hazy, lower-opacity look.
export function themeTextShadow(theme: 'light' | 'dark' = 'light') {
  if (theme === 'dark') {
    return {};
  }
  return {
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  };
}

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const styles = softSheet({
  card: {
    width: POSTER_WIDTH,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  layerBackground: { zIndex: 0 },
  layerScrim: { zIndex: 1 },
  layerForeground: { zIndex: 2 },
  watermark: {
    position: 'absolute',
    top: 64,
    left: 64,
    fontFamily: Fonts.metric,
    fontSize: 40,
    letterSpacing: 6,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 64,
    paddingBottom: 100,
    gap: 20,
  },
  contentStart: {
    justifyContent: 'flex-start',
    paddingTop: 168,
  },
  accentRule: {
    position: 'absolute',
    left: 64,
    bottom: 76,
    width: 64,
    height: 6,
  },
});

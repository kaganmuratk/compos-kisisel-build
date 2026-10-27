import { StyleSheet } from 'react-native';

import { Fonts, isSoftDesign } from '@/constants/theme';

type Style = Record<string, unknown>;

// The soft design is applied as a pass over each screen's existing styles
// instead of a second copy of every StyleSheet: the classic look stays
// exactly what the code says (this is a no-op there), and the soft look is
// the same layout with rounded boxes, a softer shadow and type re-sized for
// General Sans (wider than Barlow Condensed, narrower than IBM Plex Mono).
export const Shape = {
  card: isSoftDesign ? 18 : 0,
  control: isSoftDesign ? 12 : 0,
};

const softShadow = { shadowColor: '#1B1A17', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 };

function num(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function radiusFor(style: Style): number {
  const height = num(style.height) ?? num(style.minHeight);
  const width = num(style.width) ?? num(style.minWidth);
  if (height !== undefined && width !== undefined && Math.abs(height - width) <= 4 && height <= 56) return Shape.control;
  if (height !== undefined && height <= 36) return Math.ceil(height / 2);
  if (height !== undefined && height <= 56) return Shape.control;
  return Shape.card;
}

export function softenStyle<T extends Style>(style: T): T {
  if (!isSoftDesign) return style;
  const next: Style = { ...style };
  const family = style.fontFamily;
  const size = num(style.fontSize);

  if ((family === Fonts.metric || family === Fonts.metricMedium) && size !== undefined) {
    const scaled = Math.round(size * 0.84);
    next.fontSize = scaled;
    const lineHeight = num(style.lineHeight);
    if (lineHeight !== undefined) next.lineHeight = Math.max(Math.round(lineHeight * 0.84), Math.round(scaled * 1.12));
    const spacing = num(style.letterSpacing);
    // Keep deliberate tracking (the COMPOS wordmark), tighten everything else.
    if (spacing === undefined || spacing <= 1) next.letterSpacing = scaled >= 20 ? -0.4 : 0;
  } else if ((family === Fonts.technical || family === Fonts.technicalBold) && size !== undefined && size <= 11) {
    next.fontSize = size + 1.5;
    const lineHeight = num(style.lineHeight);
    if (lineHeight !== undefined) next.lineHeight = lineHeight + 2;
    const spacing = num(style.letterSpacing);
    if (spacing !== undefined) next.letterSpacing = Math.min(spacing, 0.6);
  }

  // Bordered boxes and left-strip cards, plus filled buttons (a background
  // and a button-sized height, but not a full-screen `flex` container).
  const controlHeight = num(style.minHeight) ?? num(style.height);
  const filledControl = style.backgroundColor !== undefined && style.flex === undefined
    && controlHeight !== undefined && controlHeight >= 28 && controlHeight <= 64;
  const boxed = filledControl || (num(style.borderWidth) ?? 0) > 0 || ((num(style.borderLeftWidth) ?? 0) >= 2 && style.backgroundColor !== undefined);
  if (boxed && style.borderRadius === undefined) next.borderRadius = radiusFor(style);

  if (style.shadowOpacity === 0.06 && style.shadowRadius === 3) Object.assign(next, softShadow);

  return next as T;
}

export function softSheet<T extends StyleSheet.NamedStyles<T>>(styles: T): T {
  if (!isSoftDesign) return StyleSheet.create(styles);
  const out = {} as Record<string, unknown>;
  for (const key of Object.keys(styles)) {
    out[key] = softenStyle((styles as unknown as Record<string, Style>)[key]);
  }
  return StyleSheet.create(out as T);
}

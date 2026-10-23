import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { useNutritionPalette } from '@/components/nutrition-ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useFontScale } from '@/hooks/use-font-scale';

// Shared tap/press tooltip for every LineChart in the app (react-native-
// gifted-charts' own `pointerConfig`) — Kağan asked for this on "tüm
// grafikler" (every chart) after noticing he could only eyeball a value
// off the gridlines, not read it exactly. One config object so all three
// LineChart call sites (time-series-chart.tsx, analysis/body/[metric].tsx,
// analysis/exercises/[id].tsx) show the exact value the same way instead of
// three slightly different tooltip implementations.
//
// `roundToDigits` matches computeChartScale's own rounding (0 for a whole-
// number axis, 1 for a fractional one, e.g. weight) so the tooltip number
// agrees with what the gridlines already imply, not a different precision.
export function useChartPointerConfig({
  unit,
  roundToDigits = 0,
  // Data points can carry a distinct `originalLabel` (see time-series-chart.tsx,
  // which blanks most points' `label` for x-axis legibility on a dense
  // series but keeps the real one here so the tooltip still shows it).
  labelKey = 'label',
  pointerColor,
  seriesLabels,
  seriesColors,
}: {
  unit?: string;
  roundToDigits?: number;
  labelKey?: 'label' | 'originalLabel';
  pointerColor?: string;
  seriesLabels?: string[];
  seriesColors?: string[];
}) {
  // This card is its own opaque surface (not laid directly on the page
  // background), so it always uses the nutrition palette's own light/dark
  // resolution (settings.themeMode-aware) rather than the plain useTheme()
  // most of this file's callers otherwise use — it was previously built
  // from the *palette module's* dark-only back-compat default, which is
  // why it stayed dark-styled even after the rest of the app switched to
  // the light theme.
  const palette = useNutritionPalette();
  const resolvedPointerColor = pointerColor ?? palette.blue;
  // The bubble's box is a fixed size gifted-charts positions by, so its text
  // is sized here (allowFontScaling off) and the box grows with it: at a
  // larger OS text size the text used to spill out of the box over the chart
  // and the controls below (2026-10-23). It follows the text-size setting
  // only up to 1.2× — it's a transient overlay on a 140px-tall chart, and
  // any bigger it covers most of the chart it's describing.
  const tooltipScale = Math.min(useFontScale(), 1.2);
  const styles = useMemo(() => createStyles(palette, tooltipScale), [palette, tooltipScale]);
  const pointerLabelWidth = (seriesLabels ? 132 : 76) * tooltipScale;
  return {
    showPointerStrip: false,
    pointerColor: resolvedPointerColor,
    // Without this, the second series' pointer dot silently falls back to
    // `pointerColor` (the first series' color) too — on a two-line chart
    // (nutrition actual/target, water actual/target) both highlighted dots
    // rendered in the primary color even over the secondary line.
    pointer2Color: seriesColors?.[1],
    // gifted-charts draws its own separate "highlighted dot" at the tapped
    // column (on top of the always-there data point), computed from a touch
    // x it clamps to a minimum of 0.1 (see the linked upstream issue on
    // that line in node_modules) — so at the chart's very first column
    // (whose true x is 0) that highlight renders visibly right of the real
    // point instead of on it. Worse: the clamp isn't just cosmetic — the
    // whole pointer/tooltip overlay is gated on `pointerX > 0`, so
    // removing the clamp (tried first, as a patch-package patch) made the
    // tooltip stop opening altogether for that column instead of just
    // looking better. Hiding the dot is the only fix available without
    // rewriting that gating logic too; our own pointerLabelComponent card
    // below already marks which column is active with its exact value,
    // so the dot was redundant anyway.
    hidePointers: true,
    // Paints the tooltip bubble AFTER (so visually on top of) the pointer
    // dots instead of gifted-charts' default of before/underneath — without
    // this the dot sits in front of the bubble and can cover its text.
    stripOverPointer: true,
    // Kept narrow on purpose: gifted-charts uses this both as the tooltip
    // box's real CSS width AND to decide how far to shift the box sideways
    // near the chart's first/last columns (so it doesn't get clipped by the
    // card edge). The old 132/110 was wider than the box needed to be, so
    // near edge points it shifted much further than necessary, visually
    // detaching the box from the pointer dot (which is always correctly
    // placed). Kağan tried the two series side by side and asked to go back
    // to stacked (GERÇEK row above HEDEF row) — don't re-widen this for that.
    // Each row now carries its label inline ("GERÇEK  2800 kcal") instead of
    // above the value, which roughly halves the box's height (the old
    // label-over-value stack made it tall enough to cover the chart and the
    // controls under it); 132 fits that row with a 4-digit value + unit.
    pointerLabelWidth,
    pointerLabelHeight: (seriesLabels ? 62 : 42) * tooltipScale,
    // gifted-charts defaults the whole pointer/label overlay to
    // `pointerEvents: 'none'` so tapping a DIFFERENT column while a tooltip
    // is showing still reaches the chart underneath and moves the pointer.
    // But plain 'none' excludes the ENTIRE subtree from hit-testing on
    // native — including the day-navigation Pressable rendered inside
    // pointerLabelComponent below, which made every tap on the tooltip
    // fall through to the chart underneath instead (confirmed on-device:
    // tapping the value rows just re-picked whichever column was under the
    // finger). 'box-none' keeps the same pass-through for the wrapper
    // itself while still letting that inner Pressable receive its own
    // taps — the Pressable only wraps the small value-row area (not the
    // whole bubble), so it still can't swallow a tap meant for a
    // neighboring point the way an earlier, wider version once did (Kağan:
    // "bir noktaya tıkladığımda diğerine tıklayabilmek için kartın kapanması
    // gerekiyor, yoksa tıklayamıyorum").
    pointerEvents: 'box-none' as const,
    activatePointersInstantlyOnTouch: true,
    autoAdjustPointerLabelPosition: true,
    pointerVanishDelay: 2500,
    pointerLabelComponent: (items: { value: number; label?: string; originalLabel?: string; dateKey?: string }[]) => {
      const item = items[0];
      if (!item) return null;
      const label = labelKey === 'originalLabel' ? item.originalLabel : item.label;
      // Only a real single day (YYYY-MM-DD) is navigable — a week/month-
      // aggregated point's dateKey is a Monday or "YYYY-MM" bucket, not a
      // specific day, so those tooltips stay a plain (non-pressable) card.
      const dateKey = item.dateKey && /^\d{4}-\d{2}-\d{2}$/.test(item.dateKey) ? item.dateKey : undefined;
      const valueRows = items.map((value, index) => (
        <View key={index} style={styles.valueRow}>
          {seriesLabels?.[index] ? <ThemedText allowFontScaling={false} style={[styles.seriesLabel, { color: seriesColors?.[index] ?? resolvedPointerColor }]}>{seriesLabels[index]}</ThemedText> : null}
          <ThemedText allowFontScaling={false} style={styles.valueText}>{value.value.toFixed(roundToDigits)}{unit ? ` ${unit}` : ''}</ThemedText>
        </View>
      ));
      const dateText = !!label && (
        <ThemedText allowFontScaling={false} style={styles.dateText}>
          {label}
        </ThemedText>
      );
      // A previous version manually re-centered the box on the first/last
      // column (matching every interior column's centered placement) via a
      // `translateX` shift. On native that shift pushes the box past the
      // edge of gifted-charts' own horizontal ScrollView (the chart content
      // is rendered inside one, even with `disableScroll` — that only turns
      // off scroll gestures, not the ScrollView's inherent clip-to-bounds),
      // so the box's text got visibly cut off at the first/last point
      // (confirmed on-device, not just a "runs past the card edge"
      // cosmetic issue as originally assumed). Left at gifted-charts' own
      // flush-anchored placement for those two columns instead — slightly
      // off-center from the point, but fully on-screen and readable.
      return (
        <View style={styles.bubble}>
          {/* Only the value rows (not the date line below) are the tap
              target for day-navigation, keeping the hit area small so it
              can't swallow a tap meant for a neighboring point (see the
              pointerEvents comment above). This alone doesn't guarantee the
              tap always lands on it, though: on web, when the tooltip
              renders below the point it can sit inside the chart's own
              line/area-fill SVG, a separate absolutely-positioned layer
              that isn't in the same stacking context as this Pressable, so
              the SVG can still win the hit-test regardless of which part of
              the bubble is wrapped. Not confirmed whether this also affects
              native (RN's real touch dispatch doesn't use CSS stacking
              contexts) — if day-navigation taps turn out to be flaky on a
              real device too, look here first. */}
          {dateText}
          {dateKey ? (
            <Pressable onPress={() => router.push({ pathname: '/history/day/[date]', params: { date: dateKey } })}>
              {valueRows}
            </Pressable>
          ) : (
            valueRows
          )}
        </View>
      );
    },
  };
}

// `ts`: the tooltip's own text scale (see tooltipScale above).
const createStyles = (palette: ReturnType<typeof useNutritionPalette>, ts: number) => StyleSheet.create({
  bubble: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    gap: 1,
    alignItems: 'stretch',
    backgroundColor: palette.raised,
    borderColor: palette.border,
  },
  // One line per series: label left, value right; series rows stacked
  // (GERÇEK above HEDEF). A single-series tooltip has no label — the value
  // sits alone, centered.
  valueRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.two },
  seriesLabel: { fontSize: 8 * ts, lineHeight: 12 * ts, fontWeight: '700', letterSpacing: 0.5 },
  valueText: { flexGrow: 1, textAlign: 'right', color: palette.text, fontFamily: Fonts.bold, fontSize: 13 * ts, lineHeight: 18 * ts },
  dateText: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 10 * ts, lineHeight: 14 * ts, letterSpacing: 0.3 },
});

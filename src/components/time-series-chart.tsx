import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
// Import the LineChart submodule directly (not the package's root barrel) —
// same reason as analysis/body/[metric].tsx: the root barrel also exports
// BarChart, which eagerly requires an optional native gradient package this
// project doesn't have installed.
import { LineChart } from 'react-native-gifted-charts/dist/LineChart';

import { ThemedText } from '@/components/themed-text';
import { WEB_CONTENT_MAX_WIDTH } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useFontScale } from '@/hooks/use-font-scale';
import { useCardShadow, useTheme } from '@/hooks/use-theme';
import { computeChartScale, type ChartMetricKind } from '@/lib/chart-scale';
import { useChartPointerConfig } from '@/lib/chart-pointer';
import { softSheet } from '@/constants/soft-sheet';

// Reusable per-metric line-chart card — the same visual template as
// analysis/body/[metric].tsx's weight/sleep/stress/water charts, factored
// out so any new time-series (workout heart rate/speed, later daily
// vitals) looks consistent without re-deriving the LineChart config each
// time.
export function TimeSeriesChart({
  title,
  unit,
  data,
  kind,
  color,
  secondaryData,
  secondaryColor = '#A78BFA',
  seriesLabels,
  surfaceColor,
  borderColor,
  footer,
}: {
  title: string;
  unit?: string;
  // `dateKey` is the underlying ISO date (YYYY-MM-DD) a point represents, if
  // any — carried through to the pointer tooltip so tapping it can jump to
  // that day's history page (see chart-pointer.tsx). Absent/non-daily bars
  // (e.g. a monthly-aggregated point) just don't get a tappable tooltip.
  // `axisLabel`, if present, is shown under the point on the x-axis —
  // deliberately separate from `label` (which the tooltip always shows in
  // full) so a dense series can carry a short axis label ("13") alongside
  // a fuller tooltip one ("13 Eyl") without the two fighting for space.
  // Omitting it keeps the axis blank, as before.
  data: { value: number; label: string; dateKey?: string; axisLabel?: string }[];
  kind: ChartMetricKind;
  color?: string;
  secondaryData?: { value: number; label: string; dateKey?: string }[];
  secondaryColor?: string;
  seriesLabels?: [string, string];
  surfaceColor?: string;
  borderColor?: string;
  // Rendered inside the card, below the chart — e.g. the range/period
  // toggles on the nutrition analysis screen, kept inside the same white
  // surface instead of floating above/below it.
  footer?: ReactNode;
}) {
  const theme = useTheme();
  const cardShadow = useCardShadow();
  const { width: windowWidth } = useWindowDimensions();
  // On web, every screen's root ThemedView caps content at
  // WEB_CONTENT_MAX_WIDTH and centers it — useWindowDimensions() still
  // reports the full (much wider) browser window, though. Using the raw
  // window width here made the chart compute a width far bigger than the
  // card it's actually rendered inside, so it overflowed past the card's
  // right edge instead of fitting — capping to the same value the layout
  // itself is capped to keeps this in sync with wherever that cap changes.
  const width = Math.min(windowWidth, WEB_CONTENT_MAX_WIDTH);
  const lineColor = color ?? theme.accent;
  const chartScale = computeChartScale(
    [...data, ...(secondaryData ?? [])].map((d) => d.value),
    kind
  );
  // Axis text follows the OS text size like the rest of the app (capped by
  // useFontScale); gifted-charts' own font scaling is turned off below so it
  // isn't applied twice, and the y-axis column grows with its labels.
  const fontScale = useFontScale();
  const yAxisLabelWidth = 36 * fontScale;
  // Measured, not derived from the window width: the card sits inside
  // different paddings on different screens, and a guessed width ran the
  // last point/label past the card edge on some of them.
  const [plotAreaWidth, setPlotAreaWidth] = useState(0);
  // Room at both ends for the edge points' dots and their (centered) x-axis
  // labels. With 0 here the first point sat exactly on the y-axis, half its
  // dot hidden behind it, and the first/last date labels were cut in half
  // (2026-10-23). The x-axis labels follow initialSpacing on their own.
  const edgeInset = 18 * fontScale;
  const initialSpacing = edgeInset;
  // The right-hand room is left inside `width` (spacing below), not given as
  // endSpacing: gifted-charts draws endSpacing past `width` but clips the
  // x-axis labels at `width`, which cut the last date label in half.
  const endSpacing = 0;
  const chartWidth = (plotAreaWidth || width - Spacing.four * 4) - yAxisLabelWidth;
  const spacing = data.length > 1 ? (chartWidth - initialSpacing - edgeInset) / (data.length - 1) : 0;
  const axisLabelStyle = { color: theme.textSecondary, fontSize: 10 * fontScale };
  // gifted-charts boxes each x-axis label to the point spacing, which on a
  // dense series is narrower than a date — it truncated them to "29…". The
  // label renders in its own wider box (2 × edgeInset, the room left at the
  // chart ends), centered on its point.
  const axisLabelWidth = edgeInset * 2;
  // Those wider boxes overlap once labeled points sit closer than a label's
  // width ("7 Ey14 Ey21 Ey…" at 90G weekly, 2026-10-27). Walking back from
  // the newest point (so it's always labeled), a label is skipped while it
  // would still overlap the last one kept.
  const shownLabels = new Set<number>();
  for (let index = data.length - 1, lastShown = Infinity; index >= 0; index--) {
    if (!data[index].axisLabel || (lastShown - index) * spacing < axisLabelWidth + 4) continue;
    shownLabels.add(index);
    lastShown = index;
  }
  const showsLabel = (index: number) => shownLabels.has(index);
  const displayData = data.map((point, index) => ({
    ...point,
    label: showsLabel(index) ? point.axisLabel ?? '' : '',
    labelComponent: point.axisLabel && showsLabel(index)
      ? () => (
          <ThemedText allowFontScaling={false} numberOfLines={1} style={[axisLabelStyle, { width: axisLabelWidth, marginLeft: (spacing - axisLabelWidth) / 2, textAlign: 'center' }]}>
            {point.axisLabel}
          </ThemedText>
        )
      : undefined,
    originalLabel: point.label,
  }));
  const displaySecondaryData = secondaryData?.map((point, i) => ({ ...point, label: '', originalLabel: data[i]?.label ?? point.label }));
  const pointerConfig = useChartPointerConfig({ unit, roundToDigits: chartScale.roundToDigits, labelKey: 'originalLabel', pointerColor: lineColor, seriesLabels, seriesColors: [lineColor, secondaryColor] });
  const chartWrapperRef = useRef<View>(null);
  // Web-only: several of the library's own internal wrapper elements (the
  // <svg> it draws points/lines into, plus at least one plain View around
  // the x-axis label row) clip their content to a box a few px smaller
  // than the coordinate space it actually draws into — so a point sitting
  // at or near any axis edge (a 0-kcal day on the baseline, the first/last
  // column's x-axis label, a point at the very left where cx≈0) renders
  // with part of itself cut clean off. Native react-native-svg has no such
  // box, so this is purely a web quirk; forcing every clipped node inside
  // this chart open is the only lever available since the library exposes
  // no prop for it, and nothing here has a legitimate reason to clip its
  // own content (everything is already sized to fit within `chartWidth`).
  //
  // A plain effect (fixing this once per render of *this* component) isn't
  // enough: gifted-charts' own LineChart has internal state — an animated
  // width value that settles a frame after mount, in particular — that
  // re-renders and rebuilds its <svg> node from scratch *without*
  // re-rendering TimeSeriesChart, so an effect scoped to this component
  // never gets a second chance to run after that swap and the fix silently
  // stopped applying (caught via direct DOM inspection: the live <svg>'s
  // inline style was empty even though this effect had already run). A
  // MutationObserver watches the DOM itself instead of this component's
  // render cycle, so it re-applies the fix no matter which layer caused
  // the node to change.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const fixOverflow = () => {
      // Looked up fresh on every call, not captured once outside the loop:
      // on first mount `data` is normally still empty (a React Query
      // default before the real query resolves), so the `data.length >= 2`
      // branch below hasn't rendered the ref'd <View> yet and
      // chartWrapperRef.current is null when this effect's setup body runs
      // — capturing it once at that point meant the fix silently never ran
      // at all on a cold load (confirmed via mutation-observer probing: on
      // some loads zero style mutations ever touched the chart's <svg>).
      // Re-reading the ref each frame means it starts working the moment
      // the chart actually mounts, whenever that turns out to be.
      const node = chartWrapperRef.current as unknown as HTMLElement | null;
      node?.querySelectorAll<HTMLElement>('*').forEach((el) => {
        const style = getComputedStyle(el);
        if (
          (style.overflow === 'hidden' || style.overflowX === 'hidden' || style.overflowY === 'hidden') &&
          el.style.overflow !== 'visible'
        ) {
          el.style.overflow = 'visible';
        }
      });
    };
    // This app invalidates every React Query on each completed PowerSync
    // checkpoint (see _layout.tsx's refreshAfterCompletedSync), which can
    // re-render this chart with fresh data well after mount — so besides
    // the cold-mount timing issue above, a one-shot fix isn't safe either.
    // Reapplying every frame for the component's entire mounted lifetime
    // is cheap (a shallow scan of one small card's DOM) and correct
    // regardless of when the chart first mounts or what causes it to
    // re-render later.
    let rafId: number;
    const tick = () => {
      fixOverflow();
      rafId = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <View style={[styles.card, { backgroundColor: surfaceColor ?? theme.backgroundElement, borderColor: borderColor ?? 'transparent', borderWidth: borderColor ? StyleSheet.hairlineWidth : 0 }, cardShadow]}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {unit ? `${title.toUpperCase()} (${unit})` : title.toUpperCase()}
      </ThemedText>
      {data.length >= 2 ? (
        <View ref={chartWrapperRef} onLayout={(event) => setPlotAreaWidth(Math.floor(event.nativeEvent.layout.width))}>
        <LineChart
          data={displayData}
          data2={displaySecondaryData}
          width={chartWidth}
          height={140}
          color={lineColor}
          color2={secondaryColor}
          thickness={2}
          areaChart
          startFillColor={lineColor}
          startOpacity={0.2}
          endOpacity={0.02}
          dataPointsColor={lineColor}
          dataPointsColor2={secondaryColor}
          // At the library's default radius (~3, same as the 2px line
          // thickness) a point sitting at a sharp peak/valley is
          // indistinguishable from the line's own miter join there — same
          // color, barely any dot poking out past it. 4 is enough to read
          // as its own dot at every vertex without looking heavy.
          dataPointsRadius={4}
          dataPointsRadius2={4}
          // Animation defaults to on; its point-entry pass renders behind
          // the fully-drawn line for a frame and (on this data) can leave
          // out-of-view artifacts once it "finishes" mid-layout-shift
          // (e.g. after a period/range toggle re-renders with a different
          // point count). These are small analytics charts, not something
          // worth an intro animation over — off avoids the whole class of
          // render-order bugs instead of chasing each one.
          isAnimated={false}
          yAxisTextStyle={{ color: theme.textSecondary, fontSize: 10 * fontScale }}
          yAxisLabelWidth={yAxisLabelWidth}
          allowFontScaling={false}
          xAxisLabelTextStyle={axisLabelStyle}
          xAxisColor={theme.border}
          yAxisColor={theme.border}
          rulesColor="transparent"
          showVerticalLines={false}
          maxValue={chartScale.maxValue}
          stepValue={chartScale.stepValue}
          noOfSections={chartScale.noOfSections}
          roundToDigits={chartScale.roundToDigits}
          showFractionalValues={chartScale.showFractionalValues}
          initialSpacing={initialSpacing}
          endSpacing={endSpacing}
          spacing={spacing}
          disableScroll
          pointerConfig={pointerConfig}
        />
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Grafik için yeterli veri yok.
        </ThemedText>
      )}
      {footer}
    </View>
  );
}

const styles = softSheet({
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
  },
});

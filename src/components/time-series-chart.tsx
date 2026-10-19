import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
// Import the LineChart submodule directly (not the package's root barrel) —
// same reason as analysis/body/[metric].tsx: the root barrel also exports
// BarChart, which eagerly requires an optional native gradient package this
// project doesn't have installed.
import { LineChart } from 'react-native-gifted-charts/dist/LineChart';

import { ThemedText } from '@/components/themed-text';
import { WEB_CONTENT_MAX_WIDTH } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useCardShadow, useTheme } from '@/hooks/use-theme';
import { computeChartScale, type ChartMetricKind } from '@/lib/chart-scale';
import { useChartPointerConfig } from '@/lib/chart-pointer';

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
  const chartWidth = width - Spacing.four * 2 - Spacing.four * 2 - 40;
  // 0, not a few px of "safety" padding: gifted-charts positions each
  // point at initialSpacing + spacing*index but centers that point's
  // x-axis label at spacing*index — i.e. any nonzero initialSpacing shifts
  // every label left of its point by exactly that amount. 0 is the only
  // value where they actually line up.
  const initialSpacing = 0;
  const endSpacing = 0;
  // Without an explicit spacing, LineChart falls back to a fixed default
  // per-point spacing and lets its internal ScrollView grow wider than the
  // card to fit every point — the chart then only "reveals" the rest as you
  // drag right instead of showing the whole series at once. Deriving spacing
  // from the point count keeps the full series inside `chartWidth` always.
  const spacing = data.length > 1 ? (chartWidth - initialSpacing - endSpacing) / (data.length - 1) : 0;
  const axisLabelStyle = { color: theme.textSecondary, fontSize: 10 };
  const displayData = data.map((point) => ({
    ...point,
    label: point.axisLabel ?? '',
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
        <View ref={chartWrapperRef}>
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
          yAxisTextStyle={{ color: theme.textSecondary, fontSize: 10 }}
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

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
  },
});

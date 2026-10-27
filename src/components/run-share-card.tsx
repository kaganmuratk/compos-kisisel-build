import { Image } from 'expo-image';
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';

import { RouteShapeSvg, type ShapePoint } from '@/components/route-shape-svg';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { formatDuration, formatPace, type RoutePoint } from '@/lib/geo';
import { projectRoute } from '@/lib/route-svg';
import { softSheet } from '@/constants/soft-sheet';

// Fixed 9:16 (Instagram Story) aspect ratio, rendered at a small on-screen
// size and captured at full resolution — see run/share/[id].tsx.
export const SHARE_CARD_WIDTH = 320;
export const SHARE_CARD_HEIGHT = 568;
const ROUTE_HEIGHT = 300;

export type RunShareCardProps = {
  title: string;
  distanceMeters: number;
  durationSeconds: number;
  points: RoutePoint[];
  // Only set for a manually-entered run where exactly one place (start OR
  // end, not both — see run/manual.tsx) was picked and no route could be
  // computed between two points. Shown instead of the empty route box so a
  // real location choice never reads as "nothing was recorded."
  placeName?: string;
  // Traced route-line shape from a Telegram-imported screenshot (not real
  // GPS — see routeShapePoints's own comment in schema.ts). Only used when
  // there's no real `points` route to draw.
  routeShapePoints?: ShapePoint[];
  elevationGainMeters?: number;
  avgHeartRate?: number | null;
  caloriesBurned?: number | null;
  // User's own photo from run/share/[id].tsx's picker — rendered full-bleed
  // behind everything else with a dark scrim on top for text legibility,
  // same "photo backdrop, stats overlaid" look as Strava/Nike Run Club.
  backgroundImageUri?: string | null;
};

// Deliberately ignores the app's light/dark theme setting — a share card is
// exported content, not in-app UI, and should look the same (dark, on-brand)
// no matter what theme mode the phone is in.
export const RunShareCard = forwardRef<View, RunShareCardProps>(function RunShareCard(
  {
    title,
    distanceMeters,
    durationSeconds,
    points,
    placeName,
    routeShapePoints,
    elevationGainMeters,
    avgHeartRate,
    caloriesBurned,
    backgroundImageUri,
  },
  ref
) {
  const routeWidth = SHARE_CARD_WIDTH - Spacing.five * 2;
  const projected = projectRoute(points, { width: routeWidth, height: ROUTE_HEIGHT, padding: 12 });
  const pathPoints = projected.map((p) => `${p.x},${p.y}`).join(' ');
  const hasHealthStats = avgHeartRate != null || caloriesBurned != null;

  return (
    <View
      ref={ref}
      style={[styles.card, backgroundImageUri ? styles.cardTransparentBg : null]}
      collapsable={false}>
      {backgroundImageUri && (
        <>
          <Image source={{ uri: backgroundImageUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={[StyleSheet.absoluteFill, styles.scrim]} />
        </>
      )}

      <Text style={styles.title}>{title}</Text>

      <View style={[styles.routeBox, { width: routeWidth, height: ROUTE_HEIGHT }]}>
        {projected.length > 1 ? (
          <Svg width={routeWidth} height={ROUTE_HEIGHT}>
            <Polyline
              points={pathPoints}
              fill="none"
              stroke={Colors.dark.accent}
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : routeShapePoints && routeShapePoints.length > 1 ? (
          <RouteShapeSvg points={routeShapePoints} width={routeWidth} height={ROUTE_HEIGHT} color={Colors.dark.accent} strokeWidth={7} />
        ) : placeName ? (
          <View style={styles.placeBox}>
            <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
              <Path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" stroke={Colors.dark.accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              <Circle cx={12} cy={10} r={2.5} stroke={Colors.dark.accent} strokeWidth={1.8} />
            </Svg>
            <Text style={styles.placeName}>{placeName}</Text>
          </View>
        ) : (
          <Text style={styles.routeEmpty}>Rota kaydedilmedi</Text>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{(distanceMeters / 1000).toFixed(2)}</Text>
          <Text style={styles.statLabel}>km</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatDuration(durationSeconds)}</Text>
          <Text style={styles.statLabel}>süre</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatPace(distanceMeters, durationSeconds)}</Text>
          <Text style={styles.statLabel}>tempo</Text>
        </View>
        {elevationGainMeters != null && (
          <View style={styles.stat}>
            <Text style={styles.statValue}>+{Math.round(elevationGainMeters)}</Text>
            <Text style={styles.statLabel}>irtifa</Text>
          </View>
        )}
      </View>

      {hasHealthStats && (
        <View style={styles.statsRow}>
          {avgHeartRate != null && (
            <View style={styles.stat}>
              <Text style={styles.statValue}>{avgHeartRate}</Text>
              <Text style={styles.statLabel}>ort. nabız</Text>
            </View>
          )}
          {caloriesBurned != null && (
            <View style={styles.stat}>
              <Text style={styles.statValue}>{Math.round(caloriesBurned)}</Text>
              <Text style={styles.statLabel}>kcal</Text>
            </View>
          )}
        </View>
      )}

      <Text style={styles.brand}>COMPOS</Text>
    </View>
  );
});

const styles = softSheet({
  card: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    backgroundColor: Colors.dark.background,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.four,
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  cardTransparentBg: {
    backgroundColor: 'transparent',
  },
  scrim: {
    // Darkens the user's photo enough that white stat text stays readable
    // over any photo content, without hiding the photo entirely.
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  title: {
    color: Colors.dark.text,
    fontFamily: Fonts.semiBold,
    fontSize: 20,
    textAlign: 'center',
  },
  routeBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeEmpty: {
    color: Colors.dark.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 14,
  },
  placeBox: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  placeName: {
    color: Colors.dark.text,
    fontFamily: Fonts.semiBold,
    fontSize: 18,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  stat: {
    alignItems: 'center',
    gap: Spacing.half,
  },
  statValue: {
    color: Colors.dark.text,
    fontFamily: Fonts.semiBold,
    fontSize: 26,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: Colors.dark.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 13,
  },
  brand: {
    color: Colors.dark.accent,
    fontFamily: Fonts.bold,
    fontSize: 13,
    letterSpacing: 3,
  },
});

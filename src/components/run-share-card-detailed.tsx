import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { formatDuration, formatPace } from '@/lib/geo';

// Same sizing/capture reasoning as nutrition-share-card-detailed.tsx — fixed
// width, no fixed height. Text-only on purpose: the summary card
// (run-share-card.tsx) already covers the route graphic/photo backdrop side
// of things; this one's job is surfacing every numeric field a session can
// carry (Health Connect enrichment, movement breakdown, the free-text note)
// that the summary card has no room for.
export const SHARE_CARD_WIDTH = 320;

export type RunShareCardDetailedProps = {
  title: string;
  distanceMeters: number;
  durationSeconds: number;
  elevationGainMeters?: number;
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  caloriesBurned?: number | null;
  vo2Max?: number | null;
  oxygenSaturation?: number | null;
  heartRateVariability?: number | null;
  respiratoryRate?: number | null;
  avgCadence?: number | null;
  maxCadence?: number | null;
  runSeconds?: number | null;
  walkSeconds?: number | null;
  stoppedSeconds?: number | null;
  notes?: string | null;
};

function minutes(seconds: number): string {
  return `${Math.round(seconds / 60)} dk`;
}

export const RunShareCardDetailed = forwardRef<View, RunShareCardDetailedProps>(function RunShareCardDetailed(
  {
    title,
    distanceMeters,
    durationSeconds,
    elevationGainMeters,
    avgHeartRate,
    maxHeartRate,
    caloriesBurned,
    vo2Max,
    oxygenSaturation,
    heartRateVariability,
    respiratoryRate,
    avgCadence,
    maxCadence,
    runSeconds,
    walkSeconds,
    stoppedSeconds,
    notes,
  },
  ref
) {
  const hasHealthStats = avgHeartRate != null || maxHeartRate != null || caloriesBurned != null;
  const hasAdvancedStats =
    vo2Max != null || oxygenSaturation != null || heartRateVariability != null || respiratoryRate != null;
  const hasCadence = avgCadence != null || maxCadence != null;
  const hasMovementBreakdown = runSeconds != null && walkSeconds != null && stoppedSeconds != null;

  return (
    <View ref={ref} style={styles.card} collapsable={false}>
      <Text style={styles.title}>{title}</Text>

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
          {maxHeartRate != null && (
            <View style={styles.stat}>
              <Text style={styles.statValue}>{maxHeartRate}</Text>
              <Text style={styles.statLabel}>max nabız</Text>
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

      {hasCadence && (
        <View style={styles.statsRow}>
          {avgCadence != null && (
            <View style={styles.stat}>
              <Text style={styles.statValue}>{Math.round(avgCadence)}</Text>
              <Text style={styles.statLabel}>ort. kadans</Text>
            </View>
          )}
          {maxCadence != null && (
            <View style={styles.stat}>
              <Text style={styles.statValue}>{Math.round(maxCadence)}</Text>
              <Text style={styles.statLabel}>max kadans</Text>
            </View>
          )}
        </View>
      )}

      {hasAdvancedStats && (
        <View style={styles.advancedBlock}>
          {vo2Max != null && <Text style={styles.advancedLine}>VO2 Max: {vo2Max.toFixed(1)}</Text>}
          {oxygenSaturation != null && <Text style={styles.advancedLine}>SpO2: %{oxygenSaturation.toFixed(0)}</Text>}
          {heartRateVariability != null && (
            <Text style={styles.advancedLine}>Nabız değişkenliği (HRV): {heartRateVariability.toFixed(0)} ms</Text>
          )}
          {respiratoryRate != null && <Text style={styles.advancedLine}>Solunum: {respiratoryRate.toFixed(0)}/dk</Text>}
        </View>
      )}

      {hasMovementBreakdown && (
        <Text style={styles.advancedLine}>
          Koşu {minutes(runSeconds!)} · Yürüyüş {minutes(walkSeconds!)} · Durma {minutes(stoppedSeconds!)}
        </Text>
      )}

      {notes && (
        <View style={styles.noteBlock}>
          <Text style={styles.noteLabel}>NOT</Text>
          <Text style={styles.noteText}>{notes}</Text>
        </View>
      )}

      <Text style={styles.brand}>COMPOS</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    borderRadius: Radius.xl,
    backgroundColor: Colors.dark.background,
    // Horizontal padding kept narrow (unlike the other detailed cards' plain
    // Spacing.six) — this card's stat rows need real width to lay out
    // side-by-side with justifyContent:'space-around'; matches
    // RunShareCard's own paddingHorizontal for the same reason.
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.six,
    alignItems: 'center',
    gap: Spacing.four,
  },
  title: {
    color: Colors.dark.text,
    fontFamily: Fonts.semiBold,
    fontSize: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignSelf: 'stretch',
  },
  stat: {
    alignItems: 'center',
    gap: Spacing.half,
  },
  statValue: {
    color: Colors.dark.text,
    fontFamily: Fonts.semiBold,
    fontSize: 22,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: Colors.dark.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 12,
  },
  advancedBlock: {
    alignSelf: 'stretch',
    gap: Spacing.one,
  },
  advancedLine: {
    color: Colors.dark.textSecondary,
    fontFamily: Fonts.regular,
    fontSize: 13,
  },
  noteBlock: {
    alignSelf: 'stretch',
    gap: Spacing.one,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.dark.border,
    paddingTop: Spacing.three,
  },
  noteLabel: {
    color: Colors.dark.textSecondary,
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    letterSpacing: 1,
  },
  noteText: {
    color: Colors.dark.text,
    fontFamily: Fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  brand: {
    color: Colors.dark.accent,
    fontFamily: Fonts.bold,
    fontSize: 13,
    letterSpacing: 3,
    textAlign: 'center',
  },
});

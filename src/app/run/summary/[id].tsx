import { Image, useImage } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeaderActionButton } from '@/components/header-action-button';
import { ImageSectionCrop } from '@/components/image-section-crop';
import { RouteMap } from '@/components/route-map';
import { RouteShapeSvg } from '@/components/route-shape-svg';
import type { RouteMapHandle } from '@/components/route-map.types';
import { ThemedView, WEB_CONTENT_MAX_WIDTH } from '@/components/themed-view';
import { TimeSeriesChart } from '@/components/time-series-chart';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { nutritionPaletteLight, PaletteText as ThemedText, useNutritionPalette } from '@/components/nutrition-ui';
import { useCardioSession, useUpdateCardioSessionMeta } from '@/db/queries/cardio';
import { useRunRoute } from '@/db/queries/routes';
import { useWorkoutHeartRateTimeSeries, useWorkoutSpeedTimeSeries } from '@/hooks/use-health-connect';
import { activityTypeUsesSpeed, getActivityTypeLabel } from '@/lib/activity-type';
import { formatShortDate } from '@/lib/date';
import type { LatLng } from '@/lib/directions';
import { formatDuration, formatPace, formatSpeed, formatSwimPace, type RoutePoint } from '@/lib/geo';
import { useT } from '@/lib/i18n';
import { TextInput } from '@/components/text-input';
import { BackButton } from '@/components/screen-header';
import { KEYBOARD_BAR_CLEARANCE } from '@/components/keyboard-done-bar';

export default function RunSummaryScreen() {
  const { t, language } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = id;
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const cardShadow = cardShadowFor(palette);
  const mapRef = useRef<RouteMapHandle>(null);
  const updateSessionMeta = useUpdateCardioSessionMeta();
  const { width: windowWidth } = useWindowDimensions();

  const { data: session } = useCardioSession(sessionId);
  const points: RoutePoint[] = session?.route ? JSON.parse(session.route) : [];
  const { data: plannedRoute } = useRunRoute(session?.plannedRouteId ?? null);
  // Only meaningful for a session that actually went through Health Connect
  // enrichment (healthSyncedAt set) — see useWorkoutHeartRateTimeSeries's
  // own `enabled` gate for why a manually-entered/screenshot-imported
  // session harmlessly resolves to an empty array instead.
  const hasHealthConnectData = !!session?.healthSyncedAt;
  const { data: heartRateSeries = [] } = useWorkoutHeartRateTimeSeries(
    hasHealthConnectData ? session?.startedAt : null,
    hasHealthConnectData ? session?.finishedAt : null
  );
  const { data: speedSeries = [] } = useWorkoutSpeedTimeSeries(
    hasHealthConnectData ? session?.startedAt : null,
    hasHealthConnectData ? session?.finishedAt : null
  );
  const plannedRoutePoints: LatLng[] = plannedRoute?.points ? JSON.parse(plannedRoute.points) : [];
  const mapReadyRef = useRef(false);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');
  // useImage (not a plain <Image onLoad>) — loads once, gives back a native
  // image reference with real pixel dimensions, and every ImageSectionCrop
  // below reuses this same loaded reference instead of each re-fetching the
  // same remote screenshot on its own.
  const loadedSourceImage = useImage(session?.sourceImageUrl ?? '');

  useEffect(() => {
    setNameValue(session?.name ?? '');
  }, [session?.name]);

  useEffect(() => {
    setNote(session?.notes ?? '');
  }, [session?.notes]);

  const fitRoute = () => {
    const allPoints = [...points, ...plannedRoutePoints];
    if (allPoints.length > 1) {
      mapRef.current?.fitToPoints(allPoints);
    }
  };

  useEffect(() => {
    if (mapReadyRef.current) {
      fitRoute();
    }
  }, [points.length, plannedRoutePoints.length]);

  const handleMapReady = () => {
    mapReadyRef.current = true;
    fitRoute();
  };

  if (!session) {
    return null;
  }

  const saveName = () => {
    updateSessionMeta.mutate({ id: sessionId, name: nameValue.trim() || null });
    setEditingName(false);
  };

  const saveNote = () => updateSessionMeta.mutate({ id: sessionId, notes: note });

  const distanceMeters = session.distanceMeters ?? 0;
  const durationSeconds = session.durationSeconds ?? 0;
  const activityType = session.activityType ?? 'run';
  const activityLabel = getActivityTypeLabel(activityType, language);
  const usesSpeed = activityTypeUsesSpeed(activityType);
  const rate = usesSpeed
    ? formatSpeed(distanceMeters, durationSeconds)
    : activityType === 'swim'
      ? formatSwimPace(distanceMeters, durationSeconds)
      : formatPace(distanceMeters, durationSeconds);

  type ImageSection = { label: string; startPercent: number; endPercent: number };
  // The model's boundary estimate is a best guess, not pixel-exact — trim a
  // small margin off each crop's own top/bottom edge so a slightly-off
  // boundary shows a bit of blank space rather than bleeding into the next
  // card's title/content, which read as "cut off, doesn't make sense."
  const insetSection = (section: ImageSection): ImageSection => {
    const margin = (section.endPercent - section.startPercent) * 0.06;
    return { ...section, startPercent: section.startPercent + margin, endPercent: section.endPercent - margin };
  };
  const imageSections: ImageSection[] = session.imageSections ? JSON.parse(session.imageSections) : [];
  const rawRouteImageSection = imageSections.find((s) => /rota|harita/i.test(s.label));
  const routeImageSection = rawRouteImageSection ? insetSection(rawRouteImageSection) : undefined;
  const otherImageSections = imageSections.filter((s) => s !== rawRouteImageSection).map(insetSection);
  const routeShapePoints: { x: number; y: number }[] = session.routeShapePoints ? JSON.parse(session.routeShapePoints) : [];
  // See time-series-chart.tsx's identical comment — useWindowDimensions()
  // reports the full browser window on web, wider than the column
  // ThemedView actually caps screens to.
  const contentWidth = Math.min(windowWidth, WEB_CONTENT_MAX_WIDTH) - Spacing.four * 2;
  const sourceImageUrl = session.sourceImageUrl;
  const imageNaturalSize = loadedSourceImage ? { width: loadedSourceImage.width, height: loadedSourceImage.height } : null;

  return (
    <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <BackButton onPress={() => router.back()} />
          {editingName ? (
            <TextInput
              value={nameValue}
              onChangeText={setNameValue}
              onEndEditing={saveName}
              onBlur={saveName}
              autoFocus
              placeholder={formatShortDate(session.date)}
              placeholderTextColor={palette.muted}
              style={[styles.titleInput, { color: palette.text, borderColor: palette.border }]}
            />
          ) : (
            <Pressable onPress={() => setEditingName(true)} hitSlop={4}>
              <ThemedText type="subtitle" style={{ color: palette.text }}>{session.name || formatShortDate(session.date)}</ThemedText>
            </Pressable>
          )}
          <HeaderActionButton
            label={t('share')}
            accessibilityLabel={t('share')}
            onPress={() => router.push({ pathname: '/run/share/[id]', params: { id: String(sessionId) } })}
          />
        </View>

        <KeyboardAwareScrollView bottomOffset={KEYBOARD_BAR_CLEARANCE} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => setShowNote((s) => !s)} style={styles.noteToggle} hitSlop={8}>
          <ThemedText type="small" themeColor="textSecondary">
            {note || `${t('addNoteLabel').toUpperCase()} ${showNote ? '−' : '+'}`}
          </ThemedText>
        </Pressable>
        {showNote && (
          <TextInput
            value={note}
            onChangeText={setNote}
            onEndEditing={saveNote}
            onBlur={saveNote}
            placeholder={language === 'tr' ? `Bu ${activityLabel.toLowerCase()} hakkında notlar…` : `Notes about this ${activityLabel.toLowerCase()}…`}
            placeholderTextColor={palette.muted}
            style={[styles.noteInput, { color: palette.text, borderColor: palette.border }]}
            multiline
          />
        )}

        <View style={[styles.mapCard, { backgroundColor: palette.card }, cardShadow]}>
          {points.length > 1 || plannedRoutePoints.length > 1 ? (
            <RouteMap
              ref={mapRef}
              style={styles.map}
              accentColor={palette.blue}
              onMapReady={handleMapReady}
              initialRegion={{
                latitude: (points[0] ?? plannedRoutePoints[0]).lat,
                longitude: (points[0] ?? plannedRoutePoints[0]).lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              polylines={[
                ...(plannedRoutePoints.length > 1
                  ? [{ points: plannedRoutePoints, color: palette.blue, width: 4, showEndpoints: true }]
                  : []),
                ...(points.length > 1 ? [{ points, color: palette.blue, width: 4, showEndpoints: true }] : []),
              ]}
            />
          ) : points.length === 1 ? (
            // Elle eklenen ve tek bir yer seçilmiş (başlangıç/bitiş rotası
            // hesaplanamamış) koşular için — gerçek bir rota yok, sadece
            // seçilen yeri işaretle.
            <RouteMap
              style={styles.map}
              accentColor={palette.blue}
              initialRegion={{
                latitude: points[0].lat,
                longitude: points[0].lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              markers={points}
            />
          ) : routeShapePoints.length > 1 ? (
            // No real GPS trace, but a Telegram-imported screenshot's route
            // line shape was traced — a stylized line in Compos's own
            // accent color, no map imagery/background, not the cropped
            // screenshot (Kağan explicitly asked for the line-only look
            // over the raw image crop here).
            <View style={styles.routeShapeBox}>
              <RouteShapeSvg points={routeShapePoints} width={contentWidth} height={280} color={palette.blue} />
            </View>
          ) : routeImageSection && imageNaturalSize && loadedSourceImage ? (
            // Fallback when the model couldn't trace a line shape but a
            // screenshot crop is still available — better than nothing.
            <ImageSectionCrop
              source={loadedSourceImage}
              naturalSize={imageNaturalSize}
              startPercent={routeImageSection.startPercent}
              endPercent={routeImageSection.endPercent}
              displayWidth={contentWidth}
            />
          ) : (
            <View style={styles.mapPlaceholder}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('routeNotRecorded').toUpperCase()}
              </ThemedText>
            </View>
          )}
        </View>

        <View style={[styles.statsCard, { backgroundColor: palette.card }, cardShadow]}>
          <View style={styles.statBlock}>
            <ThemedText type="title" style={{ color: palette.text }}>{(distanceMeters / 1000).toFixed(2)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              km
            </ThemedText>
          </View>
          <View style={styles.statBlock}>
            <ThemedText type="title" style={{ color: palette.text }}>{formatDuration(durationSeconds)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('time').toUpperCase()}
            </ThemedText>
          </View>
          <View style={styles.statBlock}>
            <ThemedText type="title" style={{ color: palette.text }}>{rate}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {(usesSpeed ? t('avgSpeed') : t('pace')).toUpperCase()}
            </ThemedText>
          </View>
          <View style={styles.statBlock}>
            <ThemedText type="title" style={{ color: palette.text }}>+{Math.round(session.elevationGainMeters ?? 0)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('elevation').toUpperCase()}
            </ThemedText>
          </View>
        </View>

        {(session.avgHeartRate != null ||
          session.caloriesBurned != null ||
          session.vo2Max != null ||
          session.oxygenSaturation != null ||
          session.heartRateVariability != null ||
          session.respiratoryRate != null ||
          session.avgCadence != null ||
          session.maxCadence != null) && (
          <View style={[styles.statsCard, { backgroundColor: palette.card }, cardShadow]}>
            {session.avgHeartRate != null && (
              <View style={styles.statBlock}>
                <ThemedText type="title" style={{ color: palette.text }}>{session.avgHeartRate}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('avgHr').toUpperCase()}
                </ThemedText>
              </View>
            )}
            {session.maxHeartRate != null && (
              <View style={styles.statBlock}>
                <ThemedText type="title" style={{ color: palette.text }}>{session.maxHeartRate}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('maxHr').toUpperCase()}
                </ThemedText>
              </View>
            )}
            {session.caloriesBurned != null && (
              <View style={styles.statBlock}>
                <ThemedText type="title" style={{ color: palette.text }}>{Math.round(session.caloriesBurned)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  kcal
                </ThemedText>
              </View>
            )}
            {session.vo2Max != null && (
              <View style={styles.statBlock}>
                <ThemedText type="title" style={{ color: palette.text }}>{session.vo2Max.toFixed(1)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  VO2 Max
                </ThemedText>
              </View>
            )}
            {session.oxygenSaturation != null && (
              <View style={styles.statBlock}>
                <ThemedText type="title" style={{ color: palette.text }}>%{session.oxygenSaturation.toFixed(0)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  SpO2
                </ThemedText>
              </View>
            )}
            {session.heartRateVariability != null && (
              <View style={styles.statBlock}>
                <ThemedText type="title" style={{ color: palette.text }}>{session.heartRateVariability.toFixed(0)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  HRV (ms)
                </ThemedText>
              </View>
            )}
            {session.respiratoryRate != null && (
              <View style={styles.statBlock}>
                <ThemedText type="title" style={{ color: palette.text }}>{session.respiratoryRate.toFixed(1)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('respiratoryRateUnit')}
                </ThemedText>
              </View>
            )}
            {session.avgCadence != null && (
              <View style={styles.statBlock}>
                <ThemedText type="title" style={{ color: palette.text }}>{Math.round(session.avgCadence)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('avgCadence').toUpperCase()}
                </ThemedText>
              </View>
            )}
            {session.maxCadence != null && (
              <View style={styles.statBlock}>
                <ThemedText type="title" style={{ color: palette.text }}>{Math.round(session.maxCadence)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('maxCadence').toUpperCase()}
                </ThemedText>
              </View>
            )}
          </View>
        )}

        {plannedRoute && (
          <View style={[styles.routeProgress, { backgroundColor: palette.card }, cardShadow]}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('route').toUpperCase()} · {Math.round(Math.min(distanceMeters / plannedRoute.distanceMeters, 1) * 100)}% {t('complete').toUpperCase()}
            </ThemedText>
          </View>
        )}

        {heartRateSeries.length >= 2 && (
          <TimeSeriesChart title={t('heartRate').toUpperCase()} unit="BPM" data={heartRateSeries} kind="heartRate" />
        )}
        {speedSeries.length >= 2 && <TimeSeriesChart title={t('speed').toUpperCase()} unit="KM/H" data={speedSeries} kind="speed" />}

        {activityType === 'run' && session.runSeconds != null && (
          <View style={[styles.movementCard, { backgroundColor: palette.card }, cardShadow]}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {t('runWalkBreakdown').toUpperCase()}
            </ThemedText>
            <MovementBar
              runSeconds={session.runSeconds ?? 0}
              walkSeconds={session.walkSeconds ?? 0}
              stoppedSeconds={session.stoppedSeconds ?? 0}
            />
            <View style={styles.movementLegendRow}>
              <MovementLegendItem color={palette.blue} label={t('run').toUpperCase()} seconds={session.runSeconds ?? 0} minutesUnit={t('minutes')} />
              <MovementLegendItem color={palette.border} label={t('walk').toUpperCase()} seconds={session.walkSeconds ?? 0} minutesUnit={t('minutes')} />
              <MovementLegendItem color={palette.raised} label={t('stopped').toUpperCase()} seconds={session.stoppedSeconds ?? 0} minutesUnit={t('minutes')} />
            </View>
          </View>
        )}

        {session.extraData &&
          (() => {
            // Simplified on purpose — the full extra_data dump (every
            // heart-rate zone, every km split) is captured and available in
            // the database, but showing all of it in one big list was
            // cluttered, and worse, several of those entries duplicate a
            // dedicated stat block already shown elsewhere on this exact
            // screen (nabız/kalori/ritim/HRV) once the KNOWN fields are
            // populated. Allowlist instead of blocklist — only genuinely
            // new information that has no other home on this screen.
            const BASIC_EXTRA_LABELS = new Set([
              'Adım sayısı',
              'Ortalama adım (genel)',
              'Performans - aerobik etki skoru',
              'Performans - anaerobik etki skoru',
              'Performans - toparlanma süresi',
              'Performans - tahmini yorgunluk süresi',
              'Tempo - en iyi',
              'Tempo dağılımı - hızlı (yüzde)',
              'Tempo dağılımı - orta (yüzde)',
              'Tempo dağılımı - yavaş (yüzde)',
              'Tur sayısı',
              'Yüzme stilleri',
              'Ortalama pedal ritmi',
              'Maksimum pedal ritmi',
              'Ortalama güç',
              'Maksimum güç',
            ]);
            const entries = Object.entries(JSON.parse(session.extraData) as Record<string, string>).filter(
              ([label, value]) => BASIC_EXTRA_LABELS.has(label) && value && value !== 'yok'
            );
            if (entries.length === 0) return null;
            return (
              <View style={[styles.extraDataCard, { backgroundColor: palette.card }, cardShadow]}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {t('additionalData').toUpperCase()}
                </ThemedText>
                {entries.map(([label, value]) => (
                  <View key={label} style={styles.extraDataRow}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.extraDataLabel}>
                      {label}
                    </ThemedText>
                    <ThemedText type="small">{value}</ThemedText>
                  </View>
                ))}
              </View>
            );
          })()}

        {sourceImageUrl && imageNaturalSize && loadedSourceImage && (
          <>
            {otherImageSections.length > 0 ? (
              otherImageSections.map((section) => (
                <View key={section.label} style={[styles.sourceImageCard, { backgroundColor: palette.card }, cardShadow]}>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sourceImageLabel}>
                    {section.label.toUpperCase()}
                  </ThemedText>
                  <ImageSectionCrop
                    source={loadedSourceImage}
                    naturalSize={imageNaturalSize}
                    startPercent={section.startPercent}
                    endPercent={section.endPercent}
                    displayWidth={contentWidth - Spacing.four * 2}
                    borderRadius={Radius.md}
                  />
                </View>
              ))
            ) : (
              // No section breakdown available (older import, or the model
              // didn't return one) — show the whole screenshot at its real
              // aspect ratio rather than force-squishing it into a fixed box.
              <View style={[styles.sourceImageCard, { backgroundColor: palette.card }, cardShadow]}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sourceImageLabel}>
                  {t('sourceImage').toUpperCase()}
                </ThemedText>
                <Image
                  source={loadedSourceImage}
                  style={{
                    width: contentWidth - Spacing.four * 2,
                    height: ((contentWidth - Spacing.four * 2) * imageNaturalSize.height) / imageNaturalSize.width,
                  }}
                  contentFit="contain"
                />
              </View>
            )}
          </>
        )}
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function formatMinutes(seconds: number, minutesUnit: string): string {
  return `${Math.round(seconds / 60)} ${minutesUnit}`;
}

// Proportional 3-segment bar (koşu/yürüyüş/durma) — same "single accent +
// neutral" palette as the rest of the design system rather than adding new
// chart colors: run gets the accent, walk the existing border tone, stopped
// the existing selected-background tone.
function MovementBar({
  runSeconds,
  walkSeconds,
  stoppedSeconds,
}: {
  runSeconds: number;
  walkSeconds: number;
  stoppedSeconds: number;
}) {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const total = runSeconds + walkSeconds + stoppedSeconds;
  if (total === 0) {
    return null;
  }
  return (
    <View style={[styles.movementBar, { backgroundColor: palette.raised }]}>
      <View style={[styles.movementSegment, { flex: runSeconds, backgroundColor: palette.blue }]} />
      <View style={[styles.movementSegment, { flex: walkSeconds, backgroundColor: palette.border }]} />
      <View style={[styles.movementSegment, { flex: stoppedSeconds, backgroundColor: palette.raised }]} />
    </View>
  );
}

function MovementLegendItem({ color, label, seconds, minutesUnit }: { color: string; label: string; seconds: number; minutesUnit: string }) {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  if (seconds <= 0) {
    return null;
  }
  return (
    <View style={styles.movementLegendItem}>
      <View style={[styles.movementLegendDot, { backgroundColor: color }]} />
      <ThemedText type="small" themeColor="textSecondary">
        {label} {formatMinutes(seconds, minutesUnit)}
      </ThemedText>
    </View>
  );
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  scrollContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleInput: {
    fontSize: 22,
    fontFamily: Fonts.semiBold,
    textAlign: 'center',
    minWidth: 140,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 2,
  },
  noteToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
  },
  noteInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  mapCard: {
    // Was flex: 1 back when this card's parent was a plain bounded-height
    // SafeAreaView — now that everything below the header lives inside a
    // ScrollView (see scrollContent), flex: 1 has no bounded cross-axis to
    // resolve against and collapses toward zero height. Fixed height instead.
    height: 280,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  mapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeShapeBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    rowGap: Spacing.three,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.three,
  },
  statBlock: {
    alignItems: 'center',
    gap: Spacing.half,
    minWidth: 70,
  },
  routeProgress: {
    alignSelf: 'center',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    marginBottom: Spacing.three,
  },
  extraDataCard: {
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  extraDataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  extraDataLabel: {
    flexShrink: 1,
  },
  sourceImageCard: {
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  sourceImageLabel: {
    textAlign: 'center',
  },
  movementCard: {
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  movementBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  movementSegment: {
    height: '100%',
  },
  movementLegendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  movementLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  movementLegendDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
});

function cardShadowFor(palette: ReturnType<typeof useNutritionPalette>) {
  return palette === nutritionPaletteLight
    ? { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 }
    : {};
}

import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/route-map';
import type { RouteMapHandle } from '@/components/route-map.types';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { nutritionPaletteLight, PaletteText as ThemedText, useNutritionPalette } from '@/components/nutrition-ui';
import { useCardioSession, useFinishCardioSession } from '@/db/queries/cardio';
import { useRunRoute } from '@/db/queries/routes';
import { activityTypeUsesSpeed, getActivityTypeLabel } from '@/lib/activity-type';
import { appendAcceptedPoints, BACKGROUND_LOCATION_TASK, lastRawFix, reportRawFix } from '@/lib/background-location';
import type { LatLng } from '@/lib/directions';
import { formatDuration, formatPace, formatSpeed, totalDistance, totalElevationGain, type RoutePoint } from '@/lib/geo';
import { useT } from '@/lib/i18n';
import { softSheet } from '@/constants/soft-sheet';

export default function LiveRunScreen() {
  const { t, language } = useT();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const id = sessionId;
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const cardShadow = cardShadowFor(palette);
  const finishSession = useFinishCardioSession();
  const mapRef = useRef<RouteMapHandle>(null);
  const lastCenteredRef = useRef<{ lat: number; lng: number } | null>(null);

  const { data: session } = useCardioSession(id, { live: true });
  const activityType = session?.activityType ?? 'run';
  const activityLabel = getActivityTypeLabel(activityType, language);
  const usesSpeed = activityTypeUsesSpeed(activityType);
  const { data: plannedRoute } = useRunRoute(session?.plannedRouteId ?? null);
  const plannedRoutePoints: LatLng[] = plannedRoute?.points ? JSON.parse(plannedRoute.points) : [];
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [backgroundLocationUnavailable, setBackgroundLocationUnavailable] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [initialFix, setInitialFix] = useState<RoutePoint | null>(null);
  const mapReadyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      const foreground = await Location.requestForegroundPermissionsAsync();
      if (cancelled || foreground.status !== 'granted') {
        setPermissionDenied(true);
        return;
      }

      // Show a cached fix immediately (near-instant) so the map never opens
      // centered on nothing, then replace it once the watcher below delivers
      // a fresh fix (can take a few seconds on cold GPS).
      Location.getLastKnownPositionAsync()
        .then((location) => {
          if (!cancelled && location) {
            setInitialFix({
              lat: location.coords.latitude,
              lng: location.coords.longitude,
              timestamp: location.timestamp,
            });
          }
        })
        .catch(() => {});

      // Foreground watcher — independent of the background TaskManager task
      // below. Some Android devices/manufacturers are unreliable about
      // actually delivering background location updates even when the
      // foreground-service notification shows; this runs directly in the
      // screen's own lifecycle (screen on, app open) and writes into the
      // same route via the same accept/reject rules, so the run tracks
      // correctly whichever path actually gets fixes through.
      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 5 },
        (location) => {
          if (cancelled) {
            return;
          }
          setInitialFix({
            lat: location.coords.latitude,
            lng: location.coords.longitude,
            timestamp: location.timestamp,
            altitude: location.coords.altitude,
          });
          reportRawFix(location.coords.accuracy ?? null, id);
          appendAcceptedPoints(id, [location]).catch(() => {});
        }
      )
        .then((sub) => {
          if (cancelled) {
            sub.remove();
            return;
          }
          subscription = sub;
        })
        .catch((error) => console.warn('Ön plan konum takibi başlatılamadı:', error));

      const background = await Location.requestBackgroundPermissionsAsync();
      if (background.status !== 'granted') {
        // Not fatal — the foreground watcher above still tracks while this
        // screen stays open and visible. But if the phone gets locked or
        // the app backgrounds for any stretch of the run, nothing records
        // during that stretch and the route silently comes out short (or
        // empty) with no error anywhere. Telling the user up front is the
        // only way this doesn't look like an unexplained missing route
        // after the fact.
        if (!cancelled) {
          setBackgroundLocationUnavailable(true);
        }
        return;
      }
      try {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 3000,
          distanceInterval: 5,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: `${activityLabel} ${t('isBeingTracked')}`,
            notificationBody: t('yourRouteIsBeingRecorded'),
          },
        });
      } catch (error) {
        console.warn('Konum takibi başlatılamadı:', error);
        if (!cancelled) {
          setBackgroundLocationUnavailable(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
      Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => {});
    };
  }, [id, activityLabel]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const points: RoutePoint[] = session?.route ? JSON.parse(session.route) : [];
  const distanceMeters = totalDistance(points);
  const elevationGainMeters = totalElevationGain(points);
  const elapsedSeconds = session ? Math.floor((now - new Date(session.startedAt).getTime()) / 1000) : 0;

  const currentPoint = points[points.length - 1] ?? initialFix;
  const hasPlannedRoute = plannedRoutePoints.length > 1;

  const centerOn = (point: RoutePoint) => {
    lastCenteredRef.current = { lat: point.lat, lng: point.lng };
    mapRef.current?.animateCameraTo(point);
  };

  // With a planned route selected, the runner only cares about the route and
  // their progress along it — not an arbitrary live-position camera that
  // fights their own panning/zooming. So: fit to the full route once and
  // leave the camera alone from then on. Without a route, keep the original
  // "follow me" behavior (recenter on every new tracked point).
  //
  // On Android, calling fitToCoordinates right as the map becomes ready
  // frequently no-ops silently — the native view hasn't finished laying out
  // to its final size yet, so the coordinate->region math has nothing to work
  // with. A short delay is the standard workaround.
  const fitToPlannedRoute = () => {
    if (!hasPlannedRoute) {
      return;
    }
    setTimeout(() => {
      mapRef.current?.fitToPoints(plannedRoutePoints, { top: 100, right: 60, bottom: 280, left: 60 });
    }, 300);
  };

  const routeFitDoneRef = useRef(false);

  useEffect(() => {
    if (!mapReadyRef.current || routeFitDoneRef.current || !hasPlannedRoute) {
      return;
    }
    fitToPlannedRoute();
    routeFitDoneRef.current = true;
  }, [hasPlannedRoute]);

  useEffect(() => {
    if (!mapReadyRef.current || hasPlannedRoute || !currentPoint) {
      return;
    }
    const last = lastCenteredRef.current;
    if (last && last.lat === currentPoint.lat && last.lng === currentPoint.lng) {
      return;
    }
    centerOn(currentPoint);
  }, [currentPoint, hasPlannedRoute]);

  const handleMapReady = () => {
    mapReadyRef.current = true;
    if (hasPlannedRoute) {
      fitToPlannedRoute();
      routeFitDoneRef.current = true;
      return;
    }
    if (currentPoint) {
      centerOn(currentPoint);
    }
  };

  const performFinish = async () => {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => {});
    await finishSession.mutateAsync(id);
    // router.back() used to just return to wherever the run was
    // started from (e.g. Bugün) — never actually showed the finished
    // run at all, unlike the equivalent workout finish flow. replace
    // (not push) so the live-tracking screen isn't left underneath
    // in the stack, matching run/manual.tsx's own navigation after
    // creating a session.
    router.replace({ pathname: '/run/summary/[id]', params: { id: String(id) } });
  };

  const finish = () => {
    // Alert.alert() is a no-op on react-native-web — see nutrition/log/[id].tsx.
    // Without this branch, finishing a run was completely inaccessible on
    // web (the confirm dialog never appeared, not just "didn't save").
    // "${label} oturumunu bitirmek..." rather than inflecting the label
    // itself (Koşuyu/Bisikleti/Motoru/Yüzmeyi all take different Turkish
    // accusative suffixes) — "oturumunu" stays grammatically correct no
    // matter which label precedes it.
    const confirmMessage = language === 'tr'
      ? `${activityLabel} oturumunu bitirmek istediğine emin misin?`
      : `Are you sure you want to finish this ${activityLabel.toLowerCase()}?`;
    const title = `${t('finish')} ${activityLabel}`;
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${confirmMessage}`)) {
        performFinish();
      }
      return;
    }
    Alert.alert(title, confirmMessage, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('finish'), style: 'destructive', onPress: performFinish },
    ]);
  };

  return (
    <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.container}>
      {permissionDenied ? (
        <SafeAreaView style={styles.deniedContainer}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.deniedText}>
            {t('locationAccessRequiredToTrack').toUpperCase()} {activityLabel.toUpperCase()}. {t('enableInDeviceSettingsRetry').toUpperCase()}
          </ThemedText>
          <Pressable onPress={() => router.back()} style={[styles.finishButton, { backgroundColor: palette.blue }]}>
            <ThemedText type="smallBold" style={{ color: palette.background }}>
              {t('goBack').toUpperCase()}
            </ThemedText>
          </Pressable>
        </SafeAreaView>
      ) : (
        <>
          <RouteMap
            ref={mapRef}
            style={styles.map}
            showsUserLocation
            accentColor={palette.blue}
            onMapReady={handleMapReady}
            initialRegion={{
              latitude: currentPoint?.lat ?? 41.0082,
              longitude: currentPoint?.lng ?? 28.9784,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            polylines={[
              ...(hasPlannedRoute ? [{ points: plannedRoutePoints, color: palette.blue, width: 4, showEndpoints: true }] : []),
              ...(points.length > 1 ? [{ points, color: palette.blue, width: 4, showEndpoints: true }] : []),
            ]}
          />

          <SafeAreaView style={styles.overlay} pointerEvents="box-none">
            <Pressable
              accessibilityLabel={t('close')}
              onPress={() => router.back()}
              hitSlop={10}
              style={[styles.closeButton, { backgroundColor: palette.background }, cardShadow]}>
              <ThemedText style={styles.closeSymbol}>×</ThemedText>
            </Pressable>

            <View style={styles.bottomSheet}>
              <View style={[styles.statsCard, { backgroundColor: palette.background }, cardShadow]}>
                <View style={styles.statBlock}>
                  <ThemedText type="title">{(distanceMeters / 1000).toFixed(2)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    km
                  </ThemedText>
                </View>
                <View style={styles.statBlock}>
                  <ThemedText type="title">{formatDuration(elapsedSeconds)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('time').toUpperCase()}
                  </ThemedText>
                </View>
                <View style={styles.statBlock}>
                  <ThemedText type="title">
                    {usesSpeed ? formatSpeed(distanceMeters, elapsedSeconds) : formatPace(distanceMeters, elapsedSeconds)}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {(usesSpeed ? t('avgSpeed') : t('pace')).toUpperCase()}
                  </ThemedText>
                </View>
                <View style={styles.statBlock}>
                  <ThemedText type="title">+{Math.round(elevationGainMeters)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('elevation').toUpperCase()}
                  </ThemedText>
                </View>
              </View>

              {backgroundLocationUnavailable && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.gpsDebugText}>
                  {t('backgroundLocationOffWarning').toUpperCase()}
                </ThemedText>
              )}

              {lastRawFix && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.gpsDebugText}>
                  GPS ±{lastRawFix.accuracy != null ? Math.round(lastRawFix.accuracy) : '?'}M ·{' '}
                  {Math.max(0, Math.round((now - lastRawFix.capturedAt) / 1000))}S AGO
                  {lastRawFix.targetSessionId != null && lastRawFix.targetSessionId !== id
                    ? ` · WARNING: OTHER SESSION (#${lastRawFix.targetSessionId})`
                    : ''}
                </ThemedText>
              )}

              {plannedRoute && (
                <View style={[styles.routeProgress, { backgroundColor: palette.background }, cardShadow]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('route').toUpperCase()} · {Math.round(Math.min(distanceMeters / plannedRoute.distanceMeters, 1) * 100)}% {t('complete').toUpperCase()}
                  </ThemedText>
                </View>
              )}

              {Platform.OS === 'web' && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.webNotice}>
                  {t('webTrackingOnlyWhileOpen').toUpperCase()}
                </ThemedText>
              )}

              <Pressable onPress={finish} style={[styles.finishButton, { backgroundColor: palette.blue }]}>
                <ThemedText type="smallBold" style={{ color: palette.background }}>
                  {t('finish').toUpperCase()} {activityLabel.toUpperCase()}
                </ThemedText>
              </Pressable>
            </View>
          </SafeAreaView>
        </>
      )}
    </ThemedView>
  );
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => softSheet({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  map: StyleSheet.absoluteFill,
  deniedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  deniedText: {
    textAlign: 'center',
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeSymbol: { color: palette.text, fontFamily: Fonts.technical, fontSize: 24, lineHeight: 26 },
  bottomSheet: {
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  statsCard: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderRadius: Radius.lg,
    paddingVertical: Spacing.four,
  },
  statBlock: {
    alignItems: 'center',
    gap: Spacing.half,
  },
  gpsDebugText: {
    textAlign: 'center',
  },
  webNotice: {
    textAlign: 'center',
  },
  routeProgress: {
    alignSelf: 'center',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  finishButton: {
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
});

function cardShadowFor(palette: ReturnType<typeof useNutritionPalette>) {
  return palette === nutritionPaletteLight
    ? { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 }
    : {};
}

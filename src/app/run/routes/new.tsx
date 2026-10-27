import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/route-map';
import type { RouteMapPressEvent } from '@/components/route-map.types';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { nutritionPaletteLight, PaletteText as ThemedText, useNutritionPalette } from '@/components/nutrition-ui';
import { useAddRunRoute } from '@/db/queries/routes';
import { DirectionsError, fetchWalkingRoute, type LatLng } from '@/lib/directions';
import { useT } from '@/lib/i18n';
import { TextInput } from '@/components/text-input';
import { softSheet } from '@/constants/soft-sheet';

function WebNotAvailable() {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { t } = useT();
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.webNoticeContainer}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.webNoticeText}>
          {t('routeDrawingNativeOnly').toUpperCase()}
        </ThemedText>
        <Pressable accessibilityLabel={t('close')} onPress={() => router.back()} style={[styles.closeButton, { backgroundColor: palette.card }]}>
          <ThemedText style={styles.symbol}>×</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

export default function NewRunRouteScreen() {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { t } = useT();
  const cardShadow = cardShadowFor(palette);
  const addRunRoute = useAddRunRoute();

  const [initialRegion, setInitialRegion] = useState({
    latitude: 41.0082,
    longitude: 28.9784,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  });
  const [points, setPoints] = useState<LatLng[]>([]);
  const [routePoints, setRoutePoints] = useState<LatLng[] | null>(null);
  const [routeDistanceMeters, setRouteDistanceMeters] = useState(0);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      // No map to draw on here (see the early return below) — skip asking
      // for a permission this screen can't use.
      return;
    }
    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        return;
      }
      const location = await Location.getLastKnownPositionAsync().catch(() => null);
      if (location) {
        setInitialRegion((prev) => ({
          ...prev,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        }));
      }
    })();
  }, []);

  const handleMapPress = (event: RouteMapPressEvent) => {
    if (routePoints) {
      return;
    }
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setPoints((prev) => [...prev, { lat: latitude, lng: longitude }]);
  };

  const undoLastPoint = () => {
    setPoints((prev) => prev.slice(0, -1));
  };

  const reset = () => {
    setPoints([]);
    setRoutePoints(null);
    setRouteDistanceMeters(0);
    setError(null);
    setName('');
  };

  const createRoute = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWalkingRoute(points);
      setRoutePoints(result.points);
      setRouteDistanceMeters(result.distanceMeters);
    } catch (err) {
      setError(err instanceof DirectionsError ? err.message : t('couldNotCreateRoute'));
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!routePoints || !name.trim()) {
      return;
    }
    await addRunRoute.mutateAsync({
      name: name.trim(),
      points: routePoints,
      distanceMeters: routeDistanceMeters,
    });
    router.back();
  };

  if (Platform.OS === 'web') {
    return <WebNotAvailable />;
  }

  return (
    <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.container}>
      <RouteMap
        style={styles.map}
        showsUserLocation
        accentColor={palette.blue}
        initialRegion={initialRegion}
        onPress={handleMapPress}
        markers={points}
        polylines={[
          ...(!routePoints && points.length > 1
            ? [{ points, color: palette.muted, width: 3, dashed: true }]
            : []),
          ...(routePoints ? [{ points: routePoints, color: palette.blue, width: 4 }] : []),
        ]}
      />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <Pressable
          accessibilityLabel={t('close')}
          onPress={() => router.back()}
          hitSlop={10}
          style={[styles.closeButton, { backgroundColor: palette.background }, cardShadow]}>
          <ThemedText style={styles.symbol}>×</ThemedText>
        </Pressable>

        <View style={[styles.bottomSheet, { backgroundColor: palette.background }, cardShadow]}>
          {routePoints ? (
            <>
              <ThemedText type="smallBold">{t('routeReady').toUpperCase()} {(routeDistanceMeters / 1000).toFixed(2)} KM</ThemedText>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t('routeNamePlaceholder')}
                placeholderTextColor={palette.muted}
                autoFocus
                style={[styles.nameInput, { color: palette.text, borderColor: palette.border }]}
              />
              <View style={styles.buttonRow}>
                <Pressable onPress={reset} style={[styles.secondaryButton, { borderColor: palette.border }]}>
                  <ThemedText type="small">{t('redraw').toUpperCase()}</ThemedText>
                </Pressable>
                <Pressable
                  onPress={save}
                  disabled={!name.trim() || addRunRoute.isPending}
                  style={[
                    styles.primaryButton,
                    { backgroundColor: palette.blue, opacity: !name.trim() || addRunRoute.isPending ? 0.6 : 1 },
                  ]}>
                  {addRunRoute.isPending ? (
                    <ActivityIndicator color={palette.background} />
                  ) : (
                    <ThemedText type="smallBold" style={{ color: palette.background }}>
                      {t('saveRoute').toUpperCase()}
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                {points.length === 0
                  ? t('tapMapToPlaceRoutePoints').toUpperCase()
                  : `${points.length} ${t('pointsSelectedSuffix').toUpperCase()}`}
              </ThemedText>
              {error && (
                <ThemedText type="small" style={{ color: palette.red }}>
                  {error}
                </ThemedText>
              )}
              <View style={styles.buttonRow}>
                <Pressable
                  onPress={undoLastPoint}
                  disabled={points.length === 0}
                  style={[styles.secondaryButton, { borderColor: palette.border, opacity: points.length === 0 ? 0.5 : 1 }]}>
                  <ThemedText type="small">{t('undoPoint').toUpperCase()}</ThemedText>
                </Pressable>
                <Pressable
                  onPress={reset}
                  disabled={points.length === 0}
                  style={[styles.secondaryButton, { borderColor: palette.border, opacity: points.length === 0 ? 0.5 : 1 }]}>
                  <ThemedText type="small">{t('reset').toUpperCase()}</ThemedText>
                </Pressable>
              </View>
              <Pressable
                onPress={createRoute}
                disabled={points.length < 2 || loading}
                style={[
                  styles.primaryButton,
                  { backgroundColor: palette.blue, opacity: points.length < 2 || loading ? 0.5 : 1 },
                ]}>
                {loading ? (
                  <ActivityIndicator color={palette.background} />
                ) : (
                  <ThemedText type="smallBold" style={{ color: palette.background }}>
                    {t('createRoute').toUpperCase()}
                  </ThemedText>
                )}
              </Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => softSheet({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  map: StyleSheet.absoluteFill,
  webNoticeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  webNoticeText: {
    textAlign: 'center',
    color: palette.muted,
    fontFamily: Fonts.technical,
    fontSize: 10,
    letterSpacing: 0.6,
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
  symbol: { color: palette.text, fontFamily: Fonts.technical, fontSize: 22, lineHeight: 25 },
  bottomSheet: {
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  nameInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
  },
});

function cardShadowFor(palette: ReturnType<typeof useNutritionPalette>) {
  return palette === nutritionPaletteLight
    ? { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 }
    : {};
}

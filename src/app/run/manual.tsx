import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { PaletteText as ThemedText, useNutritionPalette } from '@/components/nutrition-ui';
import { ScreenHeader } from '@/components/screen-header';
import { useAddManualCardioSession } from '@/db/queries/cardio';
import { alertMessage } from '@/lib/alert';
import { isActivityType, type ActivityType } from '@/lib/activity-type';
import { addDaysToDateString, formatDayMonth, getTodayDateString } from '@/lib/date';
import { DirectionsError, fetchWalkingRoute, type LatLng } from '@/lib/directions';
import { useT } from '@/lib/i18n';
import { PlacesError, searchPlaces, getPlaceLocation, type PlaceSuggestion } from '@/lib/places';
import { TextInput } from '@/components/text-input';
import { KEYBOARD_BAR_CLEARANCE } from '@/components/keyboard-done-bar';

type PickedPlace = LatLng & { text: string };

function readWebInputValue(event: unknown) {
  const inputEvent = event as { nativeEvent?: { text?: string }; target?: { value?: string } };
  return inputEvent.target?.value ?? inputEvent.nativeEvent?.text ?? '';
}

export default function AddManualRunScreen() {
  const { t } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { date: dateParam, activityType: activityTypeParam } = useLocalSearchParams<{ date?: string; activityType?: string }>();
  const activityType: ActivityType = activityTypeParam && isActivityType(activityTypeParam) ? activityTypeParam : 'run';
  const addManualSession = useAddManualCardioSession();

  const [date, setDate] = useState(dateParam ?? getTodayDateString());
  const [name, setName] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [notes, setNotes] = useState('');
  const [startPlace, setStartPlace] = useState<PickedPlace | null>(null);
  const [endPlace, setEndPlace] = useState<PickedPlace | null>(null);
  const [routing, setRouting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const durationSeconds = (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60;
  const canSave = durationSeconds > 0 && !addManualSession.isPending && !routing;
  const isToday = date === getTodayDateString();

  const save = async () => {
    setSaveError(`Save tapped · ${durationSeconds}s · ${canSave ? 'ready' : 'disabled'}`);
    if (!canSave) {
      return;
    }
    setSaveError('Saving activity…');

    // Neither point given: no route to compute, unchanged from before this
    // feature existed. One point: nothing to connect it to, just mark it.
    // Both points: a real walking route between them (same Directions call
    // routes/new.tsx uses for planned routes) — not Kağan's actual GPS
    // trace, but a real route, not a straight line.
    let route: LatLng[] | null = null;
    let routeDistanceMeters: number | null = null;
    if (startPlace && endPlace) {
      setRouting(true);
      try {
        const result = await fetchWalkingRoute([startPlace, endPlace]);
        route = result.points;
        routeDistanceMeters = result.distanceMeters;
      } catch (error) {
        setRouting(false);
        alertMessage(t('routeUnavailable'), error instanceof DirectionsError ? error.message : t('unexpectedError'));
        return;
      }
      setRouting(false);
    } else if (startPlace ?? endPlace) {
      route = [startPlace ?? endPlace!];
    }

    try {
      const session = await addManualSession.mutateAsync({
        date,
        name: name.trim() || undefined,
        notes: notes.trim() || undefined,
        durationSeconds,
        // A computed route's own distance wins over the typed value, since
        // it's an actual measured path rather than a guess — but only when
        // the person didn't already type one themselves.
        distanceMeters: routeDistanceMeters ?? (distanceKm ? Number(distanceKm.replace(',', '.')) * 1000 : null),
        route: route ? JSON.stringify(route) : undefined,
        activityType,
      });
      setSaveError(null);
      router.replace({ pathname: '/run/summary/[id]', params: { id: String(session.id) } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save activity.';
      setSaveError(message);
    }
  };

  return (
    <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          onBack={() => router.back()}
          eyebrow={t('activity').toUpperCase()}
          title={t('logPastActivity').toUpperCase()}
          subtitle={t('recordActivityNotTracked').toUpperCase()}
          accentColor={palette.green}
        />

        <KeyboardAwareScrollView bottomOffset={KEYBOARD_BAR_CLEARANCE} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('date').toUpperCase()}
            </ThemedText>
            <View style={styles.dateStepper}>
              <Pressable
                accessibilityLabel="Previous day"
                onPress={() => setDate((d) => addDaysToDateString(d, -1))}
                hitSlop={10}
                style={[styles.stepperButton, { backgroundColor: palette.card }]}>
                <ThemedText style={styles.symbol}>&lt;</ThemedText>
              </Pressable>
              <ThemedText type="smallBold" style={styles.dateValue}>
                {formatDayMonth(date)}
              </ThemedText>
              <Pressable
                accessibilityLabel="Next day"
                onPress={() => !isToday && setDate((d) => addDaysToDateString(d, 1))}
                hitSlop={10}
                disabled={isToday}
                style={[styles.stepperButton, { backgroundColor: palette.card, opacity: isToday ? 0.4 : 1 }]}>
                <ThemedText style={styles.symbol}>&gt;</ThemedText>
              </Pressable>
            </View>
          </View>

          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('duration').toUpperCase()}
            </ThemedText>
            <View style={styles.durationRow}>
              <TextInput
                value={hours}
                onChangeText={setHours}
                onChange={(event) => setHours(readWebInputValue(event))}
                placeholder="0"
                placeholderTextColor={palette.muted}
                keyboardType="number-pad"
                style={[styles.durationInput, { color: palette.text, borderColor: palette.border }]}
              />
              <ThemedText type="default">{t('hours').toUpperCase()}</ThemedText>
              <TextInput
                value={minutes}
                onChangeText={setMinutes}
                onChange={(event) => setMinutes(readWebInputValue(event))}
                placeholder="0"
                placeholderTextColor={palette.muted}
                keyboardType="number-pad"
                style={[styles.durationInput, { color: palette.text, borderColor: palette.border }]}
              />
              <ThemedText type="default">{t('minutes').toUpperCase()}</ThemedText>
            </View>
          </View>

          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('distance').toUpperCase()} · {(startPlace && endPlace ? t('filledFromRoute') : t('optional')).toUpperCase()}
            </ThemedText>
            <View style={styles.durationRow}>
              <TextInput
                value={distanceKm}
                onChangeText={setDistanceKm}
                onChange={(event) => setDistanceKm(readWebInputValue(event))}
                placeholder="—"
                placeholderTextColor={palette.muted}
                keyboardType="decimal-pad"
                editable={!(startPlace && endPlace)}
                style={[
                  styles.durationInput,
                  { color: palette.text, borderColor: palette.border, opacity: startPlace && endPlace ? 0.5 : 1 },
                ]}
              />
              <ThemedText type="default">km</ThemedText>
            </View>
          </View>

          {Platform.OS === 'web' ? (
            // Google's legacy Places API (what's currently enabled for this
            // project) blocks direct browser calls via CORS — curl works,
            // fetch() from a page doesn't ("Failed to fetch", confirmed live).
            // Native has no such restriction, so this is web-only, same as
            // the other map features tonight (run/[sessionId].tsx,
            // run/routes/new.tsx).
            <ThemedText type="small" themeColor="textSecondary">
              {t('placeSearchMobileOnly').toUpperCase()}
            </ThemedText>
          ) : (
            <>
              <PlaceSearchInput
                label={t('startPlaceOptional').toUpperCase()}
                placeholder={t('searchPlace')}
                value={startPlace}
                onChange={setStartPlace}
              />
              <PlaceSearchInput
                label={t('endPlaceOptional').toUpperCase()}
                placeholder={t('searchPlace')}
                value={endPlace}
                onChange={setEndPlace}
              />
              {(startPlace || endPlace) && !(startPlace && endPlace) && (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('onePlaceMarkerHint').toUpperCase()}
                </ThemedText>
              )}
            </>
          )}

          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('titleOptional').toUpperCase()}
            </ThemedText>
            <TextInput
              value={name}
              onChangeText={setName}
              onChange={(event) => setName(readWebInputValue(event))}
              placeholder={formatDayMonth(date)}
              placeholderTextColor={palette.muted}
              style={[styles.titleInput, { color: palette.text, borderColor: palette.border }]}
            />
          </View>

          <Pressable onPress={() => setShowNote((s) => !s)} style={styles.noteToggle} hitSlop={8}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('addNote').toUpperCase()} {showNote ? '−' : '+'}
            </ThemedText>
          </Pressable>
          {showNote && (
            <TextInput
              value={notes}
              onChangeText={setNotes}
              onChange={(event) => setNotes(readWebInputValue(event))}
              placeholder={t('activityNotes')}
              placeholderTextColor={palette.muted}
              style={[styles.noteInput, { color: palette.text, borderColor: palette.border }]}
              multiline
            />
          )}
        </KeyboardAwareScrollView>

        {Platform.OS === 'web' ? (
          <button
            type="button"
            aria-label={t('save')}
            onClick={save}
            disabled={!canSave}
            style={{
              minHeight: 52,
              height: 52,
              width: '100%',
              boxSizing: 'border-box',
              paddingTop: 0,
              paddingBottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              borderRadius: Radius.md,
              marginBottom: Spacing.three,
              backgroundColor: palette.blue,
              color: palette.background,
              opacity: canSave ? 1 : 0.5,
            } as CSSProperties}
          >
            {routing ? '…' : t('save')}
          </button>
        ) : (
          <Pressable
            onPress={save}
            disabled={!canSave}
            style={[styles.saveButton, { backgroundColor: palette.blue, opacity: canSave ? 1 : 0.5 }]}
          >
            {routing ? (
              <ActivityIndicator color={palette.background} />
            ) : (
              <ThemedText type="smallBold" style={{ color: palette.background }}>
                {t('save')}
              </ThemedText>
            )}
          </Pressable>
        )}
        {saveError && <ThemedText type="small" themeColor="textSecondary" style={styles.saveStatus}>{saveError}</ThemedText>}
      </SafeAreaView>
    </ThemedView>
  );
}

function PlaceSearchInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: PickedPlace | null;
  onChange: (value: PickedPlace | null) => void;
}) {
  const { t } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (value || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timeout = setTimeout(() => {
      searchPlaces(query)
        .then((results) => {
          if (!cancelled) {
            setSuggestions(results);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSuggestions([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSearching(false);
          }
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, value]);

  const selectSuggestion = async (suggestion: PlaceSuggestion) => {
    setSuggestions([]);
    setResolving(true);
    try {
      const location = await getPlaceLocation(suggestion.placeId);
      onChange({ text: suggestion.text, ...location });
      setQuery('');
    } catch (error) {
      alertMessage(t('placeUnavailable'), error instanceof PlacesError ? error.message : t('unexpectedError'));
    } finally {
      setResolving(false);
    }
  };

  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      {value ? (
        <View style={[styles.placeSelected, { borderColor: palette.border }]}>
          <ThemedText style={styles.symbol}>•</ThemedText>
          <ThemedText type="small" style={styles.placeSelectedText} numberOfLines={1}>
            {value.text}
          </ThemedText>
          <Pressable accessibilityLabel={t('removePlace')} onPress={() => onChange(null)} hitSlop={8}>
            <ThemedText style={styles.symbol}>×</ThemedText>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.placeInputRow}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={placeholder}
              placeholderTextColor={palette.muted}
              style={[styles.titleInput, styles.placeInput, { color: palette.text, borderColor: palette.border }]}
            />
            {(searching || resolving) && <ActivityIndicator size="small" color={palette.muted} />}
          </View>
          {suggestions.length > 0 && (
            <View style={[styles.suggestionList, { borderColor: palette.border, backgroundColor: palette.card }]}>
              {suggestions.map((s) => (
                <Pressable
                  key={s.placeId}
                  onPress={() => selectSuggestion(s)}
                  style={({ pressed }) => [styles.suggestionRow, { opacity: pressed ? 0.7 : 1 }]}>
                  <ThemedText type="small">{s.text}</ThemedText>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
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
    paddingBottom: Spacing.three,
  },
  symbol: { color: palette.text, fontFamily: Fonts.technical, fontSize: 20, lineHeight: 23 },
  field: {
    gap: Spacing.one,
  },
  dateStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateValue: {
    minWidth: 120,
    textAlign: 'center',
  },
  saveStatus: { textAlign: 'center', marginTop: -Spacing.two },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  durationInput: {
    width: 64,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
    textAlign: 'center',
  },
  titleInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  placeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  placeInput: {
    flex: 1,
  },
  placeSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  placeSelectedText: {
    flex: 1,
  },
  suggestionList: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  suggestionRow: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
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
  spacer: {
    flex: 1,
  },
  saveButton: {
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
});

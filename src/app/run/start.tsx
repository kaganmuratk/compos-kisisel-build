import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SwipeableRow } from '@/components/swipeable-row';
import { useNutritionPalette } from '@/components/nutrition-ui';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useStartCardioSession, useTodayCardioSessionCount } from '@/db/queries/cardio';
import { useDeleteRunRoute, useRunRoutes } from '@/db/queries/routes';
import { ACTIVITY_TYPE_LABELS, isActivityType } from '@/lib/activity-type';
import { defaultSessionTitle, getTodayDateString } from '@/lib/date';
import { useT } from '@/lib/i18n';
import { TextInput } from '@/components/text-input';
import { KEYBOARD_BAR_CLEARANCE } from '@/components/keyboard-done-bar';
import { softSheet } from '@/constants/soft-sheet';

export default function StartRunScreen() {
  const { t } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { activityType: activityTypeParam } = useLocalSearchParams<{ activityType?: string }>();
  const activityType = activityTypeParam && isActivityType(activityTypeParam) ? activityTypeParam : 'run';
  const activityLabel = ACTIVITY_TYPE_LABELS[activityType];
  const { data: todayCount } = useTodayCardioSessionCount();
  const { data: routes = [] } = useRunRoutes();
  const deleteRoute = useDeleteRunRoute();
  const startCardioSession = useStartCardioSession();
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [notes, setNotes] = useState('');
  const [showRoutes, setShowRoutes] = useState(false);
  const [routeId, setRouteId] = useState<string | null>(null);

  useEffect(() => { if (!nameTouched && todayCount !== undefined) setName(defaultSessionTitle(getTodayDateString(), todayCount)); }, [todayCount, nameTouched]);
  const selectedRoute = routes.find((route) => route.id === routeId);
  const start = async () => {
    const session = await startCardioSession.mutateAsync({ name: name.trim() || undefined, notes: notes.trim() || undefined, plannedRouteId: routeId ?? undefined, activityType });
    if (session) router.replace({ pathname: '/run/[sessionId]', params: { sessionId: String(session.id) } });
  };

  return <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.container}><SafeAreaView style={styles.safeArea} edges={['top']}>
    <ScreenHeader onBack={() => router.back()} eyebrow={t('activity').toUpperCase()} title={`${t('start').toUpperCase()} ${activityLabel.toUpperCase()}`} accentColor={palette.green} />
    <KeyboardAwareScrollView bottomOffset={KEYBOARD_BAR_CLEARANCE} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.fieldCard}><ThemedText style={styles.fieldLabel}>{t('activityName').toUpperCase()}</ThemedText><TextInput value={name} onChangeText={(text) => { setName(text); setNameTouched(true); }} placeholder={t('activityName')} placeholderTextColor={palette.muted} style={styles.titleInput} /></View>
      {activityType === 'run' && <><Pressable onPress={() => setShowRoutes((visible) => !visible)} style={styles.disclosure}><View><ThemedText style={styles.fieldLabel}>{t('route').toUpperCase()}</ThemedText><ThemedText style={styles.disclosureValue}>{selectedRoute ? selectedRoute.name : t('noRouteSelected').toUpperCase()}</ThemedText></View><ThemedText style={styles.disclosureAction}>{showRoutes ? '−' : '+'}</ThemedText></Pressable>
      {showRoutes && <View style={styles.optionPanel}><Pressable onPress={() => router.push('/run/routes/new')} style={styles.newRoute}><ThemedText style={styles.newRouteText}>+ CREATE ROUTE</ThemedText></Pressable>{routes.length === 0 ? <ThemedText style={styles.empty}>NO SAVED ROUTES.</ThemedText> : routes.map((route) => { const selected = route.id === routeId; return <SwipeableRow key={route.id} onDelete={() => { if (selected) setRouteId(null); deleteRoute.mutate(route.id); }} confirmTitle="Delete route" confirmMessage={`"${route.name}" will be permanently removed.`}><Pressable onPress={() => setRouteId(selected ? null : route.id)} style={[styles.routeRow, selected && styles.routeRowSelected]}><ThemedText style={[styles.optionMark, selected && styles.optionMarkSelected]}>{selected ? '✓' : '○'}</ThemedText><View style={styles.routeInfo}><ThemedText style={styles.optionText}>{route.name}</ThemedText><ThemedText style={styles.routeDistance}>{(route.distanceMeters / 1000).toFixed(2)} KM</ThemedText></View></Pressable></SwipeableRow>; })}</View>}</>}
      <Pressable onPress={() => setShowNote((visible) => !visible)} style={styles.disclosure}><View><ThemedText style={styles.fieldLabel}>{t('note').toUpperCase()}</ThemedText><ThemedText style={styles.disclosureValue}>{notes ? t('noteAdded').toUpperCase() : t('optional').toUpperCase()}</ThemedText></View><ThemedText style={styles.disclosureAction}>{showNote ? '−' : '+'}</ThemedText></Pressable>
      {showNote && <TextInput value={notes} onChangeText={setNotes} placeholder={t('activityNotes')} placeholderTextColor={palette.muted} style={styles.noteInput} multiline />}
      <Pressable onPress={() => router.push('/run/manual')} style={styles.manualLink}><ThemedText style={styles.manualLabel}>LOG A PAST ACTIVITY</ThemedText></Pressable>
    </KeyboardAwareScrollView>
    <Pressable onPress={start} disabled={startCardioSession.isPending} style={[styles.startButton, startCardioSession.isPending && styles.buttonDisabled]}>{startCardioSession.isPending ? <ActivityIndicator color={palette.background} /> : <ThemedText style={styles.startLabel}>START {activityLabel.toUpperCase()}</ThemedText>}</Pressable>
  </SafeAreaView></ThemedView>;
}

function cardShadowFor(palette: ReturnType<typeof useNutritionPalette>) { return palette.background === '#FAFAF8' ? { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 } : {}; }
const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => softSheet({
  container: { flex: 1, backgroundColor: palette.background }, safeArea: { flex: 1, paddingHorizontal: Spacing.three }, content: { paddingVertical: Spacing.four, gap: Spacing.three, flexGrow: 1 }, fieldCard: { ...cardShadowFor(palette), backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: Spacing.three, gap: Spacing.two }, fieldLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.9 }, titleInput: { color: palette.text, fontFamily: Fonts.metric, fontSize: 22, lineHeight: 28, borderBottomWidth: 1, borderColor: palette.border, paddingVertical: Spacing.one }, disclosure: { ...cardShadowFor(palette), minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, paddingHorizontal: Spacing.three }, disclosureValue: { color: palette.text, fontFamily: Fonts.regular, fontSize: 14, marginTop: 3 }, disclosureAction: { color: palette.green, fontFamily: Fonts.technical, fontSize: 22 }, optionPanel: { ...cardShadowFor(palette), backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: Spacing.two, gap: Spacing.two }, newRoute: { minHeight: 42, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.raised, borderWidth: 1, borderColor: palette.green }, newRouteText: { color: palette.green, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 0.7 }, empty: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.6, padding: Spacing.one }, routeRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.two, backgroundColor: palette.raised, borderWidth: 1, borderColor: palette.border }, routeRowSelected: { borderColor: palette.green }, optionMark: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 16 }, optionMarkSelected: { color: palette.green }, routeInfo: { flex: 1 }, optionText: { color: palette.text, fontFamily: Fonts.regular, fontSize: 14 }, routeDistance: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 8, letterSpacing: 0.5, marginTop: 2 }, noteInput: { minHeight: 90, color: palette.text, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: Spacing.three, fontFamily: Fonts.regular, fontSize: 15, textAlignVertical: 'top' }, manualLink: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two, borderWidth: 1, borderColor: palette.border }, manualLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.7 }, startButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.green, marginBottom: Spacing.three }, buttonDisabled: { opacity: 0.6 }, startLabel: { color: palette.background, fontFamily: Fonts.bold, fontSize: 14, letterSpacing: 0.7 },
});

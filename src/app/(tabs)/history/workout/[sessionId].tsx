import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SessionMediaRow } from '@/components/session-media-row';
import { getExerciseCategoryColor, groupUnilateralSets, SetRow, type SessionExercise } from '@/components/set-row';
import { HeaderActionButton } from '@/components/header-action-button';
import { PaletteText as ThemedText, useNutritionPalette } from '@/components/nutrition-ui';
import { SwipeableRow } from '@/components/swipeable-row';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useNutritionLogsForDate } from '@/db/queries/nutrition';
import { useSettings } from '@/db/queries/settings';
import {
  useAddSet,
  useRemoveExerciseLog,
  useRemoveSet,
  useSession,
  useSessionExercises,
  useSplitSetToUnilateral,
  useUpdateExerciseLogNote,
  useUpdateSessionMeta,
  useUpdateSet,
} from '@/db/queries/workout';
import { formatClockTime, formatShortDate } from '@/lib/date';
import { formatDuration } from '@/lib/geo';
import { useT } from '@/lib/i18n';

// The DETAILS sheet's section labels (HEALTH/FOOD/NOTE/MEDIA) each get one
// fixed color regardless of theme — same hues History's day view uses for
// its own section bars — since they're semantic category markers, not
// backgrounds/text that need to track light/dark contrast.
const sectionColors = {
  green: '#2DD4A0',
  amber: '#FBBF24',
  purple: '#A78BFA',
  pink: '#FB7185',
};

export default function WorkoutRecapScreen() {
  const { t } = useT();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const id = sessionId;
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const theme = { text: palette.text, background: palette.background, backgroundElement: palette.card, backgroundSelected: palette.raised, textSecondary: palette.muted, border: palette.border, accent: palette.blue, accentOn: palette.background, destructive: palette.red };
  const insets = useSafeAreaInsets();

  const { data: session } = useSession(id);
  const { data: exerciseLogsList = [] } = useSessionExercises(id);
  const { data: dayNutritionLogs = [] } = useNutritionLogsForDate(session?.date ?? '');
  const { data: settings } = useSettings();
  const unit = settings?.unit ?? 'kg';
  const repMetric = settings?.repMetric ?? 'rir';
  const updateSessionMeta = useUpdateSessionMeta();

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [note, setNote] = useState('');
  const [showWorkoutDetails, setShowWorkoutDetails] = useState(false);

  useEffect(() => {
    setNameValue(session?.name ?? '');
  }, [session?.name]);

  useEffect(() => {
    setNote(session?.notes ?? '');
  }, [session?.notes]);

  if (!session) {
    return null;
  }

  const saveName = () => {
    updateSessionMeta.mutate({ id, name: nameValue.trim() || null });
    setEditingName(false);
  };

  const saveSessionNote = () => updateSessionMeta.mutate({ id, notes: note });

  const durationSeconds = session.finishedAt
    ? Math.max(0, Math.round((new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 1000))
    : 0;
  const totalSets = exerciseLogsList.reduce((sum, log) => sum + log.sets.length, 0);

  const nutritionBefore = dayNutritionLogs.filter((log) => log.loggedAt < session.startedAt);

  return (
    <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topRow}>
          <Pressable
            accessibilityLabel="Back"
            // Deterministic instead of router.back(): this screen is reached
            // from several places (History day view, Bugün's quick-start,
            // the live workout's finish-flow replace()) and back()'s target
            // depends on which one, which read as "back sometimes dumps me on
            // Bugün" — always landing on this workout's own day is correct
            // regardless of entry point and matches the day/[date].tsx fix.
            onPress={() => router.replace({ pathname: '/history/day/[date]', params: { date: session.date } })}
            hitSlop={10}
            style={styles.backButton}>
            <ThemedText style={styles.navSymbol}>{'<'}</ThemedText>
          </Pressable>
          <View style={styles.headerActions}>
            <HeaderActionButton
              label={t('share')}
              accessibilityLabel="Share workout"
              onPress={() => router.push({ pathname: '/workout/share/[sessionId]', params: { sessionId: id } })}
            />
            <HeaderActionButton label={t('workouts')} accessibilityLabel="Start workout" onPress={() => router.push('/workout/start')} />
          </View>
        </View>

        <View style={[styles.sessionHeaderCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <View style={styles.sessionHeaderTop}>
            <View style={styles.sessionHeaderCopy}>
              {editingName ? (
                <TextInput
                  value={nameValue}
                  onChangeText={setNameValue}
                  onEndEditing={saveName}
                  onBlur={saveName}
                  autoFocus
                  placeholder={formatShortDate(session.date)}
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.titleInput, { color: theme.text, borderColor: theme.border }]}
                />
              ) : (
                <Pressable onPress={() => setEditingName(true)} hitSlop={4}>
                  <ThemedText style={styles.sessionTitle}>{session.name || formatShortDate(session.date)}</ThemedText>
                </Pressable>
              )}
              <View style={styles.sessionMetaRow}>
                <ThemedText style={[styles.sessionMeta, { color: theme.textSecondary }]}>{formatDuration(durationSeconds).toUpperCase()}</ThemedText>
                <ThemedText style={styles.metaDivider}>|</ThemedText>
                <ThemedText style={[styles.sessionMeta, { color: theme.textSecondary }]}>{exerciseLogsList.length} {t('exercises').toUpperCase()}</ThemedText>
                <ThemedText style={styles.metaDivider}>|</ThemedText>
                <ThemedText style={[styles.sessionMeta, { color: theme.textSecondary }]}>{totalSets} {t('sets').toUpperCase()}</ThemedText>
              </View>
            </View>
          </View>
        </View>

        <KeyboardAvoidingView
          style={styles.keyboardAvoiding}
          // See src/app/workout/[sessionId].tsx — Android already resizes via
          // windowSoftInputMode="adjustResize"; behavior="height" here just
          // double-compensated and left inputs behind the keyboard.
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={insets.top}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.content, { paddingBottom: Spacing.six + insets.bottom }]}
          showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => setShowWorkoutDetails(true)} style={styles.workoutDetailsToggle}>
            <ThemedText style={styles.workoutDetailsLabel}>{t('details').toUpperCase()}</ThemedText>
            <ThemedText style={styles.workoutDetailsValue}>{`${t('health')} · ${t('food')} · ${t('note')} · ${t('media')}`.toUpperCase()}</ThemedText>
          </Pressable>

          {exerciseLogsList.map((log) => (
            <ExerciseCard key={log.id} log={log} sessionId={id} unit={unit} repMetric={repMetric} />
          ))}

          <Pressable
            onPress={() => router.push({ pathname: '/workout/add-exercise', params: { sessionId: String(id) } })}
            style={[styles.addExerciseButton, { borderColor: theme.border }]}>
            <ThemedText type="smallBold" style={{ color: theme.text }}>
              {t('addExercise').toUpperCase()}
            </ThemedText>
          </Pressable>
        </ScrollView>
        </KeyboardAvoidingView>

        <Modal transparent animationType="fade" visible={showWorkoutDetails} onRequestClose={() => setShowWorkoutDetails(false)}>
          <Pressable style={styles.workoutDetailsBackdrop} onPress={() => setShowWorkoutDetails(false)}>
            {/* This Modal is its own native window — the screen-level
                KeyboardAvoidingView above never reaches it, so the session
                note field inside had no keyboard handling at all (Kağan:
                "antrenman notu" covered by the keyboard). Centered (not
                bottom-anchored) modal, so "height" (shrink in place) is the
                right behavior here, unlike the bottom sheets elsewhere. */}
            <KeyboardAvoidingView behavior="height" style={styles.workoutDetailsBackdropInner}>
            <Pressable style={styles.workoutDetailsModal} onPress={(event) => event.stopPropagation()}>
              <View style={styles.workoutDetailsModalHeader}>
                <View>
                  <ThemedText style={styles.workoutDetailsModalTitle}>{t('workoutDetails').toUpperCase()}</ThemedText>
                  <ThemedText style={styles.workoutDetailsModalMeta}>{session.name || formatShortDate(session.date)}</ThemedText>
                </View>
                <Pressable accessibilityLabel="Close details" onPress={() => setShowWorkoutDetails(false)} hitSlop={10} style={styles.workoutDetailsClose}>
                  <ThemedText style={styles.workoutDetailsCloseText}>×</ThemedText>
                </Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.workoutDetailsContent}>
                {(session.avgHeartRate != null || session.caloriesBurned != null || session.vo2Max != null || session.oxygenSaturation != null || session.heartRateVariability != null || session.respiratoryRate != null) && (
                  <View style={styles.detailsSection}>
                    <ThemedText style={[styles.detailsSectionLabel, { color: sectionColors.pink }]}>{t('health').toUpperCase()}</ThemedText>
                    <View style={styles.healthStatsCard}>
                      {session.avgHeartRate != null && <DetailStat value={session.avgHeartRate} label="AVG HR" />}
                      {session.maxHeartRate != null && <DetailStat value={session.maxHeartRate} label="MAX HR" />}
                      {session.caloriesBurned != null && <DetailStat value={Math.round(session.caloriesBurned)} label="kcal" />}
                      {session.vo2Max != null && <DetailStat value={session.vo2Max.toFixed(1)} label="VO2 MAX" />}
                      {session.oxygenSaturation != null && <DetailStat value={`%${session.oxygenSaturation.toFixed(0)}`} label="SpO2" />}
                      {session.heartRateVariability != null && <DetailStat value={session.heartRateVariability.toFixed(0)} label="HRV" />}
                      {session.respiratoryRate != null && <DetailStat value={session.respiratoryRate.toFixed(1)} label="RESP" />}
                    </View>
                  </View>
                )}
                <View style={styles.detailsSection}>
                  <ThemedText style={[styles.detailsSectionLabel, { color: palette.green }]}>{t('food').toUpperCase()}</ThemedText>
                  <View style={styles.nutritionAroundSection}>
                    {nutritionBefore.length === 0 ? <ThemedText style={styles.nutritionEmptyText}>{t('noFoodBeforeWorkout')}</ThemedText> : nutritionBefore.map((log) => <ThemedText key={log.id} style={styles.nutritionLogText}>{formatClockTime(log.loggedAt)} · {log.foodName} {log.amountGrams}g</ThemedText>)}
                  </View>
                </View>
                <View style={styles.detailsSection}>
                  <ThemedText style={[styles.detailsSectionLabel, { color: sectionColors.amber }]}>{t('note').toUpperCase()}</ThemedText>
                  <TextInput value={note} onChangeText={setNote} onEndEditing={saveSessionNote} onBlur={saveSessionNote} placeholder={t('workoutNote')} placeholderTextColor={theme.textSecondary} style={[styles.noteInput, { color: theme.text, borderColor: theme.border }]} multiline />
                </View>
                <View style={styles.detailsSection}>
                  <ThemedText style={[styles.detailsSectionLabel, { color: sectionColors.purple }]}>{t('media').toUpperCase()}</ThemedText>
                  <SessionMediaRow sessionId={id} />
                </View>
              </ScrollView>
            </Pressable>
            </KeyboardAvoidingView>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </ThemedView>
  );
}

function DetailStat({ value, label }: { value: string | number; label: string }) {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.healthStatBlock}>
      <ThemedText style={styles.healthStatValue}>{value}</ThemedText>
      <ThemedText style={styles.healthStatLabel}>{label}</ThemedText>
    </View>
  );
}


function ExerciseCard({
  log,
  sessionId,
  unit,
  repMetric,
}: {
  log: SessionExercise;
  sessionId: string;
  unit: 'kg' | 'lb';
  repMetric: 'rir' | 'rpe';
}) {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const theme = { text: palette.text, textSecondary: palette.muted, border: palette.border, backgroundElement: palette.card };
  const addSet = useAddSet(sessionId);
  const updateSet = useUpdateSet(sessionId);
  const removeSet = useRemoveSet(sessionId);
  const splitSet = useSplitSetToUnilateral(sessionId);
  const updateNote = useUpdateExerciseLogNote(sessionId);
  const removeExerciseLog = useRemoveExerciseLog(sessionId);

  const [showDetails, setShowDetails] = useState(false);
  const [note, setNote] = useState(log.notes ?? '');

  const isBodyweight = log.exercise.isBodyweight;
  const weightMode = log.exercise.weightMode;
  const { pairs: unilateralPairs, legacySets } = groupUnilateralSets(log.sets);
  const accentColor = getExerciseCategoryColor(log.exercise.category);

  const saveExerciseNote = () => updateNote.mutate({ id: log.id, notes: note });

  useEffect(() => {
    if (note === (log.notes ?? '')) return;
    const timer = setTimeout(saveExerciseNote, 500);
    return () => clearTimeout(timer);
  }, [note, log.notes]);

  return (
    <SwipeableRow
      onDelete={() => removeExerciseLog.mutate(log.id)}
      confirmTitle="Remove exercise"
      confirmMessage={`"${log.exercise.name}" will be permanently removed from this workout.`}>
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderLeftColor: accentColor }]}>
        <View style={styles.exerciseHeader}>
          <Pressable accessibilityLabel="Exercise actions" onPress={() => setShowDetails(true)} hitSlop={8} style={styles.exerciseHeaderTitleRow}>
            <ThemedText style={[styles.exerciseTitle, log.notes ? { color: sectionColors.amber } : undefined]}>{log.exercise.name.toUpperCase()}</ThemedText>
            {log.notes ? <View style={styles.noteDot} /> : null}
          </Pressable>
        </View>

        <Modal transparent animationType="fade" visible={showDetails} onRequestClose={() => setShowDetails(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowDetails(false)}>
            {/* Same fix as the workout-details modal above and the live
                session's exercise-note modal — this Modal has its own native
                window, so it needs its own KeyboardAvoidingView. */}
            <KeyboardAvoidingView behavior="padding" style={styles.modalBackdropInner}>
              <View style={styles.detailModal}>
                <ThemedText style={styles.detailModalTitle}>{log.exercise.name.toUpperCase()}</ThemedText>
                <Pressable onPress={() => { setShowDetails(false); router.push({ pathname: '/workout/exercise-history', params: { exerciseId: String(log.exercise.id), exerciseName: log.exercise.name } }); }} style={styles.detailAction}><ThemedText style={styles.detailActionText}>VIEW HISTORY</ThemedText></Pressable>
                <ThemedText style={styles.detailLabel}>EXERCISE NOTE</ThemedText>
                <TextInput value={note} onChangeText={setNote} onEndEditing={saveExerciseNote} onBlur={saveExerciseNote} placeholder="Add an exercise note..." placeholderTextColor={theme.textSecondary} style={[styles.detailNoteInput, { color: theme.text, borderColor: theme.border }]} multiline />
                <Pressable onPress={() => { saveExerciseNote(); setShowDetails(false); }} style={styles.detailDone}><ThemedText style={styles.detailDoneText}>DONE</ThemedText></Pressable>
              </View>
            </KeyboardAvoidingView>
          </Pressable>
        </Modal>

        {log.sets.length > 0 && (
          <View style={styles.setHeaderRow}>
            <ThemedText style={[styles.setNumberColumn, styles.tableLabel]}>SET</ThemedText>
            <ThemedText style={[styles.metricsHeader, styles.tableLabel]}>METRICS</ThemedText>
            <ThemedText style={[styles.effortHeader, styles.tableLabel]}>EFFORT</ThemedText>
          </View>
        )}

        {unilateralPairs.map((pair) => (
          <View key={pair.setNumber} style={styles.unilateralPair}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.setNumberColumn}>
              {pair.setNumber}
            </ThemedText>
            <View style={styles.unilateralSides}>
              {pair.left && (
                <SetRow
                  set={pair.left}
                  unit={unit}
                  repMetric={repMetric}
                  weightMode={weightMode}
                  sideLabel="L"
                  variant="workout"
                  showSetTools={false}
                  accentColor={accentColor}
                  annotationColorOverride={accentColor}
                  onUpdate={(values) => updateSet.mutate({ id: pair.left!.id, ...values })}
                  onDelete={() => removeSet.mutate(pair.left!.id)}
                />
              )}
              {pair.right && (
                <SetRow
                  set={pair.right}
                  unit={unit}
                  repMetric={repMetric}
                  weightMode={weightMode}
                  sideLabel="R"
                  variant="workout"
                  showSetTools={false}
                  accentColor={accentColor}
                  annotationColorOverride={accentColor}
                  onUpdate={(values) => updateSet.mutate({ id: pair.right!.id, ...values })}
                  onDelete={() => removeSet.mutate(pair.right!.id)}
                />
              )}
            </View>
          </View>
        ))}
        {legacySets.map((set) => (
          <SetRow
            key={set.id}
            set={set}
            unit={unit}
            repMetric={repMetric}
            weightMode={weightMode}
            variant="workout"
            showSetTools={false}
            accentColor={accentColor}
            annotationColorOverride={accentColor}
            onUpdate={(values) => updateSet.mutate({ id: set.id, ...values })}
            onSplit={() => splitSet.mutate(set.id)}
            onDelete={() => removeSet.mutate(set.id)}
          />
        ))}

        <Pressable onPress={() => addSet.mutate({ exerciseLogId: log.id })} style={styles.addSetButton} hitSlop={8}>
          <ThemedText type="small" style={{ color: theme.text }}>
            + SET
          </ThemedText>
        </Pressable>
      </View>
    </SwipeableRow>
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
    gap: Spacing.two,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  navSymbol: { color: palette.text, fontFamily: Fonts.technical, fontSize: 22, lineHeight: 24 },
  // No alignSelf override — topRow's own alignItems:'center' already
  // vertically centers this against the PAYLAŞ/ANTRENMANLAR buttons; the
  // old flex-start pinned it to the row's top instead, off-center against
  // the taller header action buttons next to it.
  backButton: {},
  headerActions: { flexDirection: 'row', gap: Spacing.two },
  keyboardAvoiding: {
    flex: 1,
    gap: Spacing.two,
  },
  sessionHeaderCard: {
    padding: Spacing.three,
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.sm,
  },
  sessionHeaderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two },
  sessionHeaderCopy: { flex: 1, gap: Spacing.two },
  sessionTitle: { fontFamily: Fonts.bold, fontSize: 36, lineHeight: 40, letterSpacing: -0.8 },
  sessionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sessionMeta: { fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 0.25 },
  metaDivider: { color: palette.border, fontFamily: Fonts.technical, fontSize: 9 },
  healthStatsCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  healthStatBlock: {
    minWidth: 46,
    alignItems: 'flex-start',
  },
  healthStatValue: { color: palette.text, fontFamily: Fonts.technical, fontSize: 16, letterSpacing: -0.2 },
  healthStatLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 8, letterSpacing: 0.4 },
  titleInput: {
    fontSize: 32,
    fontFamily: Fonts.semiBold,
    letterSpacing: -0.5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 2,
  },
  noteToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 42,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
  },
  workoutDetailsToggle: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, borderWidth: 1, borderColor: palette.border, borderRadius: Radius.md, backgroundColor: palette.card },
  workoutDetailsLabel: { color: palette.text, fontFamily: Fonts.technical, fontSize: 12, letterSpacing: 0.5 },
  workoutDetailsValue: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.2 },
  // Everything DETAILS reveals lands in this one panel, right below the
  // toggle — no more health stats rendered above the list while food/note/
  // media render below it in a separate spot.
  detailsPanel: {
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    padding: Spacing.three,
  },
  workoutDetailsBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, backgroundColor: 'rgba(0,0,0,0.72)' },
  workoutDetailsBackdropInner: { alignItems: 'center', justifyContent: 'center' },
  workoutDetailsModal: { width: '100%', maxWidth: 520, maxHeight: '84%', borderWidth: 1, borderRadius: Radius.lg, borderColor: palette.border, backgroundColor: palette.card, overflow: 'hidden' },
  workoutDetailsModalHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  workoutDetailsModalTitle: { color: palette.text, fontFamily: Fonts.technical, fontSize: 12, letterSpacing: 0.8 },
  workoutDetailsModalMeta: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.25, marginTop: 2 },
  workoutDetailsClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  workoutDetailsCloseText: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 25, lineHeight: 28 },
  workoutDetailsContent: { gap: Spacing.three, padding: Spacing.three },
  // No colored side bar here anymore — the colored label alone (FOOD/NOTE/
  // MEDIA/HEALTH) is enough to tell sections apart without adding lines
  // that visually compete with the exercise cards' own category bar below.
  detailsSection: {
    gap: Spacing.one,
  },
  detailsSectionLabel: { fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 1 },
  noteInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  nutritionAroundSection: {
    gap: Spacing.half,
  },
  // Matches the rest of the DETAILS panel's technical/mono treatment
  // instead of the app's default body font, which read as a mismatched,
  // heavier block dropped into an otherwise compact dark panel.
  nutritionEmptyText: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 11 },
  nutritionLogText: { color: palette.text, fontFamily: Fonts.technical, fontSize: 11, lineHeight: 16 },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingTop: Spacing.two,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  // borderLeftColor is set per-instance to the exercise's category color
  // (getExerciseCategoryColor) — every set row inside shares that same color,
  // so the card border and its sets never show two different accent colors.
  card: {
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    borderLeftWidth: 3,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exerciseHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  detailsButton: { minHeight: 44, minWidth: 80, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border, paddingHorizontal: Spacing.two },
  detailsButtonText: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 11, letterSpacing: 0.45 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.68)' },
  modalBackdropInner: { flex: 1, justifyContent: 'flex-end' },
  detailModal: { width: '100%', borderWidth: 1, borderBottomWidth: 0, borderColor: palette.border, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, backgroundColor: palette.card, padding: Spacing.three, gap: Spacing.two },
  detailModalTitle: { color: palette.text, fontFamily: Fonts.technical, fontSize: 13, letterSpacing: 0.6 },
  detailAction: { minHeight: 48, justifyContent: 'center', paddingHorizontal: Spacing.three, borderWidth: 1, borderColor: palette.blue },
  detailActionText: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 11, letterSpacing: 0.5 },
  detailLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.45 },
  detailNoteInput: { minHeight: 96, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two, fontSize: 15, textAlignVertical: 'top' },
  detailDone: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  detailDoneText: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 11, letterSpacing: 0.7 },
  actionCode: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.4 },
  exerciseHeaderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  exerciseTitle: { color: palette.text, fontFamily: Fonts.technical, fontSize: 14, letterSpacing: 0.7 },
  noteDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: sectionColors.amber },
  setHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
    borderColor: palette.border,
  },
  tableLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 12, letterSpacing: 0.35 },
  unilateralPair: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  unilateralSides: {
    flex: 1,
    gap: Spacing.one,
  },
  setNumberColumn: {
    width: 32,
  },
  setInputColumn: {
    flex: 1,
  },
  metricsHeader: { flex: 1 },
  effortHeader: { width: 64, textAlign: 'right' },
  addSetButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  addExerciseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderRadius: Radius.md,
    backgroundColor: palette.raised,
    paddingVertical: Spacing.three,
  },
});

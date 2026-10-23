import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PaletteText as ThemedText, useNutritionPalette } from '@/components/nutrition-ui';
import { SessionMediaRow } from '@/components/session-media-row';
import { getExerciseCategoryColor, groupUnilateralSets, SetRow, type RepMetric, type SessionExercise, type SessionSet, type SetTarget } from '@/components/set-row';
import { useCoachDayTargets } from '@/lib/coach-client';
import { SwipeableRow } from '@/components/swipeable-row';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/db/queries/settings';
import {
  useAddSet,
  useFinishSession,
  useRemoveExerciseLog,
  useRemoveSet,
  useReorderSessionExercises,
  useSession,
  useSessionExercises,
  useMergeUnilateralPair,
  useSplitSetToUnilateral,
  useUpdateExerciseLogNote,
  useUpdateSessionMeta,
  useUpdateSet,
} from '@/db/queries/workout';
import { formatDuration } from '@/lib/geo';
import type { WeightUnit } from '@/lib/units';
import { useFontScale } from '@/hooks/use-font-scale';
import { useT } from '@/lib/i18n';
import { TextInput } from '@/components/text-input';
import { KeyboardDoneBar } from '@/components/keyboard-done-bar';
import { BackButton } from '@/components/screen-header';

// The NOTE/MEDIA quick actions' own fixed hues — same amber/purple the
// History recap screen's DETAILS sheet uses for its NOTE/MEDIA sections,
// semantic markers rather than a background/text color that needs to
// track the theme.
const noteColor = '#FBBF24';
const mediaColor = '#A78BFA';

function hasSetData(set?: SessionSet) {
  return !!set && (set.weight != null || set.reps != null || set.rir != null || set.rpe != null);
}

function LiveDuration({ startedAt }: { startedAt?: string }) {
  const palette = useNutritionPalette();
  const fontScale = useFontScale();
  const styles = useMemo(() => createStyles(palette, fontScale), [palette, fontScale]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const seconds = startedAt ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000)) : 0;
  return <ThemedText style={styles.sessionMeta}>{formatDuration(seconds).toUpperCase()}</ThemedText>;
}

export default function SessionScreen() {
  const { t } = useT();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const id = sessionId;
  const palette = useNutritionPalette();
  const fontScale = useFontScale();
  const styles = useMemo(() => createStyles(palette, fontScale), [palette, fontScale]);
  const theme = { text: palette.text, background: palette.background, backgroundElement: palette.card, backgroundSelected: palette.raised, textSecondary: palette.muted, border: palette.border, accent: palette.blue, accentOn: palette.background, destructive: palette.red };

  const { data: session } = useSession(id);
  const { data: exerciseLogsList = [] } = useSessionExercises(id);
  // Compos Kişisel: koç planından başlatıldıysa set hedefleri (normal Compos'ta hep null).
  const coachTargets = useCoachDayTargets(session?.programDayId);
  const { data: settings } = useSettings();
  const unit = settings?.unit ?? 'kg';
  const repMetric = settings?.repMetric ?? 'rir';
  const finishSession = useFinishSession();
  const updateSessionMeta = useUpdateSessionMeta();
  const reorderExercises = useReorderSessionExercises(id);

  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');

  useEffect(() => {
    setNote(session?.notes ?? '');
  }, [session?.notes]);

  useEffect(() => {
    setNameValue(session?.name ?? '');
  }, [session?.name]);

  const saveName = () => {
    updateSessionMeta.mutate({ id, name: nameValue.trim() || null });
    setEditingName(false);
  };

  const saveSessionNote = () => updateSessionMeta.mutate({ id, notes: note });

  // onBlur alone dropped the note when the screen unmounted (Kapat/Bitir)
  // before the blur event resolved — debounced auto-save covers that gap.
  useEffect(() => {
    if (note === (session?.notes ?? '')) return;
    const timer = setTimeout(() => saveSessionNote(), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);

  const totalSets = exerciseLogsList.reduce((sum, log) => sum + log.sets.length, 0);

  const performFinish = async () => {
    await finishSession.mutateAsync(id);
    // Same fix as the run-finish flow (run/[sessionId].tsx) —
    // router.back() just returned to wherever the workout was
    // started from and never actually showed the finished workout.
    // /history/workout/[sessionId] is the existing read-only recap
    // screen (exercises/sets/health stats), reused here as the
    // result screen instead of building a separate one.
    router.replace({ pathname: '/history/workout/[sessionId]', params: { sessionId: String(id) } });
  };

  const finish = () => {
    // Alert.alert() is a no-op on react-native-web — see nutrition/log/[id].tsx.
    // Without this branch, finishing a workout was completely inaccessible
    // on web (the confirm dialog never appeared, not just "didn't save").
    if (Platform.OS === 'web') {
      if (window.confirm('Finish workout\n\nAre you sure you want to finish this workout?')) {
        performFinish();
      }
      return;
    }
    Alert.alert('Finish workout', 'Are you sure you want to finish this workout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Finish', style: 'destructive', onPress: performFinish },
    ]);
  };

  const insets = useSafeAreaInsets();

  return (
    <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoiding}
          // Android's manifest already sets windowSoftInputMode="adjustResize",
          // so the Activity's own window resizes on keyboard open. Also giving
          // this view behavior="height" made it shrink a *second* time on top
          // of that — the session/set note inputs ended up positioned as if
          // still behind the keyboard (Kağan: antrenman/set notu klavyenin
          // altında kalıyor). iOS has no such native resize, so it still needs
          // "padding" here.
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={insets.top}>
          <View style={styles.topBar}>
            <BackButton onPress={() => router.back()} />
            <Pressable onPress={finish} style={styles.finishButton}>
              <ThemedText style={styles.finishText}>{t('finish').toUpperCase()}</ThemedText>
            </Pressable>
          </View>

        <DraggableFlatList
          containerStyle={styles.list}
          data={exerciseLogsList}
          keyExtractor={(log) => String(log.id)}
          contentContainerStyle={[styles.content, { paddingBottom: Spacing.six + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          onDragEnd={({ data }) => reorderExercises.mutate(data.map((log) => log.id))}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <View style={styles.sessionHeaderCard}>
                <View style={styles.sessionHeaderTop}>
                  <View style={styles.sessionHeaderCopy}>
                    {editingName ? (
                      <TextInput value={nameValue} onChangeText={setNameValue} onEndEditing={saveName} onBlur={saveName} autoFocus placeholder={t('workout')} placeholderTextColor={theme.textSecondary} style={[styles.titleInput, { color: theme.text, borderColor: theme.border }]} />
                    ) : (
                      <Pressable onPress={() => setEditingName(true)} hitSlop={8}><ThemedText numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.sessionTitle}>{session?.name || t('workout').toUpperCase()}</ThemedText></Pressable>
                    )}
                    <View style={styles.sessionMetaRow}>
                      <LiveDuration startedAt={session?.startedAt} /><ThemedText style={styles.metaDivider}>|</ThemedText><ThemedText style={styles.sessionMeta}>{exerciseLogsList.length} {t('exercises').toUpperCase()}</ThemedText><ThemedText style={styles.metaDivider}>|</ThemedText><ThemedText style={styles.sessionMeta}>{totalSets} {t('sets').toUpperCase()}</ThemedText>
                    </View>
                  </View>
                </View>
              </View>
              <View style={styles.quickActions}>
                <Pressable onPress={() => setShowNote((s) => !s)} style={styles.quickAction} hitSlop={8}>
                  <ThemedText style={[styles.quickCode, { color: noteColor }]}>{t('note').toUpperCase()}</ThemedText>
                  <ThemedText style={styles.quickText}>{(note ? t('editNote') : t('addNote')).toUpperCase()}</ThemedText>
                </Pressable>
                {/* No toggle here — tapping used to just reveal this row
                    below, costing an extra tap before you could actually
                    add/view anything. Each thumbnail is already a single
                    tap: empty slot opens the picker, an existing photo
                    opens the viewer. */}
                <View style={styles.quickAction}>
                  <ThemedText style={[styles.quickCode, { color: mediaColor }]}>{t('media').toUpperCase()}</ThemedText>
                  <SessionMediaRow sessionId={id} />
                </View>
              </View>
              {showNote && <TextInput value={note} onChangeText={setNote} onEndEditing={saveSessionNote} onBlur={saveSessionNote} placeholder={t('howDidItGo')} placeholderTextColor={theme.textSecondary} style={[styles.noteInput, { color: theme.text, borderColor: theme.border }]} multiline />}
            </View>
          }
          renderItem={({ item: log, drag, isActive }: RenderItemParams<SessionExercise>) => (
            <ExerciseBlock
              log={log}
              sessionId={id}
              unit={unit}
              repMetric={repMetric}
              onDrag={drag}
              isActive={isActive}
              targets={coachTargets?.[log.exerciseId]}
            />
          )}
          ListFooterComponent={
            <Pressable
              onPress={() => router.push({ pathname: '/workout/add-exercise', params: { sessionId: String(id) } })}
              style={[styles.addExerciseButton, { borderColor: theme.border }]}>
              <ThemedText type="smallBold" style={{ color: theme.text }}>
                + {t('addExercise').toUpperCase()}
              </ThemedText>
            </Pressable>
          }
        />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

function ExerciseBlock({
  log,
  sessionId,
  unit,
  repMetric,
  onDrag,
  isActive,
  targets,
}: {
  log: SessionExercise;
  sessionId: string;
  unit: WeightUnit;
  repMetric: RepMetric;
  onDrag: () => void;
  isActive: boolean;
  targets?: SetTarget[];
}) {
  const { t } = useT();
  const palette = useNutritionPalette();
  const fontScale = useFontScale();
  const styles = useMemo(() => createStyles(palette, fontScale), [palette, fontScale]);
  const theme = { text: palette.text, background: palette.background, backgroundElement: palette.card, backgroundSelected: palette.raised, textSecondary: palette.muted, border: palette.border, accent: palette.blue, accentOn: palette.background, destructive: palette.red };
  const addSet = useAddSet(sessionId);
  const updateSet = useUpdateSet(sessionId);
  const removeSet = useRemoveSet(sessionId);
  const splitSet = useSplitSetToUnilateral(sessionId);
  const mergeSet = useMergeUnilateralPair(sessionId);
  const updateNote = useUpdateExerciseLogNote(sessionId);
  const removeExerciseLog = useRemoveExerciseLog(sessionId);

  const [showDetails, setShowDetails] = useState(false);
  const [note, setNote] = useState(log.notes ?? '');

  const isBodyweight = log.exercise.isBodyweight;
  const weightMode = log.exercise.weightMode;
  const { pairs: unilateralPairs, legacySets } = groupUnilateralSets(log.sets);
  const accentColor = getExerciseCategoryColor(log.exercise.category);

  const saveExerciseNote = () => updateNote.mutate({ id: log.id, notes: note });
  const closeDetails = () => {
    saveExerciseNote();
    setShowDetails(false);
  };

  // Same onBlur gap as the session note above — debounced auto-save.
  useEffect(() => {
    if (note === (log.notes ?? '')) return;
    const timer = setTimeout(() => saveExerciseNote(), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);

  return (
    <SwipeableRow
      onDelete={() => removeExerciseLog.mutate(log.id)}
      confirmTitle="Remove exercise"
      confirmMessage={`Remove "${log.exercise.name}" from this workout?`}>
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderLeftColor: accentColor, opacity: isActive ? 0.85 : 1 }]}>
        <View style={styles.exerciseHeader}>
          <Pressable
            accessibilityLabel="Reorder exercise"
            onPress={() => setShowDetails(true)}
            onLongPress={onDrag}
            disabled={isActive}
            hitSlop={8}
            style={styles.exerciseHeaderTitle}>
            <ThemedText style={[styles.exerciseTitle, log.notes ? { color: noteColor } : undefined]}>{log.exercise.name.toUpperCase()}</ThemedText>
            {/* Neutral dot, not a category hue — matches the History recap screen. */}
            {log.notes ? <View style={styles.noteDot} /> : null}
          </Pressable>
        </View>

      <Modal transparent animationType="fade" visible={showDetails} onRequestClose={closeDetails}>
        <Pressable style={styles.modalBackdrop} onPress={closeDetails}>
          {/* RN's Modal renders in its own native window, so the screen-level
              KeyboardAvoidingView above never reaches content in here — this
              note input was left completely unprotected from the keyboard
              (Kağan: "hareket notu yazdığımda klavye üzerine denk geliyor").
              behavior="padding" (not the iOS/Android split used for a real
              full-screen container) is what actually pushes a bottom-anchored
              sheet like this one up above the keyboard on both platforms. */}
          <KeyboardAvoidingView behavior="padding" style={styles.modalBackdropInner}>
            <Pressable style={styles.detailModal} onPress={(event) => event.stopPropagation()}>
              <ThemedText style={styles.detailModalTitle}>{log.exercise.name.toUpperCase()}</ThemedText>
              <Pressable onPress={() => { setShowDetails(false); router.push({ pathname: '/workout/exercise-history', params: { exerciseId: String(log.exercise.id), exerciseName: log.exercise.name, sessionId: String(sessionId) } }); }} style={styles.detailAction}><ThemedText style={styles.detailActionText}>{t('viewHistory').toUpperCase()}</ThemedText></Pressable>
              <ThemedText style={styles.detailLabel}>{t('exerciseNote').toUpperCase()}</ThemedText>
              <TextInput value={note} onChangeText={setNote} onEndEditing={saveExerciseNote} onBlur={saveExerciseNote} placeholder={t('addExerciseNote')} placeholderTextColor={theme.textSecondary} style={[styles.detailNoteInput, { color: theme.text, borderColor: theme.border }]} multiline />
              <Pressable onPress={closeDetails} style={styles.detailDone}><ThemedText style={styles.detailDoneText}>{t('done').toUpperCase()}</ThemedText></Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
        <KeyboardDoneBar placement="modal" />
      </Modal>

      {log.sets.length > 0 && (
        <View style={styles.setHeaderRow}>
          <ThemedText style={[styles.setNumberColumn, styles.tableLabel]}>{t('set').toUpperCase()}</ThemedText>
          <ThemedText style={[styles.metricsHeader, styles.tableLabel]}>{t('metrics').toUpperCase()}</ThemedText>
          <ThemedText style={[styles.effortHeader, styles.tableLabel]}>{t('effort').toUpperCase()}</ThemedText>
        </View>
      )}

      {unilateralPairs.map((pair) => {
        const removeBoth = () => {
          if (pair.left) removeSet.mutate(pair.left.id);
          if (pair.right) removeSet.mutate(pair.right.id);
        };
        const confirmRemoveBoth = () => {
          const message = 'Removes both the left and right side of this set.';
          // Alert.alert() is a no-op on react-native-web — see nutrition/log/[id].tsx.
          if (Platform.OS === 'web') {
            if (window.confirm(`Remove set\n\n${message}`)) removeBoth();
            return;
          }
          Alert.alert('Remove set', message, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: removeBoth },
          ]);
        };
        return (
          <View key={pair.setNumber} style={styles.unilateralPair}>
            {/* A slim header instead of a left-hand column — squeezing the
                full metrics/effort row (weight×reps + RIR/RPE boxes) into a
                narrower column alongside this label used to overflow it on
                anything but the widest phones, overlapping the RIR/reps
                boxes. Each side below now gets the same full row width a
                plain (non-split) set gets. */}
            <View style={styles.unilateralPairHeader}>
              <Pressable accessibilityLabel={`Set ${pair.setNumber} actions`} onPress={confirmRemoveBoth} hitSlop={8}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.setNumberColumn}>
                  {pair.setNumber}
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityLabel="Merge left and right sets"
                onPress={() => {
                  const keepId = (pair.left ?? pair.right)!.id;
                  const discardId = pair.left && pair.right ? pair.right.id : undefined;
                  const doMerge = () => mergeSet.mutate({ keepId, discardId });
                  if (discardId && hasSetData(pair.left) && hasSetData(pair.right)) {
                    const message =
                      'Separate values exist for left and right. Merging keeps the left value and removes the right one.';
                    // Alert.alert() is a no-op on react-native-web — see nutrition/log/[id].tsx.
                    if (Platform.OS === 'web') {
                      if (window.confirm(`Merge left and right\n\n${message}`)) {
                        doMerge();
                      }
                    } else {
                      Alert.alert('Merge left and right', message, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Merge', style: 'destructive', onPress: doMerge },
                      ]);
                    }
                  } else {
                    doMerge();
                  }
                }}
                hitSlop={8}
                style={styles.unilateralMergeButton}>
                <ThemedText style={styles.smallSymbol}>↔</ThemedText>
              </Pressable>
            </View>
            {pair.left && (
              <SetRow
                set={pair.left}
                unit={unit}
                repMetric={repMetric}
                weightMode={weightMode}
                variant="workout"
                showSetTools={false}
                sideLabel="L"
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
                variant="workout"
                showSetTools={false}
                sideLabel="R"
                accentColor={accentColor}
                annotationColorOverride={accentColor}
                onUpdate={(values) => updateSet.mutate({ id: pair.right!.id, ...values })}
                onDelete={() => removeSet.mutate(pair.right!.id)}
              />
            )}
          </View>
        );
      })}
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
          target={targets?.[set.setNumber - 1]}
          onUpdate={(values) => updateSet.mutate({ id: set.id, ...values })}
          onSplit={() => splitSet.mutate(set.id)}
          onDelete={() => removeSet.mutate(set.id)}
        />
      ))}

      <Pressable
        onPress={() => addSet.mutate({ exerciseLogId: log.id })}
        style={styles.addSetButton}
        hitSlop={8}>
        <ThemedText type="small" style={{ color: theme.text }}>
          + {t('addSet').toUpperCase()}
        </ThemedText>
      </Pressable>
      </View>
    </SwipeableRow>
  );
}

// fs: capped OS text-size factor (useFontScale) — the table's fixed column
// widths hold text, so they grow with it.
const createStyles = (palette: ReturnType<typeof useNutritionPalette>, fs: number) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  keyboardAvoiding: {
    flex: 1,
    gap: Spacing.two,
  },
  list: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 42,
    borderBottomWidth: 1,
    borderColor: palette.border,
  },
  smallSymbol: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 14, lineHeight: 18 },
  sessionHeaderCard: {
    padding: Spacing.three,
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    borderRadius: Radius.sm,
  },
  sessionHeaderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two },
  sessionHeaderCopy: { flex: 1, gap: Spacing.two },
  titleInput: {
    fontSize: 24,
    lineHeight: 26,
    fontFamily: Fonts.bold,
    borderBottomWidth: 1,
    paddingVertical: 2,
  },
  sessionTitle: { color: palette.text, fontFamily: Fonts.bold, fontSize: 36, lineHeight: 40, letterSpacing: -0.8 },
  sessionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sessionMeta: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 0.25 },
  metaDivider: { color: palette.border, fontFamily: Fonts.technical, fontSize: 9 },
  finishButton: {
    minHeight: 30,
    paddingHorizontal: Spacing.two,
    justifyContent: 'center',
    borderWidth: 1,
    // Finish is the one primary live-workout action; use the same product
    // blue as the rest of Compos, not this screen's legacy neon-cyan token.
    borderColor: palette.blue,
    backgroundColor: palette.blue,
  },
  finishText: { color: palette.background, fontFamily: Fonts.technical, fontSize: 8, letterSpacing: 0.6 },
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
  content: {
    paddingTop: Spacing.two,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  listHeader: { gap: Spacing.three, paddingBottom: Spacing.three },
  quickActions: { flexDirection: 'row', gap: Spacing.two },
  quickAction: { flex: 1, minHeight: 64, gap: Spacing.one, padding: Spacing.two, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card },
  quickCode: { fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 0.5 },
  quickText: { color: palette.text, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 0.2 },
  // borderLeftColor set per-instance to the exercise's category color.
  card: {
    borderWidth: 1,
    borderColor: palette.border,
    borderLeftWidth: 3,
    padding: Spacing.three,
    gap: Spacing.two,
    borderRadius: Radius.sm,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exerciseHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  exerciseTitle: { color: palette.text, fontFamily: Fonts.technical, fontSize: 14, letterSpacing: 0.7 },
  noteDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.muted },
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
  // maxHeight: long notes scroll inside the box (see set-row.tsx modalNoteInput).
  detailNoteInput: { minHeight: 96, maxHeight: 180, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.two, fontSize: 15, textAlignVertical: 'top' },
  detailDone: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  detailDoneText: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 11, letterSpacing: 0.7 },
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
    gap: 0,
  },
  unilateralPairHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.one,
  },
  unilateralMergeButton: {
    width: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setNumberColumn: {
    // 20px wrapped "SET" onto two lines ("SE"/"T") — matches set-row.tsx's
    // and History's own 32px column.
    width: 32 * fs,
  },
  setInputColumn: {
    flex: 1,
  },
  metricsHeader: { flex: 1 },
  effortHeader: { width: 64 * fs, textAlign: 'right' },
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
    borderRadius: Radius.lg,
    paddingVertical: Spacing.three,
  },
});

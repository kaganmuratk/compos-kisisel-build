import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { FullscreenImageViewer } from '@/components/fullscreen-image-viewer';
import { PaletteText as ThemedText, useNutritionPalette } from '@/components/nutrition-ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useSessionExercises } from '@/db/queries/workout';
import { alertMessage } from '@/lib/alert';
import { useT } from '@/lib/i18n';
import { pickMedia } from '@/lib/media';
import { fromKg, toKg, type WeightUnit } from '@/lib/units';

// Reps/effort (RIR/RPE) — sized for 3 digits.
const INPUT_BOX_WIDTH = 46;
// Weight needs more room: 3-digit values (e.g. "102") were clipped at the
// old shared width. Sized for 4 digits.
const WEIGHT_INPUT_WIDTH = 54;

export type RepMetric = 'rir' | 'rpe';
export type SessionExercise = NonNullable<ReturnType<typeof useSessionExercises>['data']>[number];
export type SessionSet = SessionExercise['sets'][number];

// Exercise cards intentionally share one quiet border. Colour is reserved for
// information that changes the meaning of a row (a note or attached media),
// not for an arbitrary exercise category.
const defaultCategoryColor = '#343434';
const exerciseCategoryColors: Record<string, string> = {
  Göğüs: '#3D8DFF', Sırt: '#2DD4A0', Omuz: '#FB923C', Bacak: '#A78BFA',
  Biceps: '#F87171', Triceps: '#67E8F9', Karın: '#FBBF24', Kardiyo: '#FB7185',
};
export function getExerciseCategoryColor(category: string | null | undefined): string {
  return category ? exerciseCategoryColors[category] ?? defaultCategoryColor : defaultCategoryColor;
}
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Minimal shape SetRow actually needs — lets it render sets coming from
// contexts other than a live session (e.g. historical logs in the analysis
// screen) without pulling in the full SessionSet columns.
export type EditableSetFields = {
  id: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  rpe: number | null;
  notes: string | null;
  mediaUri?: string | null;
  mediaType?: 'image' | 'video' | null;
};

// Unilateral sets are stored as two rows (side: 'left'/'right') sharing the
// same setNumber; group them back into pairs for rendering. Splitting a set
// into left/right is now a per-set action (see the split button in SetRow),
// not an exercise-wide flag — so a single exercise can freely mix split and
// plain sets, and grouping is purely driven by whether `side` is set.
export function groupUnilateralSets(sets: SessionSet[]) {
  const pairs: { setNumber: number; left?: SessionSet; right?: SessionSet }[] = [];
  const legacySets: SessionSet[] = [];
  for (const set of sets) {
    if (set.side == null) {
      legacySets.push(set);
      continue;
    }
    let pair = pairs.find((p) => p.setNumber === set.setNumber);
    if (!pair) {
      pair = { setNumber: set.setNumber };
      pairs.push(pair);
    }
    if (set.side === 'left') {
      pair.left = set;
    } else {
      pair.right = set;
    }
  }
  return { pairs, legacySets };
}

export type SetTarget = { kg?: number | null; reps?: number | null; rir?: number | null };

export function SetRow({
  set,
  unit,
  repMetric,
  weightMode = 'kg',
  onUpdate,
  onSplit,
  onDelete,
  sideLabel,
  variant = 'default',
  showSetTools = true,
  accentColor,
  annotationColorOverride,
  target,
}: {
  set: EditableSetFields;
  unit: WeightUnit;
  repMetric: RepMetric;
  weightMode?: 'kg' | 'pin';
  onUpdate: (values: {
    weight?: number | null;
    reps?: number | null;
    rir?: number | null;
    rpe?: number | null;
    notes?: string | null;
    mediaUri?: string | null;
    mediaType?: 'image' | 'video' | null;
  }) => void;
  // Splits this set into a left/right pair. Only offered on plain sets
  // (sideLabel unset) — a set that's already part of a pair can't split again.
  onSplit?: () => void;
  onDelete?: () => void;
  sideLabel?: string;
  /** Dense, technical table treatment used by live and completed workouts. */
  variant?: 'default' | 'workout';
  /** The Stitch table has three columns. Set actions live outside it by default. */
  showSetTools?: boolean;
  /** Workout variant only — same category color as the parent exercise card's border. */
  accentColor?: string;
  /** Insights can opt into a category-coloured annotation without changing workout defaults. */
  annotationColorOverride?: string;
  /** Compos Kişisel: koçun hedefi. Boş sette gri ipucu olarak görünür; ✓ hedefi olduğu gibi kaydeder. */
  target?: SetTarget;
}) {
  const { t } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const workoutAccent = accentColor ?? defaultCategoryColor;
  // Both variants now resolve colors from the same theme-aware palette —
  // 'workout' used to build its own fixed-dark color set (a leftover from
  // before the app-wide light theme rollout), which read as invisible
  // near-white text once the surrounding card became a white light-theme
  // surface (Kağan: "yazılar beyaz olmuş gözükmüyorlar"). Only `accent`
  // still differs: workout rows use the exercise's own category color.
  const theme = {
    text: palette.text,
    textSecondary: palette.muted,
    border: palette.border,
    accent: variant === 'workout' ? workoutAccent : palette.blue,
    destructive: palette.red,
  };
  const repValue = repMetric === 'rir' ? set.rir : set.rpe;
  const metricUnit = weightMode === 'pin' ? 'PIN' : unit.toUpperCase();
  // Note/media are the same blue as any other accent — no separate amber/
  // purple annotation colors, per explicit user request.
  const annotationColor = set.mediaUri || set.notes ? annotationColorOverride ?? palette.blue : null;
  const [weight, setWeight] = useState(
    set.weight != null ? String(weightMode === 'pin' ? set.weight : fromKg(set.weight, unit)) : ''
  );
  const [reps, setReps] = useState(set.reps != null ? String(set.reps) : '');
  const [repMetricValue, setRepMetricValue] = useState(repValue != null ? String(repValue) : '');
  const [showNote, setShowNote] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [note, setNote] = useState(set.notes ?? '');
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const inputStyle = [
    styles.setInput,
    styles.setInputColumn,
    variant === 'workout' && styles.workoutInput,
    { color: theme.text, borderColor: theme.border },
  ];

  const handlePickMedia = async () => {
    try {
      const media = await pickMedia();
      if (media) {
        onUpdate({ mediaUri: media.uri, mediaType: media.type });
      }
    } catch (error) {
      alertMessage(t('couldNotAddMedia'), error instanceof Error ? error.message : String(error));
    }
  };

  const handleMediaPress = () => {
    if (set.mediaUri && set.mediaType === 'image') {
      setViewerUri(set.mediaUri);
      return;
    }
    handlePickMedia();
  };

  // onBlur alongside onEndEditing on every input below — react-native-web's
  // TextInput never wires up onEndEditing at all, only onBlur, so
  // web-only saves were silently no-ops without it (see nutrition/log/[id].tsx).
  const saveWeight = () =>
    onUpdate({
      weight: weight
        ? weightMode === 'pin'
          ? Number(weight.replace(',', '.'))
          : toKg(Number(weight.replace(',', '.')), unit)
        : null,
    });
  const saveReps = () => onUpdate({ reps: reps ? Number(reps.replace(',', '.')) : null });
  const saveRepMetricValue = () =>
    onUpdate({ [repMetric]: repMetricValue ? Number(repMetricValue.replace(',', '.')) : null });
  const saveNote = () => onUpdate({ notes: note });
  const targetWeight = target?.kg != null ? String(weightMode === 'pin' ? target.kg : fromKg(target.kg, unit)) : undefined;
  const targetReps = target?.reps != null ? String(target.reps) : undefined;
  const targetEffort = repMetric === 'rir' && target?.rir != null ? String(target.rir) : undefined;
  const showAccept = !!target && !weight && !reps;
  const acceptTarget = () => {
    if (!target) return;
    setWeight(targetWeight ?? '');
    setReps(targetReps ?? '');
    if (targetEffort) setRepMetricValue(targetEffort);
    onUpdate({
      weight: target.kg ?? null,
      reps: target.reps ?? null,
      ...(targetEffort ? { rir: target.rir ?? null } : {}),
    });
  };
  const closeTools = () => {
    saveNote();
    setShowNote(false);
    setShowTools(false);
  };

  return (
    <View>
      <View
        style={[
          styles.setRow,
          variant === 'workout' && styles.workoutRow,
          // No border here on purpose — the card's own left border is the
          // only line running down the exercise; a second border per row
          // used to butt up against it and read as two separate lines.
          variant === 'workout' && {
            backgroundColor: annotationColor ? withAlpha(annotationColor, 0.1) : 'rgba(255,255,255,0.018)',
            marginHorizontal: -Spacing.three,
            // This matches the card's content inset, so SET / METRICS /
            // EFFORT headers sit exactly above their values.
            paddingHorizontal: Spacing.three,
          },
        ]}>
        <Pressable accessibilityLabel={`Set ${sideLabel ?? set.setNumber} actions`} onPress={() => variant === 'workout' && setShowTools(true)} hitSlop={8} style={styles.setNumberColumn}>
          <ThemedText type="small" themeColor="textSecondary" style={[styles.setNumber, variant === 'workout' && { color: annotationColor ?? theme.textSecondary }]}>
            {sideLabel ?? set.setNumber}
          </ThemedText>
        </Pressable>
        {variant === 'workout' ? (
          <>
            <View style={styles.metricsCell}>
              <View style={styles.weightMetric}>
                <TextInput value={weight} onChangeText={setWeight} onEndEditing={saveWeight} onBlur={saveWeight} keyboardType="decimal-pad" placeholder={targetWeight} placeholderTextColor={theme.textSecondary} style={[styles.weightInput, { color: theme.text }]} />
                <ThemedText style={styles.metricUnit}>{metricUnit}</ThemedText>
              </View>
              <ThemedText style={styles.metricMultiply}>×</ThemedText>
              <TextInput value={reps} onChangeText={setReps} onEndEditing={saveReps} onBlur={saveReps} keyboardType="decimal-pad" placeholder={targetReps} placeholderTextColor={theme.textSecondary} style={[styles.repsInput, { color: theme.text }]} />
            </View>
            <View style={styles.effortCell}>
              <ThemedText style={[styles.effortPrefix, { color: theme.textSecondary }]}>{repMetric.toUpperCase()}</ThemedText>
              <TextInput value={repMetricValue} onChangeText={setRepMetricValue} onEndEditing={saveRepMetricValue} onBlur={saveRepMetricValue} keyboardType="decimal-pad" placeholder={targetEffort} placeholderTextColor={theme.textSecondary} style={[styles.effortInput, { color: repMetricValue ? theme.text : theme.textSecondary }]} />
            </View>
            {target && (
              <Pressable accessibilityLabel={showAccept ? 'Hedefi yaptım' : 'Set kaydedildi'} disabled={!showAccept} onPress={acceptTarget} hitSlop={8} style={[styles.acceptButton, { borderColor: showAccept ? theme.accent : 'transparent' }]}>
                <ThemedText style={[styles.acceptText, { color: showAccept ? theme.accent : theme.textSecondary }]}>✓</ThemedText>
              </Pressable>
            )}
            {showSetTools && <Pressable accessibilityLabel="Set tools" onPress={() => setShowTools((open) => !open)} hitSlop={8} style={styles.toolsButton}>
              <ThemedText style={[styles.actionCode, { color: showTools ? theme.accent : theme.textSecondary }]}>TOOLS</ThemedText>
            </Pressable>}
          </>
        ) : (
          <>
            <TextInput value={weight} onChangeText={setWeight} onEndEditing={saveWeight} onBlur={saveWeight} keyboardType="decimal-pad" style={inputStyle} />
            <TextInput value={reps} onChangeText={setReps} onEndEditing={saveReps} onBlur={saveReps} keyboardType="decimal-pad" style={inputStyle} />
            <TextInput value={repMetricValue} onChangeText={setRepMetricValue} onEndEditing={saveRepMetricValue} onBlur={saveRepMetricValue} keyboardType="decimal-pad" style={inputStyle} />
            <View style={styles.setTrailingActions}>
              <SetActions set={set} theme={theme} showNote={showNote} setShowNote={setShowNote} onSplit={onSplit} onDelete={onDelete} sideLabel={sideLabel} onMediaPress={handleMediaPress} onPickMedia={handlePickMedia} annotationColorOverride={annotationColorOverride} />
            </View>
          </>
        )}
      </View>
      {variant === 'workout' && (
        <Modal transparent animationType="fade" visible={showTools} onRequestClose={closeTools}>
          <Pressable style={styles.modalBackdrop} onPress={closeTools}>
            {/* This sheet is bottom-anchored (modalBackdrop is justifyContent:
                'flex-end'). behavior="height" shrinks the view's own height,
                which — pinned to the bottom — just makes it shorter in place
                instead of pushing it up; "padding" grows it from the bottom
                instead, which is what actually lifts the note input above the
                keyboard (Kağan: "set notu" covered by the keyboard). */}
            <KeyboardAvoidingView behavior="padding" style={styles.modalBackdropInner}>
              <Pressable style={[styles.toolsModal, { backgroundColor: palette.card, borderColor: theme.border }]} onPress={(event) => event.stopPropagation()}>
                <ThemedText style={styles.toolsTitle}>SET TOOLS</ThemedText>
                <View style={styles.toolsActions}>
                  <SetActions set={set} theme={theme} showNote={showNote} setShowNote={setShowNote} onSplit={onSplit} onDelete={onDelete} sideLabel={sideLabel} onMediaPress={handleMediaPress} onPickMedia={handlePickMedia} expanded annotationColorOverride={annotationColorOverride} />
                </View>
            {showNote && <TextInput value={note} onChangeText={setNote} onEndEditing={saveNote} onBlur={saveNote} placeholder={t('setNotePlaceholder')} placeholderTextColor={theme.textSecondary} style={[styles.modalNoteInput, { color: theme.text, borderColor: theme.border }]} multiline autoFocus />}
                <Pressable onPress={closeTools} style={styles.closeTools}><ThemedText style={[styles.closeToolsText, { color: workoutAccent }]}>DONE</ThemedText></Pressable>
              </Pressable>
            </KeyboardAvoidingView>
          </Pressable>
        </Modal>
      )}
      {showNote && !(variant === 'workout' && showTools) && (
        <TextInput
          value={note}
          onChangeText={setNote}
          onEndEditing={saveNote}
          onBlur={saveNote}
          placeholder={t('setNotePlaceholder')}
          placeholderTextColor={theme.textSecondary}
          style={[styles.noteInput, { color: theme.text, borderColor: theme.border }]}
          multiline
        />
      )}
      <FullscreenImageViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
    </View>
  );
}

function SetActions({
  set,
  theme,
  showNote,
  setShowNote,
  onSplit,
  onDelete,
  sideLabel,
  onMediaPress,
  onPickMedia,
  expanded = false,
  annotationColorOverride,
}: {
  set: EditableSetFields;
  theme: { textSecondary: string; accent: string; destructive: string };
  showNote: boolean;
  setShowNote: (next: boolean | ((value: boolean) => boolean)) => void;
  onSplit?: () => void;
  onDelete?: () => void;
  sideLabel?: string;
  onMediaPress: () => void;
  onPickMedia: () => Promise<void>;
  expanded?: boolean;
  annotationColorOverride?: string;
}) {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const actionStyle = expanded ? styles.expandedAction : undefined;
  const labelStyle = expanded ? styles.expandedActionCode : styles.actionCode;
  return (
    <>
      <Pressable accessibilityLabel="Set note" onPress={() => setShowNote((open) => !open)} hitSlop={8} style={actionStyle}>
        <ThemedText style={[labelStyle, { color: showNote || set.notes ? annotationColorOverride ?? palette.blue : theme.textSecondary }]}>NOTE</ThemedText>
      </Pressable>
      <Pressable accessibilityLabel="Set image or video" onPress={onMediaPress} onLongPress={set.mediaUri ? onPickMedia : undefined} hitSlop={8} style={actionStyle}>
        {set.mediaUri && set.mediaType === 'image' ? <Image source={{ uri: set.mediaUri }} style={styles.setMediaThumb} /> : <ThemedText style={[labelStyle, { color: set.mediaUri ? annotationColorOverride ?? palette.blue : theme.textSecondary }]}>{set.mediaUri ? 'VID' : 'MEDIA'}</ThemedText>}
      </Pressable>
      {/* Only offered on plain sets. */}
      {onSplit && !sideLabel && <Pressable accessibilityLabel="Split set" onPress={onSplit} hitSlop={8} style={actionStyle}><ThemedText style={[labelStyle, { color: theme.accent }]}>SPLIT</ThemedText></Pressable>}
      {onDelete && <Pressable accessibilityLabel="Delete set" onPress={onDelete} hitSlop={8} style={actionStyle}><ThemedText style={[labelStyle, { color: theme.destructive }]}>REMOVE</ThemedText></Pressable>}
    </>
  );
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({
  setRow: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  workoutRow: {
    gap: 0,
    minHeight: 52,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  setNumberColumn: {
    width: 32,
  },
  setNumber: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 14, lineHeight: 18 },
  setInputColumn: {
    flex: 1,
    minWidth: 0,
  },
  setInput: {
    minWidth: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 14,
    textAlign: 'center',
  },
  workoutInput: {
    borderRadius: 0,
    backgroundColor: palette.raised,
    fontFamily: Fonts.technical,
    fontSize: 11,
    paddingHorizontal: 4,
    paddingVertical: 5,
  },
  // Fixed-width boxes here used to create content-dependent gaps ("10 KG"
  // left a wide gap before ×, "100 KG" almost none) — explicit `gap` on
  // each level keeps the spacing constant regardless of digit count.
  metricsCell: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 14 },
  weightMetric: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  // Explicit widths (not flex/minWidth) — react-native-web otherwise lets the
  // <input> stretch to fill the row, which pushed "10" far from the METRICS
  // header and made the KG/× gap balloon on short values.
  // Left-aligned so the digits start flush with the box's left edge — same
  // spot the METRICS header text starts. Right-aligned used to push short
  // values like "10" toward the far side of the box, away from the header.
  // A visible box (not just an underline) — an empty input with no
  // affordance at all read as blank space, not a tappable field, until you
  // happened to tap it. Transparent background, border only. Weight gets
  // its own wider width (WEIGHT_INPUT_WIDTH, fits 4 digits) — 3-digit
  // values were clipped at the shared INPUT_BOX_WIDTH used here before;
  // reps/effort use INPUT_BOX_WIDTH (fits 3 digits).
  weightInput: { width: WEIGHT_INPUT_WIDTH, paddingVertical: 3, paddingHorizontal: 5, fontFamily: Fonts.technical, fontSize: 18, textAlign: 'left', borderWidth: 1, borderColor: palette.border, borderRadius: 4, backgroundColor: 'transparent', fontVariant: ['tabular-nums'] },
  repsInput: { width: INPUT_BOX_WIDTH, paddingVertical: 3, paddingHorizontal: 5, fontFamily: Fonts.technical, fontSize: 18, textAlign: 'left', borderWidth: 1, borderColor: palette.border, borderRadius: 4, backgroundColor: 'transparent', fontVariant: ['tabular-nums'] },
  metricMultiply: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 14 },
  metricUnit: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 12, lineHeight: 18, letterSpacing: 0 },
  effortCell: { width: 78, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4 },
  effortPrefix: { fontFamily: Fonts.technical, fontSize: 11, letterSpacing: 0.2 },
  effortInput: { width: INPUT_BOX_WIDTH, paddingVertical: 3, paddingHorizontal: 5, fontFamily: Fonts.technical, fontSize: 14, textAlign: 'right', borderWidth: 1, borderColor: palette.border, borderRadius: 4, backgroundColor: 'transparent', fontVariant: ['tabular-nums'] },
  acceptButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.one },
  acceptText: { fontSize: 16, fontWeight: '700' },
  toolsButton: { width: 54, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.66)' },
  modalBackdropInner: { flex: 1, justifyContent: 'flex-end' },
  toolsModal: { width: '100%', borderWidth: 1, borderBottomWidth: 0, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, padding: Spacing.three, gap: Spacing.three },
  toolsTitle: { color: palette.text, fontFamily: Fonts.technical, fontSize: 11, letterSpacing: 1 },
  toolsActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  expandedAction: { flexGrow: 1, minWidth: 120, minHeight: 64, alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: Spacing.three, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.raised },
  closeTools: { alignSelf: 'stretch', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderColor: palette.border, paddingTop: Spacing.two },
  closeToolsText: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 0.8 },
  modalNoteInput: { borderWidth: StyleSheet.hairlineWidth, minHeight: 92, padding: Spacing.two, fontSize: 15, textAlignVertical: 'top' },
  setTrailingActions: {
    width: 86,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.one,
  },
  actionCode: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, lineHeight: 14, letterSpacing: 0.3 },
  expandedActionCode: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 11, lineHeight: 16, letterSpacing: 0.35 },
  setMediaThumb: {
    width: 14,
    height: 14,
    borderRadius: 3,
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
});

import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/screen-header';
import { getExerciseCategoryColor } from '@/components/set-row';
import { SwipeableRow } from '@/components/swipeable-row';
import { PaletteText as ThemedText, cardShadowFor, useNutritionPalette } from '@/components/nutrition-ui';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useDayExercises, useProgramDay, useRemoveDayExercise, useUpdateDayExercise } from '@/db/queries/programs';
import { useActiveSession } from '@/db/queries/workout';
import { useT } from '@/lib/i18n';
import { TextInput } from '@/components/text-input';
import { softSheet } from '@/constants/soft-sheet';
type DayExercise = NonNullable<ReturnType<typeof useDayExercises>['data']>[number];
export default function ProgramDayScreen() {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { t } = useT();
  const { dayId: id } = useLocalSearchParams<{ dayId: string }>();
  const { data: day } = useProgramDay(id);
  const { data: items = [] } = useDayExercises(id);
  const update = useUpdateDayExercise(id);
  const remove = useRemoveDayExercise(id);
  const { data: active } = useActiveSession();
  if (!day) return null;
  const start = active
    ? () => router.push({ pathname: '/workout/[sessionId]', params: { sessionId: String(active.id) } })
    : () => router.push({ pathname: '/workout/start', params: { dayId: String(id) } });
  return (
    <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.page}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader
          eyebrow={t('trainingDayLabel').toUpperCase()}
          title={day.name}
          accentColor={palette.blue}
          onBack={() => router.dismissTo({ pathname: '/programs/[id]', params: { id: String(day.programId) } })}
        />
        <Pressable onPress={start} style={active ? styles.resume : styles.start}>
          <ThemedText style={active ? styles.resumeLabel : styles.startLabel}>{(active ? t('resumeActiveWorkout') : t('startWorkoutLabel')).toUpperCase()}</ThemedText>
        </Pressable>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {items.map((item) => (
            <ExerciseRow key={item.id} item={item} onUpdate={(v) => update.mutate({ id: item.id, ...v })} onRemove={() => remove.mutate(item.id)} />
          ))}
          <Pressable onPress={() => router.push({ pathname: '/programs/day/add-exercise', params: { dayId: String(id) } })} style={styles.addExercise}>
            <ThemedText style={styles.addLabel}>+ {t('addExercise').toUpperCase()}</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}
function ExerciseRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: DayExercise;
  onUpdate: (v: { targetSets?: number | null; targetReps?: string | null; targetRir?: number | null }) => void;
  onRemove: () => void;
}) {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const cardShadow = cardShadowFor(palette);
  const { t } = useT();
  const [sets, setSets] = useState(item.targetSets != null ? String(item.targetSets) : '');
  const [reps, setReps] = useState(item.targetReps ?? '');
  const [rir, setRir] = useState(item.targetRir != null ? String(item.targetRir) : '');
  const accentColor = getExerciseCategoryColor(item.exercise.category);
  return (
    <SwipeableRow onDelete={onRemove} confirmTitle="Hareketi Kaldır" confirmMessage={`"${item.exercise.name}" bu günden kaldırılacak.`}>
      <View style={[styles.card, cardShadow, { borderLeftColor: accentColor }]}>
        <ThemedText style={styles.exerciseName}>{item.exercise.name.toUpperCase()}</ThemedText>
        <View style={styles.targets}>
          <Target label={t('setsLabel').toUpperCase()} value={sets} onChange={setSets} onSave={() => onUpdate({ targetSets: sets ? Number(sets) : null })} keyboard="number-pad" />
          <Target label={t('reps').toUpperCase()} placeholder="8–12" value={reps} onChange={setReps} onSave={() => onUpdate({ targetReps: reps || null })} />
          <Target label="RIR" value={rir} onChange={setRir} onSave={() => onUpdate({ targetRir: rir ? Number(rir) : null })} keyboard="decimal-pad" />
        </View>
      </View>
    </SwipeableRow>
  );
}
function Target({
  label,
  value,
  onChange,
  onSave,
  keyboard,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  keyboard?: 'number-pad' | 'decimal-pad';
  placeholder?: string;
}) {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.target}>
      <ThemedText style={styles.targetLabel}>{label}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChange}
        onBlur={onSave}
        onEndEditing={onSave}
        keyboardType={keyboard}
        placeholder={placeholder ?? ''}
        placeholderTextColor={palette.muted}
        style={styles.input}
      />
    </View>
  );
}
const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => softSheet({
  page: { flex: 1, backgroundColor: palette.background },
  safe: { flex: 1, paddingHorizontal: Spacing.three },
  start: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.blue },
  resume: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.raised, borderWidth: 1, borderColor: palette.border },
  startLabel: { color: palette.background, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 1.1 },
  resumeLabel: { color: palette.text, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 1.1 },
  content: { gap: Spacing.two, paddingVertical: Spacing.three, paddingBottom: Spacing.six },
  card: { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, borderLeftWidth: 3, borderRadius: Radius.sm, padding: Spacing.three, gap: Spacing.three },
  exerciseName: { color: palette.text, fontFamily: Fonts.technical, fontSize: 14, letterSpacing: 0.7 },
  targets: { flexDirection: 'row', gap: Spacing.two },
  target: { flex: 1, gap: Spacing.one },
  targetLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 8, letterSpacing: 0.8 },
  input: { minHeight: 40, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.raised, color: palette.text, textAlign: 'center', fontFamily: Fonts.metricMedium, fontSize: 18 },
  addExercise: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border, borderStyle: 'dashed' },
  addLabel: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 1.1 },
});

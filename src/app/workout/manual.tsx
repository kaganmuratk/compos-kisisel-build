import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNutritionPalette } from '@/components/nutrition-ui';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { addExerciseToSession, useAddManualWorkoutSession } from '@/db/queries/workout';
import { useAuth } from '@/hooks/use-auth';
import { addDaysToDateString, formatDayMonth, getTodayDateString } from '@/lib/date';
import { useT } from '@/lib/i18n';
import { TextInput } from '@/components/text-input';
import { KEYBOARD_BAR_CLEARANCE } from '@/components/keyboard-done-bar';
import { softSheet } from '@/constants/soft-sheet';

export default function AddManualWorkoutScreen() {
  const { t } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { date: dateParam, exerciseId, exerciseName } = useLocalSearchParams<{ date?: string; exerciseId?: string; exerciseName?: string }>();
  const { user } = useAuth(); const addManualSession = useAddManualWorkoutSession();
  const [date, setDate] = useState(dateParam ?? getTodayDateString()); const [name, setName] = useState(''); const [notes, setNotes] = useState('');
  const isToday = date === getTodayDateString();
  const save = async () => { if (addManualSession.isPending) return; const session = await addManualSession.mutateAsync({ date, name: name.trim() || undefined, notes: notes.trim() || undefined }); if (!session) return; if (exerciseId && user) await addExerciseToSession(session.id, exerciseId, user.id); router.replace({ pathname: '/history/workout/[sessionId]', params: { sessionId: String(session.id) } }); };
  return <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.page}><SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
    <ScreenHeader onBack={() => router.back()} eyebrow={t('workout').toUpperCase()} title={(exerciseName ? t('logPastSets') : t('logPastWorkout')).toUpperCase()} accentColor={palette.blue} />
    <KeyboardAwareScrollView bottomOffset={KEYBOARD_BAR_CLEARANCE} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.fieldCard}><ThemedText style={styles.label}>{t('date').toUpperCase()}</ThemedText><View style={styles.dateRow}><Pressable accessibilityLabel={t('previousDay')} onPress={() => setDate((value) => addDaysToDateString(value, -1))} style={styles.step}><ThemedText style={styles.stepText}>−</ThemedText></Pressable><ThemedText style={styles.dateValue}>{formatDayMonth(date)}</ThemedText><Pressable accessibilityLabel={t('nextDay')} disabled={isToday} onPress={() => setDate((value) => addDaysToDateString(value, 1))} style={[styles.step, isToday && styles.disabled]}><ThemedText style={styles.stepText}>+</ThemedText></Pressable></View></View>
      <View style={styles.fieldCard}><ThemedText style={styles.label}>{t('sessionName').toUpperCase()}</ThemedText><TextInput value={name} onChangeText={setName} placeholder={exerciseName ?? `${t('workoutName')} · ${t('optional')}`} placeholderTextColor={palette.muted} style={styles.input} /></View>
      <View style={styles.fieldCard}><ThemedText style={styles.label}>{t('note').toUpperCase()}</ThemedText><TextInput value={notes} onChangeText={setNotes} placeholder={`${t('howDidItGo')} · ${t('optional')}`} placeholderTextColor={palette.muted} style={[styles.input, styles.noteInput]} multiline /></View>
    </KeyboardAwareScrollView>
    <Pressable onPress={save} disabled={addManualSession.isPending} style={[styles.save, addManualSession.isPending && styles.disabled]}>{addManualSession.isPending ? <ActivityIndicator color={palette.background} /> : <ThemedText style={styles.saveText}>{(exerciseName ? t('saveAndAddSets') : t('saveAndAddExercises')).toUpperCase()}</ThemedText>}</Pressable>
  </SafeAreaView></ThemedView>;
}
function cardShadowFor(palette: ReturnType<typeof useNutritionPalette>) { return palette.background === '#FAFAF8' ? { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 } : {}; }
const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => softSheet({ page: { flex: 1, backgroundColor: palette.background }, safeArea: { flex: 1, paddingHorizontal: Spacing.three }, content: { flexGrow: 1, gap: Spacing.three, paddingVertical: Spacing.four }, fieldCard: { ...cardShadowFor(palette), backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: Spacing.three, gap: Spacing.two }, label: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 }, dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.raised }, stepText: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 18 }, dateValue: { color: palette.text, fontFamily: Fonts.metric, fontSize: 22 }, input: { color: palette.text, fontFamily: Fonts.regular, fontSize: 16, borderBottomWidth: 1, borderColor: palette.border, paddingVertical: Spacing.one }, noteInput: { minHeight: 80, textAlignVertical: 'top' }, save: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.blue, marginBottom: Spacing.three }, saveText: { color: palette.background, fontFamily: Fonts.bold, fontSize: 13, letterSpacing: 0.6 }, disabled: { opacity: 0.45 } });

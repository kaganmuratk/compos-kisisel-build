import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNutritionPalette } from '@/components/nutrition-ui';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { usePrograms, useStartSessionFromDay } from '@/db/queries/programs';
import { useStartSession, useTodaySessionCount } from '@/db/queries/workout';
import { defaultSessionTitle, getTodayDateString } from '@/lib/date';
import { useT } from '@/lib/i18n';
import { TextInput } from '@/components/text-input';
import { KEYBOARD_BAR_CLEARANCE } from '@/components/keyboard-done-bar';

export default function StartWorkoutScreen() {
  const { t } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { dayId } = useLocalSearchParams<{ dayId?: string }>();
  const { data: programs = [] } = usePrograms();
  const { data: todayCount } = useTodaySessionCount();
  const startSession = useStartSession();
  const startSessionFromDay = useStartSessionFromDay();
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [notes, setNotes] = useState('');
  const [showPrograms, setShowPrograms] = useState(false);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(dayId ?? null);

  useEffect(() => {
    if (!nameTouched && todayCount !== undefined) setName(defaultSessionTitle(getTodayDateString(), todayCount));
  }, [todayCount, nameTouched]);

  const starting = startSession.isPending || startSessionFromDay.isPending;
  const selectedDay = programs.flatMap((program) => program.days.map((day) => ({ ...day, programName: program.name }))).find((day) => day.id === selectedDayId);
  const start = async () => {
    const values = { name: name.trim() || undefined, notes: notes.trim() || undefined };
    const session = selectedDayId ? await startSessionFromDay.mutateAsync({ dayId: selectedDayId, ...values }) : await startSession.mutateAsync(values);
    if (session) router.replace({ pathname: '/workout/[sessionId]', params: { sessionId: String(session.id) } });
  };

  return (
    <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          eyebrow={t('training').toUpperCase()}
          title={t('startWorkoutLabel').toUpperCase()}
          accentColor={palette.blue}
          backHref="/(tabs)"
        />
        <KeyboardAwareScrollView bottomOffset={KEYBOARD_BAR_CLEARANCE} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.fieldCard}>
            <ThemedText style={styles.fieldLabel}>{t('sessionName').toUpperCase()}</ThemedText>
            <TextInput value={name} onChangeText={(text) => { setName(text); setNameTouched(true); }} placeholder={t('workoutName')} placeholderTextColor={palette.muted} style={styles.titleInput} />
          </View>
          <Pressable onPress={() => setShowPrograms((visible) => !visible)} style={styles.disclosure}>
            <View><ThemedText style={styles.fieldLabel}>{t('program').toUpperCase()}</ThemedText><ThemedText style={styles.disclosureValue}>{selectedDay ? `${selectedDay.programName} · ${selectedDay.name}` : t('noProgramSelected').toUpperCase()}</ThemedText></View>
            <ThemedText style={styles.disclosureAction}>{showPrograms ? '−' : '+'}</ThemedText>
          </Pressable>
          {showPrograms && <View style={styles.optionPanel}>
            {programs.length === 0 ? (
              <>
                <ThemedText style={styles.empty}>{t('noProgramsFreeWorkout').toUpperCase()}</ThemedText>
                <Pressable onPress={() => router.push('/programs/new')} style={styles.manageProgramsButton}>
                  <ThemedText style={styles.manageProgramsLabel}>{t('createProgram').toUpperCase()}</ThemedText>
                </Pressable>
              </>
            ) : (
              <>
                {programs.map((program) => <View key={program.id} style={styles.programGroup}><ThemedText style={styles.programName}>{program.name}</ThemedText>{program.days.map((day) => { const selected = day.id === selectedDayId; return <Pressable key={day.id} onPress={() => setSelectedDayId(selected ? null : day.id)} style={[styles.optionRow, selected && styles.optionRowSelected]}><ThemedText style={[styles.optionMark, selected && styles.optionMarkSelected]}>{selected ? '✓' : '○'}</ThemedText><ThemedText style={styles.optionText}>{day.name}</ThemedText></Pressable>; })}</View>)}
                <Pressable onPress={() => router.push('/programs')} style={styles.manageProgramsButton}>
                  <ThemedText style={styles.manageProgramsLabel}>{t('managePrograms').toUpperCase()}</ThemedText>
                </Pressable>
              </>
            )}
          </View>}
          <Pressable onPress={() => setShowNote((visible) => !visible)} style={styles.disclosure}>
            <View><ThemedText style={styles.fieldLabel}>{t('note').toUpperCase()}</ThemedText><ThemedText style={styles.disclosureValue}>{notes ? t('noteAdded').toUpperCase() : t('optional').toUpperCase()}</ThemedText></View>
            <ThemedText style={styles.disclosureAction}>{showNote ? '−' : '+'}</ThemedText>
          </Pressable>
          {showNote && <TextInput value={notes} onChangeText={setNotes} placeholder={t('howFeelToday')} placeholderTextColor={palette.muted} style={styles.noteInput} multiline />}
        </KeyboardAwareScrollView>
        <Pressable onPress={start} disabled={starting} style={[styles.startButton, starting && styles.buttonDisabled]}>{starting ? <ActivityIndicator color={palette.background} /> : <ThemedText style={styles.startLabel}>{t('startWorkoutLabel').toUpperCase()}</ThemedText>}</Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

function cardShadowFor(palette: ReturnType<typeof useNutritionPalette>) { return palette.background === '#FAFAF8' ? { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 } : {}; }
const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background }, safeArea: { flex: 1, paddingHorizontal: Spacing.three },
  content: { paddingVertical: Spacing.four, gap: Spacing.three, flexGrow: 1 },
  fieldCard: { ...cardShadowFor(palette), backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: Spacing.three, gap: Spacing.two }, fieldLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.9 },
  titleInput: { color: palette.text, fontFamily: Fonts.metric, fontSize: 22, lineHeight: 28, borderBottomWidth: 1, borderColor: palette.border, paddingVertical: Spacing.one },
  disclosure: { ...cardShadowFor(palette), minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, paddingHorizontal: Spacing.three }, disclosureValue: { color: palette.text, fontFamily: Fonts.regular, fontSize: 14, marginTop: 3 }, disclosureAction: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 22 },
  optionPanel: { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: Spacing.two, gap: Spacing.two }, empty: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.6, padding: Spacing.one }, programGroup: { gap: Spacing.one }, programName: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.8, paddingHorizontal: Spacing.one }, optionRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.two, backgroundColor: palette.raised, borderWidth: 1, borderColor: palette.border }, optionRowSelected: { borderColor: palette.blue }, optionMark: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 16 }, optionMarkSelected: { color: palette.blue }, optionText: { color: palette.text, fontFamily: Fonts.regular, fontSize: 14 },
  manageProgramsButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.raised },
  manageProgramsLabel: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.8 },
  noteInput: { minHeight: 90, color: palette.text, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: Spacing.three, fontFamily: Fonts.regular, fontSize: 15, textAlignVertical: 'top' },
  startButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.blue, marginBottom: Spacing.three }, buttonDisabled: { opacity: 0.6 }, startLabel: { color: palette.background, fontFamily: Fonts.bold, fontSize: 14, letterSpacing: 0.7 },
});

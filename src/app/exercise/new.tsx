import { router } from 'expo-router';
import { useMemo, useState, type CSSProperties } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { PaletteText as ThemedText, useNutritionPalette } from '@/components/nutrition-ui';
import { ScreenHeader } from '@/components/screen-header';
import { useAddExercise, useExercises, useTransferExerciseHistory } from '@/db/queries/exercises';
import { exerciseCategories } from '@/db/seed-data';
import { exerciseCategoryLabels } from '@/lib/exercise-category';
import { useT } from '@/lib/i18n';
import { TextInput } from '@/components/text-input';
import { softSheet } from '@/constants/soft-sheet';


export default function NewExerciseScreen() {const palette=useNutritionPalette();const styles=useMemo(()=>createStyles(palette),[palette]);
  const { t } = useT();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<(typeof exerciseCategories)[number]>(exerciseCategories[0]);
  const [isBodyweight, setIsBodyweight] = useState(false);
  const [weightMode, setWeightMode] = useState<'kg' | 'pin'>('kg');
  const [transferFromId, setTransferFromId] = useState<string | null>(null);
  const [addManualHistory, setAddManualHistory] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savePhase, setSavePhase] = useState<string | null>(null);
  const addExercise = useAddExercise();
  const transferHistory = useTransferExerciseHistory();
  const { data: existingExercises = [] } = useExercises();
  const saving = addExercise.isPending;

  const save = async () => {
    if (!name.trim()) {
      return;
    }
    setSaveError(null);
    setSavePhase(null);
    try {
      const created = await addExercise.mutateAsync({
        name: name.trim(),
        category,
        isBodyweight,
        weightMode,
        onPhase: setSavePhase,
      });
      if (!created) {
        setSaveError(t('couldNotAddExercise'));
        return;
      }
      if (transferFromId) {
        await transferHistory.mutateAsync({ fromExerciseId: transferFromId, toExerciseId: created.id });
      }
      if (addManualHistory) {
        router.replace({ pathname: '/workout/manual', params: { exerciseId: created.id, exerciseName: created.name } });
        return;
      }
      router.back();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('couldNotAddExercise'));
    }
  };

  return (
    <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.page}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScreenHeader onBack={() => router.back()} eyebrow="WORKOUT" title="NEW EXERCISE" accentColor={palette.blue} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.fieldCard}>
            <ThemedText style={styles.label}>NAME</ThemedText>
            <TextInput
              autoFocus
              value={name}
              onChangeText={setName}
              placeholder={t('exerciseName')}
              placeholderTextColor={palette.muted}
              style={styles.input}
            />
          </View>

          <View style={styles.chipSection}>
            <ThemedText style={styles.label}>CATEGORY</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {exerciseCategories.map((c) => (
                <Pressable key={c} onPress={() => setCategory(c)} style={[styles.chip, c === category && styles.chipSelected]}>
                  <ThemedText style={[styles.chipLabel, c === category && styles.chipLabelSelected]}>
                    {(exerciseCategoryLabels[c] ?? c).toUpperCase()}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.flagRow}>
            <Pressable onPress={() => setIsBodyweight((v) => !v)} style={[styles.chip, isBodyweight && styles.chipSelected]}>
              <ThemedText style={[styles.chipLabel, isBodyweight && styles.chipLabelSelected]}>BODYWEIGHT</ThemedText>
            </Pressable>
            <Pressable onPress={() => setWeightMode((m) => (m === 'pin' ? 'kg' : 'pin'))} style={[styles.chip, weightMode === 'pin' && styles.chipSelected]}>
              <ThemedText style={[styles.chipLabel, weightMode === 'pin' && styles.chipLabelSelected]}>PIN WEIGHT</ThemedText>
            </Pressable>
          </View>

          {existingExercises.length > 0 && (
            <View style={styles.chipSection}>
              <ThemedText style={styles.label}>TRANSFER HISTORY · OPTIONAL</ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <Pressable onPress={() => setTransferFromId(null)} style={[styles.chip, transferFromId === null && styles.chipSelected]}>
                  <ThemedText style={[styles.chipLabel, transferFromId === null && styles.chipLabelSelected]}>NONE</ThemedText>
                </Pressable>
                {existingExercises.map((ex) => (
                  <Pressable key={ex.id} onPress={() => setTransferFromId(ex.id)} style={[styles.chip, transferFromId === ex.id && styles.chipSelected]}>
                    <ThemedText style={[styles.chipLabel, transferFromId === ex.id && styles.chipLabelSelected]}>{ex.name.toUpperCase()}</ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          <Pressable onPress={() => setAddManualHistory((v) => !v)} style={[styles.chip, styles.manualHistoryChip, addManualHistory && styles.chipSelected]}>
            <ThemedText style={[styles.chipLabel, addManualHistory && styles.chipLabelSelected]}>LOG PAST SETS AFTER SAVING</ThemedText>
          </Pressable>

          {savePhase && <ThemedText style={styles.phaseText}>SAVE PHASE: {savePhase}</ThemedText>}
          {saveError && <ThemedText style={styles.errorText}>{saveError}</ThemedText>}
        </ScrollView>

        {Platform.OS === 'web' ? (
          <button
            type="button"
            aria-label="Save exercise"
            onClick={save}
            disabled={!name.trim() || saving}
            style={
              {
                minHeight: 52,
                height: 52,
                width: '100%',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                marginBottom: Spacing.three,
                backgroundColor: palette.blue,
                color: palette.background,
                fontFamily: Fonts.bold,
                fontSize: 14,
                letterSpacing: 0.7,
                opacity: name.trim() && !saving ? 1 : 0.45,
              } as CSSProperties
            }>
            SAVE EXERCISE
          </button>
        ) : (
          <Pressable onPress={save} disabled={!name.trim() || saving} style={[styles.saveButton, (!name.trim() || saving) && styles.disabled]}>
            {saving ? <ActivityIndicator color={palette.background} /> : <ThemedText style={styles.saveLabel}>SAVE EXERCISE</ThemedText>}
          </Pressable>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const createStyles=(palette:ReturnType<typeof useNutritionPalette>)=>softSheet({
  page: { flex: 1, backgroundColor: palette.background },
  safeArea: { flex: 1, paddingHorizontal: Spacing.three },
  content: { flexGrow: 1, paddingVertical: Spacing.four, gap: Spacing.three },
  fieldCard: { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: Spacing.three, gap: Spacing.two },
  label: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 },
  input: { color: palette.text, fontFamily: Fonts.regular, fontSize: 17, borderBottomWidth: 1, borderColor: palette.border, paddingVertical: Spacing.one },
  chipSection: { gap: Spacing.two },
  chipRow: { gap: Spacing.two },
  flagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
  },
  chipSelected: { backgroundColor: palette.blue, borderColor: palette.blue },
  chipLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 0.8 },
  chipLabelSelected: { color: palette.background },
  manualHistoryChip: { alignSelf: 'flex-start' },
  phaseText: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.7 },
  errorText: { color: palette.red, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 0.5 },
  saveButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.blue, marginBottom: Spacing.three },
  saveLabel: { color: palette.background, fontFamily: Fonts.bold, fontSize: 14, letterSpacing: 0.7 },
  disabled: { opacity: 0.45 },
});

import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, SectionList, View } from 'react-native';
import { useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNutritionPalette } from '@/components/nutrition-ui';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useExercises, useMostUsedExercises } from '@/db/queries/exercises';
import { useAddExerciseToSession } from '@/db/queries/workout';
import { exerciseCategories } from '@/db/seed-data';
import { alertMessage } from '@/lib/alert';
import { exerciseCategoryLabels } from '@/lib/exercise-category';
import { useT } from '@/lib/i18n';
import { TextInput } from '@/components/text-input';
import { softSheet } from '@/constants/soft-sheet';

export default function AddExerciseScreen() {
  const { t } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { data: exercises = [] } = useExercises();
  const { data: mostUsed = [] } = useMostUsedExercises();
  const [search, setSearch] = useState('');
  const addExercise = useAddExerciseToSession(sessionId);
  const normalizedSearch = search.trim().toLowerCase();
  const filterExercises = (items: typeof exercises) => normalizedSearch ? items.filter((exercise) => exercise.name.toLowerCase().includes(normalizedSearch)) : items;
  const sections = [
    ...(mostUsed.length > 0 ? [{ title: t('frequentlyUsed').toUpperCase(), data: filterExercises(mostUsed) }] : []),
    ...exerciseCategories.map((title) => ({ title: exerciseCategoryLabels[title] ?? title.toUpperCase(), data: filterExercises(exercises.filter((exercise) => exercise.category === title)) })).filter((section) => section.data.length > 0),
  ];
  const pick = async (exerciseId: string) => {
    if (addExercise.isPending) return;
    try { await addExercise.mutateAsync(exerciseId); router.back(); }
    catch { alertMessage(t('couldNotAddExercise'), t('pleaseTryAgain')); }
  };
  return (
    <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.page}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScreenHeader onBack={() => router.back()} eyebrow={t('workout').toUpperCase()} title={t('addExercise').toUpperCase()} accentColor={palette.blue} trailing={<Pressable accessibilityLabel={t('newExercise')} onPress={() => router.push('/exercise/new')} hitSlop={10} style={styles.newButton}><ThemedText style={styles.newText}>+</ThemedText></Pressable>} />
        <TextInput value={search} onChangeText={setSearch} placeholder={t('searchExercises').toUpperCase()} placeholderTextColor={palette.muted} style={styles.searchInput} autoCorrect={false} />
        <SectionList sections={sections} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.list} stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => <ThemedText style={styles.section}>{section.title}</ThemedText>}
          renderItem={({ item }) => <Pressable accessibilityLabel={`${t('add')} ${item.name}`} onPress={() => pick(item.id)} disabled={addExercise.isPending} style={({ pressed }) => [styles.row, (pressed || addExercise.isPending) && styles.pressed]}><ThemedText style={styles.rowName}>{item.name}</ThemedText><ThemedText style={styles.rowAction}>+</ThemedText></Pressable>}
          ListEmptyComponent={<ThemedText style={styles.empty}>{t('createExercise').toUpperCase()}</ThemedText>} />
      </SafeAreaView>
    </ThemedView>
  );
}

function cardShadowFor(palette: ReturnType<typeof useNutritionPalette>) { return palette.background === '#FAFAF8' ? { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 } : {}; }
const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => softSheet({
  page: { flex: 1, backgroundColor: palette.background }, safeArea: { flex: 1, paddingHorizontal: Spacing.three },
  newButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.blue }, newText: { color: palette.background, fontFamily: Fonts.technical, fontSize: 20 },
  list: { paddingBottom: Spacing.six }, section: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1, paddingTop: Spacing.three, paddingBottom: Spacing.one },
  searchInput: { ...cardShadowFor(palette), minHeight: 48, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, color: palette.text, paddingHorizontal: Spacing.three, fontFamily: Fonts.technical, fontSize: 11, letterSpacing: 0.5 }, row: { ...cardShadowFor(palette), minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, marginBottom: Spacing.one, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }, rowName: { color: palette.text, fontFamily: Fonts.regular, fontSize: 15 }, rowAction: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 20 }, pressed: { opacity: 0.6 }, empty: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 0.6, paddingTop: Spacing.four },
});

import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';

import { FoodMacroDetail } from '@/components/food-macro-detail';
import { NutritionEmpty, NutritionPage, NutritionPrimaryButton, NutritionTextButton, useNutritionPalette, useNutritionUi } from '@/components/nutrition-ui';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { getMealCategoryLabel, useMealCategories } from '@/db/queries/meal-categories';
import { useAddCustomFood, useAddNutritionLog, useFoodSearch, useRecentFoods, type MealType } from '@/db/queries/nutrition';
import { alertMessage } from '@/lib/alert';
import { getTodayDateString } from '@/lib/date';
import { getFoodCategoryLabel } from '@/lib/food-category';
import { getFoodNameLabel } from '@/lib/food-name';
import { caloriesFromMacros, parsePortions } from '@/lib/nutrition';
import { useT } from '@/lib/i18n';
import { TextInput } from '@/components/text-input';
import { softSheet } from '@/constants/soft-sheet';

const defaultMealTime: Record<string, string> = { breakfast: '08:00', lunch: '13:00', dinner: '19:00', snack: '16:00' };
const currentTimeString = () => { const now = new Date(); return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`; };

export default function AddFoodScreen() {
  const { t, language } = useT();
  const palette = useNutritionPalette();
  const nutritionUi = useNutritionUi();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { mealType, date } = useLocalSearchParams<{ mealType: MealType; date?: string }>();
  const { data: categories = [] } = useMealCategories();
  const mealLabel = getMealCategoryLabel(categories, mealType);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState('100');
  const [quickAdd, setQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickCalories, setQuickCalories] = useState('');
  const [quickProtein, setQuickProtein] = useState('');
  const [quickCarbs, setQuickCarbs] = useState('');
  const [quickFat, setQuickFat] = useState('');
  const isPastDate = date != null && date !== getTodayDateString();
  const [eatenAt, setEatenAt] = useState(isPastDate ? (defaultMealTime[mealType] ?? '12:00') : currentTimeString());
  const { data: searchResults = [] } = useFoodSearch(query);
  const { data: recentFoods = [] } = useRecentFoods();
  const addLog = useAddNutritionLog();
  const addCustomFood = useAddCustomFood();
  const isSearching = query.trim().length >= 2;
  const results = isSearching ? searchResults : recentFoods;
  const selectedFood = results.find((food) => food.id === selectedId);
  const quickMacroValues = [quickProtein, quickCarbs, quickFat];
  const quickValues = [quickCalories, ...quickMacroValues].filter((value) => value.trim());
  const quickCanSave = quickValues.length > 0 && quickValues.every((value) => Number.isFinite(Number(value)) && Number(value) >= 0);

  const save = async () => {
    if (!selectedId || !amount) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(eatenAt)) {
      alertMessage('Invalid time', 'Use 24-hour time, for example 08:30.');
      return;
    }
    const logDate = date ?? getTodayDateString();
    await addLog.mutateAsync({
      foodId: selectedId,
      mealType,
      amountGrams: Number(amount),
      date: logDate,
      loggedAt: new Date(`${logDate}T${eatenAt}:00`).toISOString(),
    });
    router.back();
  };

  const saveQuickEntry = async () => {
    if (!quickCanSave) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(eatenAt)) {
      alertMessage('Invalid time', 'Use 24-hour time, for example 08:30.');
      return;
    }
    const protein = Number(quickProtein) || 0;
    const carbs = Number(quickCarbs) || 0;
    const fat = Number(quickFat) || 0;
    const calories = quickCalories.trim() ? Number(quickCalories) : caloriesFromMacros(protein, carbs, fat);
    const logDate = date ?? getTodayDateString();
    const foodId = await addCustomFood.mutateAsync({ name: quickName.trim() || 'Quick entry', category: 'Quick entry', caloriesPer100g: calories, proteinPer100g: protein, carbsPer100g: carbs, fatPer100g: fat });
    await addLog.mutateAsync({ foodId, mealType, amountGrams: 100, date: logDate, loggedAt: new Date(`${logDate}T${eatenAt}:00`).toISOString() });
    router.back();
  };

  if (selectedFood) {
    return (
      <NutritionPage title={getFoodNameLabel(selectedFood.name, language)} subtitle={`${mealLabel.toUpperCase()} · VALUES PER 100G`} onBack={() => setSelectedId(null)}>
        <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
          <View style={nutritionUi.card}>
            <ThemedText style={nutritionUi.technicalLabel}>{t('amount').toUpperCase()}</ThemedText>
            <View style={styles.amountRow}>
              <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={[nutritionUi.input, styles.amountInput]} />
              <ThemedText style={styles.unit}>{t('grams').toUpperCase()}</ThemedText>
            </View>
            <View style={styles.portionRow}>
              {parsePortions(selectedFood.portions).map((portion) => (
                <Pressable key={portion.label} onPress={() => setAmount(String(portion.grams))} style={styles.portionChip}>
                  <ThemedText style={styles.portionText}>{portion.label.toUpperCase()} · {portion.grams}G</ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={nutritionUi.card}>
            <ThemedText style={nutritionUi.technicalLabel}>{t('timeEaten').toUpperCase()}</ThemedText>
            <TextInput value={eatenAt} onChangeText={setEatenAt} placeholder="08:30" placeholderTextColor={palette.muted} keyboardType="numbers-and-punctuation" maxLength={5} style={[nutritionUi.input, styles.timeInput]} />
            {isPastDate ? <ThemedText style={nutritionUi.mutedText}>Pre/post-workout placement uses this time.</ThemedText> : null}
          </View>
          <FoodMacroDetail food={selectedFood} amountGrams={Number(amount) || 0} />
        </ScrollView>
        <NutritionPrimaryButton label={t('addFood').toUpperCase()} onPress={save} disabled={!amount} pending={addLog.isPending} />
      </NutritionPage>
    );
  }

  if (quickAdd) {
    const fields = [{ label: 'KCAL', value: quickCalories, set: setQuickCalories }, { label: 'PROTEIN', value: quickProtein, set: setQuickProtein }, { label: 'CARBS', value: quickCarbs, set: setQuickCarbs }, { label: 'FAT', value: quickFat, set: setQuickFat }];
    return <NutritionPage title={t('quickAdd')} subtitle={`${mealLabel.toUpperCase()} · ${t('valuesPer100g').toUpperCase()}`} onBack={() => setQuickAdd(false)}><ScrollView contentContainerStyle={styles.detailContent} keyboardShouldPersistTaps="handled"><View style={nutritionUi.card}><ThemedText style={nutritionUi.technicalLabel}>{t('optionalName').toUpperCase()}</ThemedText><TextInput value={quickName} onChangeText={setQuickName} placeholder={t('quickEntry')} placeholderTextColor={palette.muted} style={nutritionUi.input} /></View><View style={styles.macroGrid}>{fields.map((field) => <View key={field.label} style={[nutritionUi.card, styles.macroField]}><ThemedText style={nutritionUi.technicalLabel}>{field.label}</ThemedText><TextInput value={field.value} onChangeText={field.set} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={palette.muted} style={[nutritionUi.input, styles.macroInput]} /></View>)}</View><View style={nutritionUi.card}><ThemedText style={nutritionUi.technicalLabel}>{t('timeEaten').toUpperCase()}</ThemedText><TextInput value={eatenAt} onChangeText={setEatenAt} placeholder="08:30" placeholderTextColor={palette.muted} keyboardType="numbers-and-punctuation" maxLength={5} style={[nutritionUi.input, styles.timeInput]} /></View></ScrollView><NutritionPrimaryButton label={t('addEntry').toUpperCase()} onPress={saveQuickEntry} disabled={!quickCanSave} pending={addCustomFood.isPending || addLog.isPending} /></NutritionPage>;
  }

  return (
    <NutritionPage
      title={mealLabel}
      subtitle={t('selectFood').toUpperCase()}
      right={<View style={styles.headerActions}><NutritionTextButton label={t('quickAdd').toUpperCase()} tone="accent" onPress={() => setQuickAdd(true)} /><NutritionTextButton label={t('newFood').toUpperCase()} tone="accent" onPress={() => router.push('/nutrition/new-food')} /></View>}>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search foods" placeholderTextColor={palette.muted} autoFocus style={nutritionUi.input} />
      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[nutritionUi.listContent, styles.foodList]}
        ListHeaderComponent={!isSearching && recentFoods.length > 0 ? <ThemedText style={styles.listLabel}>RECENTLY USED</ThemedText> : null}
        renderItem={({ item }) => (
          <Pressable onPress={() => setSelectedId(item.id)} style={nutritionUi.card}>
            <ThemedText style={nutritionUi.bodyText}>{getFoodNameLabel(item.name, language)}</ThemedText>
            <ThemedText style={nutritionUi.mutedText}>{getFoodCategoryLabel(item.category, language).toUpperCase()} · {Math.round(item.caloriesPer100g)} KCAL / 100G</ThemedText>
          </Pressable>
        )}
        ListEmptyComponent={<NutritionEmpty>{isSearching ? 'NO MATCHING FOOD FOUND' : 'SEARCH OR ADD YOUR FIRST FOOD'}</NutritionEmpty>}
      />
    </NutritionPage>
  );
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => softSheet({
  foodList: { paddingTop: Spacing.three },
  listLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1, marginBottom: Spacing.one },
  detailContent: { gap: Spacing.three, paddingBottom: Spacing.four },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  amountInput: { width: 110, textAlign: 'center', fontFamily: Fonts.metric, fontSize: 25 },
  unit: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 },
  timeInput: { width: 120, fontFamily: Fonts.technical },
  portionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  portionChip: { borderWidth: 1, borderColor: palette.border, backgroundColor: palette.raised, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two },
  portionText: { color: palette.text, fontFamily: Fonts.technical, fontSize: 8 },
  headerActions: { flexDirection: 'row', gap: Spacing.two },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  macroField: { width: '49%' },
  macroInput: { textAlign: 'center' },
});

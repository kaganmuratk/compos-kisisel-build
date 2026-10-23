import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FoodMacroDetail } from '@/components/food-macro-detail';
import { NutritionEmpty, NutritionPage, NutritionPrimaryButton, PaletteText as ThemedText, useNutritionPalette, useNutritionUi } from '@/components/nutrition-ui';
import { Fonts, Spacing } from '@/constants/theme';
import { getMealCategoryLabel, useMealCategories } from '@/db/queries/meal-categories';
import { useFoodSearch, type MealType } from '@/db/queries/nutrition';
import { useAddMealToPlan } from '@/db/queries/nutrition-plans';
import { getFoodCategoryLabel } from '@/lib/food-category';
import { getFoodNameLabel } from '@/lib/food-name';
import { useT } from '@/lib/i18n';
import { parsePortions } from '@/lib/nutrition';
import { TextInput } from '@/components/text-input';

export default function AddFoodToPlanScreen() {
  const nutritionUi = useNutritionUi();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { t, language } = useT();
  const { planId, mealType } = useLocalSearchParams<{ planId: string; mealType: MealType }>();
  const { data: categories = [] } = useMealCategories();
  const mealLabel = getMealCategoryLabel(categories, mealType);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState('100');
  const { data: results = [] } = useFoodSearch(query);
  const addMeal = useAddMealToPlan(planId);
  const selectedFood = results.find((food) => food.id === selectedId);
  const save = async () => { if (!selectedId || !amount) return; await addMeal.mutateAsync({ foodId: selectedId, mealType, amountGrams: Number(amount) }); router.back(); };

  if (selectedFood) {
    return (
      <NutritionPage title={getFoodNameLabel(selectedFood.name, language)} subtitle={`${mealLabel.toUpperCase()} · ${t('planFood').toUpperCase()}`} onBack={() => setSelectedId(null)}>
        <ScrollView contentContainerStyle={styles.detailContent}>
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
          <FoodMacroDetail food={selectedFood} amountGrams={Number(amount) || 0} />
        </ScrollView>
        <NutritionPrimaryButton label={t('addToPlan').toUpperCase()} onPress={save} disabled={!amount} pending={addMeal.isPending} />
      </NutritionPage>
    );
  }

  return (
    <NutritionPage title={mealLabel} subtitle={t('searchFoodForThisPlan').toUpperCase()}>
      <TextInput value={query} onChangeText={setQuery} placeholder={t('searchFoods')} placeholderTextColor={palette.muted} autoFocus style={nutritionUi.input} />
      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[nutritionUi.listContent, styles.list]}
        renderItem={({ item }) => (
          <Pressable onPress={() => setSelectedId(item.id)} style={nutritionUi.card}>
            <ThemedText style={nutritionUi.bodyText}>{getFoodNameLabel(item.name, language)}</ThemedText>
            <ThemedText style={nutritionUi.mutedText}>{getFoodCategoryLabel(item.category, language).toUpperCase()} · {Math.round(item.caloriesPer100g)} {t('kcal').toUpperCase()} / 100G</ThemedText>
          </Pressable>
        )}
        ListEmptyComponent={<NutritionEmpty>{query.trim().length < 2 ? t('typeAtLeastTwoCharacters').toUpperCase() : t('noMatchingFoodFound').toUpperCase()}</NutritionEmpty>}
      />
    </NutritionPage>
  );
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({
  list: { paddingTop: Spacing.three },
  detailContent: { gap: Spacing.three, paddingBottom: Spacing.four },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  amountInput: { width: 110, textAlign: 'center', fontFamily: Fonts.metric, fontSize: 25 },
  unit: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 },
  portionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  portionChip: { borderWidth: 1, borderColor: palette.border, backgroundColor: palette.raised, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two },
  portionText: { color: palette.text, fontFamily: Fonts.technical, fontSize: 8 },
});

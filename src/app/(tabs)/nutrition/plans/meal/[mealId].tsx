import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { FoodMacroDetail } from '@/components/food-macro-detail';
import { NutritionEmpty, NutritionPage, PaletteText as ThemedText, TrashIcon, useNutritionPalette, useNutritionUi } from '@/components/nutrition-ui';
import { Fonts, Spacing } from '@/constants/theme';
import { usePlanMeal, useRemoveMealFromPlan, useUpdatePlanMeal } from '@/db/queries/nutrition-plans';
import { getFoodNameLabel } from '@/lib/food-name';
import { useT } from '@/lib/i18n';

export default function PlanMealDetailScreen() {
  const nutritionUi = useNutritionUi();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { t, language } = useT();
  const { mealId, planId } = useLocalSearchParams<{ mealId: string; planId: string }>();
  const { data: meal } = usePlanMeal(mealId);
  const updateMeal = useUpdatePlanMeal(planId);
  const removeMeal = useRemoveMealFromPlan(planId);
  const [amount, setAmount] = useState('');
  useEffect(() => { if (meal) setAmount(String(meal.amountGrams)); }, [meal]);

  const saveAmount = () => {
    if (!meal) return;
    const parsed = Number(amount);
    if (!amount || Number.isNaN(parsed) || parsed <= 0) { setAmount(String(meal.amountGrams)); return; }
    updateMeal.mutate({ id: mealId, amountGrams: parsed });
  };
  const performRemove = async () => { await removeMeal.mutateAsync(mealId); router.back(); };
  const confirmDelete = () => {
    if (!meal) return;
    if (Platform.OS === 'web') {
      if (window.confirm(t('removeFoodConfirm'))) performRemove();
      return;
    }
    Alert.alert(t('removeFood'), t('removeFoodConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('remove'), style: 'destructive', onPress: performRemove },
    ]);
  };

  return (
    <NutritionPage
      title={meal ? getFoodNameLabel(meal.food.name, language) : t('planFood')}
      subtitle={t('editPlanEntry').toUpperCase()}
      right={
        <Pressable accessibilityLabel={t('remove')} onPress={confirmDelete} hitSlop={8} style={styles.removeButton}>
          <TrashIcon size={18} color={palette.red} />
        </Pressable>
      }>
      {!meal ? (
        <NutritionEmpty>{t('loadingPlanFood').toUpperCase()}</NutritionEmpty>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={nutritionUi.card}>
            <ThemedText style={nutritionUi.technicalLabel}>{t('amount').toUpperCase()}</ThemedText>
            <View style={styles.amountRow}>
              <TextInput value={amount} onChangeText={setAmount} onEndEditing={saveAmount} onBlur={saveAmount} keyboardType="decimal-pad" style={[nutritionUi.input, styles.amountInput]} />
              <ThemedText style={styles.unit}>{t('grams').toUpperCase()}</ThemedText>
            </View>
          </View>
          <FoodMacroDetail food={meal.food} amountGrams={Number(amount) || meal.amountGrams} />
        </ScrollView>
      )}
    </NutritionPage>
  );
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({
  content: { gap: Spacing.three, paddingBottom: Spacing.six },
  removeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  amountInput: { width: 110, textAlign: 'center', fontFamily: Fonts.metric, fontSize: 25 },
  unit: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 },
});

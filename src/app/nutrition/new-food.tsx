import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { NutritionPage, NutritionPrimaryButton, useNutritionPalette, useNutritionUi } from '@/components/nutrition-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAddCustomFood } from '@/db/queries/nutrition';
import { useT } from '@/lib/i18n';
import { TextInput } from '@/components/text-input';
import { softSheet } from '@/constants/soft-sheet';

export default function NewFoodScreen() {
  const { t } = useT();
  const palette = useNutritionPalette();
  const nutritionUi = useNutritionUi();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const addFood = useAddCustomFood();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const canSave = Boolean(name.trim() && calories && protein && carbs && fat);

  const save = async () => {
    if (!canSave) return;
    await addFood.mutateAsync({
      name: name.trim(),
      category: category.trim() || 'Other',
      caloriesPer100g: Number(calories),
      proteinPer100g: Number(protein),
      carbsPer100g: Number(carbs),
      fatPer100g: Number(fat),
    });
    router.back();
  };

  const macroFields = [
    { label: 'KCAL', value: calories, set: setCalories },
    { label: 'PROTEIN', value: protein, set: setProtein },
    { label: 'CARBS', value: carbs, set: setCarbs },
    { label: 'FAT', value: fat, set: setFat },
  ];

  return (
    <NutritionPage title={t('newFood')} subtitle={t('valuesPer100g').toUpperCase()}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={nutritionUi.card}>
          <ThemedText style={nutritionUi.technicalLabel}>IDENTITY</ThemedText>
          <TextInput value={name} onChangeText={setName} onChange={(event) => setName(event.nativeEvent.text)} placeholder={t('foodName')} placeholderTextColor={palette.muted} style={nutritionUi.input} />
          <TextInput value={category} onChangeText={setCategory} onChange={(event) => setCategory(event.nativeEvent.text)} placeholder={t('categoryOptional')} placeholderTextColor={palette.muted} style={nutritionUi.input} />
        </View>
        <View style={styles.macroGrid}>
          {macroFields.map((field) => (
            <View key={field.label} style={[nutritionUi.card, styles.macroField]}>
              <ThemedText style={nutritionUi.technicalLabel}>{field.label}</ThemedText>
              <TextInput value={field.value} onChangeText={field.set} onChange={(event) => field.set(event.nativeEvent.text)} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={palette.muted} style={[nutritionUi.input, styles.macroInput]} />
            </View>
          ))}
        </View>
      </ScrollView>
      <NutritionPrimaryButton label={t('saveFood').toUpperCase()} onPress={save} disabled={!canSave} pending={addFood.isPending} />
    </NutritionPage>
  );
}

const createStyles = (_palette: ReturnType<typeof useNutritionPalette>) => softSheet({
  content: { gap: Spacing.three, paddingBottom: Spacing.four },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  macroField: { width: '49%' },
  macroInput: { textAlign: 'center' },
});

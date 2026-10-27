import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { NutritionPage, NutritionPrimaryButton, PaletteText as ThemedText, useNutritionPalette, useNutritionUi } from '@/components/nutrition-ui';
import { Spacing } from '@/constants/theme';
import { useAddNutritionPlan } from '@/db/queries/nutrition-plans';
import { useT } from '@/lib/i18n';
import { TextInput } from '@/components/text-input';
import { softSheet } from '@/constants/soft-sheet';

export default function NewNutritionPlanScreen() {
  const nutritionUi = useNutritionUi();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { t } = useT();
  const [name, setName] = useState('');
  const addPlan = useAddNutritionPlan();
  const save = async () => {
    if (!name.trim()) return;
    const plan = await addPlan.mutateAsync(name.trim());
    router.dismissTo({ pathname: '/nutrition/plans/[id]', params: { id: String(plan.id) } });
  };
  return (
    <NutritionPage title={t('newPlan')} subtitle={t('createReusableTemplate').toUpperCase()}>
      <View style={styles.content}>
        <View style={nutritionUi.card}>
          <ThemedText style={nutritionUi.technicalLabel}>{t('planName').toUpperCase()}</ThemedText>
          <TextInput value={name} onChangeText={setName} onChange={(event) => setName(event.nativeEvent.text)} placeholder={t('planNamePlaceholder')} placeholderTextColor={palette.muted} autoFocus style={nutritionUi.input} />
        </View>
        <NutritionPrimaryButton label={t('createPlan').toUpperCase()} onPress={save} disabled={!name.trim()} pending={addPlan.isPending} />
      </View>
    </NutritionPage>
  );
}
const createStyles = (_palette: ReturnType<typeof useNutritionPalette>) => softSheet({ content: { gap: Spacing.three } });

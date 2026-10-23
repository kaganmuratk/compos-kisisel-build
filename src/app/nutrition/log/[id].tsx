import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { FoodMacroDetail } from '@/components/food-macro-detail';
import { NutritionEmpty, NutritionPage, NutritionTextButton, useNutritionPalette, useNutritionUi } from '@/components/nutrition-ui';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useNutritionLog, useRemoveNutritionLog, useUpdateNutritionLog } from '@/db/queries/nutrition';
import { useT } from '@/lib/i18n';
import { TextInput } from '@/components/text-input';

export default function NutritionLogDetailScreen() {
  const { t } = useT();
  const palette = useNutritionPalette();
  const nutritionUi = useNutritionUi();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: log } = useNutritionLog(id);
  const updateLog = useUpdateNutritionLog();
  const removeLog = useRemoveNutritionLog();
  const [amount, setAmount] = useState('');

  useEffect(() => { if (log) setAmount(String(log.amountGrams)); }, [log]);

  const saveAmount = () => {
    if (!log) return;
    const parsed = Number(amount);
    if (!amount || Number.isNaN(parsed) || parsed <= 0) {
      setAmount(String(log.amountGrams));
      return;
    }
    updateLog.mutate({ id, amountGrams: parsed });
  };

  const performDelete = async () => { await removeLog.mutateAsync(id); router.back(); };
  const confirmDelete = () => {
    if (!log) return;
    if (Platform.OS === 'web') {
      if (window.confirm(t('deleteFoodLogConfirm'))) performDelete();
      return;
    }
    Alert.alert(t('deleteFoodLog'), t('deleteFoodLogConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: performDelete },
    ]);
  };

  return (
    <NutritionPage title={log?.foodName ?? t('foodLog')} subtitle={t('editTodaysEntry').toUpperCase()} right={<NutritionTextButton label={t('delete').toUpperCase()} tone="danger" onPress={confirmDelete} />}>
      {!log ? (
        <NutritionEmpty>{t('loadingFoodLog').toUpperCase()}</NutritionEmpty>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={nutritionUi.card}>
            <ThemedText style={nutritionUi.technicalLabel}>{t('amount').toUpperCase()}</ThemedText>
            <View style={styles.amountRow}>
              <TextInput value={amount} onChangeText={setAmount} onEndEditing={saveAmount} onBlur={saveAmount} keyboardType="decimal-pad" style={[nutritionUi.input, styles.amountInput]} />
              <ThemedText style={styles.unit}>{t('grams').toUpperCase()}</ThemedText>
            </View>
            <ThemedText style={nutritionUi.mutedText}>{t('changesSaveAutomatically')}</ThemedText>
          </View>
          <FoodMacroDetail food={log} amountGrams={Number(amount) || log.amountGrams} />
        </ScrollView>
      )}
    </NutritionPage>
  );
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({
  content: { gap: Spacing.three, paddingBottom: Spacing.six },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  amountInput: { width: 110, textAlign: 'center', fontFamily: Fonts.metric, fontSize: 25 },
  unit: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 },
});

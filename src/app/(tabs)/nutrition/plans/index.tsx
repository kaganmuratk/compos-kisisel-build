import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { NutritionEmpty, NutritionIconButton, NutritionPage, PaletteText as ThemedText, cardShadowFor, useNutritionPalette, useNutritionUi } from '@/components/nutrition-ui';
import { SwipeableRow } from '@/components/swipeable-row';
import { Fonts, Spacing } from '@/constants/theme';
import { useDeleteNutritionPlan, useNutritionPlans } from '@/db/queries/nutrition-plans';
import { useT } from '@/lib/i18n';
import { softSheet } from '@/constants/soft-sheet';

export default function NutritionPlansScreen() {
  const nutritionUi = useNutritionUi();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const cardShadow = cardShadowFor(palette);
  const { t } = useT();
  const { data: plans = [] } = useNutritionPlans();
  const deletePlan = useDeleteNutritionPlan();
  return (
    <NutritionPage title={t('plans')} subtitle={t('reusableNutritionTemplates').toUpperCase()} right={<NutritionIconButton accessibilityLabel={t('newPlan')} onPress={() => router.push('/nutrition/plans/new')} />}>
      {plans.length === 0 ? (
        <NutritionEmpty>{t('noNutritionPlansYet').toUpperCase()}</NutritionEmpty>
      ) : (
        <FlatList
          data={plans}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={nutritionUi.listContent}
          renderItem={({ item }) => (
            <SwipeableRow onDelete={() => deletePlan.mutate(item.id)} confirmTitle={t('deletePlanTitle')} confirmMessage={t('deletePlanConfirm')}>
              <Pressable onPress={() => router.push({ pathname: '/nutrition/plans/[id]', params: { id: String(item.id) } })} style={[styles.row, cardShadow]}>
                <View style={styles.copy}>
                  <ThemedText style={nutritionUi.bodyText}>{item.name}</ThemedText>
                  <ThemedText style={nutritionUi.mutedText}>{item.meals.length} {t('meals').toUpperCase()}</ThemedText>
                </View>
                <ThemedText style={styles.chevron}>&gt;</ThemedText>
              </Pressable>
            </SwipeableRow>
          )}
        />
      )}
    </NutritionPage>
  );
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => softSheet({
  row: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, paddingHorizontal: Spacing.three },
  copy: { gap: 3 },
  chevron: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 13 },
});

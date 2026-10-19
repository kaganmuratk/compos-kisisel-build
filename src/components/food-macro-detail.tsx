import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useNutritionPalette } from '@/components/nutrition-ui';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { macrosFor, round, type MacroSource } from '@/lib/nutrition';

export function FoodMacroDetail({ food, amountGrams }: { food: MacroSource & { extraNutrients?: string | null }; amountGrams: number }) {
  const { t } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const m = macrosFor(food, amountGrams);
  const parts = [
    m.fiber != null ? `${t('fiber')} ${round(m.fiber, 1)}G` : null,
    m.sugars != null ? `${t('sugar')} ${round(m.sugars, 1)}G` : null,
    m.saturatedFat != null ? `${t('saturatedFat')} ${round(m.saturatedFat, 1)}G` : null,
    m.unsaturatedFat != null ? `${t('unsaturatedFat')} ${round(m.unsaturatedFat, 1)}G` : null,
    m.transFat != null ? `${t('transFat')} ${round(m.transFat, 1)}G` : null,
    m.salt != null ? `${t('salt')} ${round(m.salt, 2)}G` : null,
  ].filter((part): part is string => part != null);

  return (
    <View style={styles.wrapper}>
      <View style={styles.macroRow}>
        <MacroBlock styles={styles} label={t('kcal').toUpperCase()} value={Math.round(m.kcal)} color={palette.blue} />
        <MacroBlock styles={styles} label={t('protein').toUpperCase()} value={`${Math.round(m.protein)}G`} color={palette.green} />
        <MacroBlock styles={styles} label={t('carbs').toUpperCase()} value={`${Math.round(m.carbs)}G`} color={palette.red} />
        <MacroBlock styles={styles} label={t('fat').toUpperCase()} value={`${Math.round(m.fat)}G`} color={palette.yellow} />
      </View>
      {parts.length > 0 ? <ThemedText style={styles.detailLine}>{parts.join(' · ')}</ThemedText> : null}
      {food.extraNutrients ? <ThemedText style={styles.detailLine}>{food.extraNutrients}</ThemedText> : null}
    </View>
  );
}

function MacroBlock({ styles, label, value, color }: { styles: ReturnType<typeof createStyles>; label: string; value: string | number; color: string }) {
  return (
    <View style={styles.macroBlock}>
      <ThemedText style={[styles.value, { color }]}>{value}</ThemedText>
      <ThemedText style={styles.label}>{label}</ThemedText>
    </View>
  );
}

function cardShadowFor(palette: ReturnType<typeof useNutritionPalette>) { return palette.background === '#FAFAF8' ? { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 } : {}; }
const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({
  wrapper: { gap: Spacing.two },
  macroRow: { ...cardShadowFor(palette), flexDirection: 'row', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, paddingVertical: Spacing.three },
  macroBlock: { flex: 1, alignItems: 'center', gap: 2 },
  value: { fontFamily: Fonts.metric, fontSize: 24, lineHeight: 27 },
  label: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 7, letterSpacing: 0.5 },
  detailLine: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, lineHeight: 14, textAlign: 'center' },
});

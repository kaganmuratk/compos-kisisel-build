import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useNutritionPalette } from '@/components/nutrition-ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import type { BarPeriod } from '@/lib/period-bars';

// `hidden` removes an option from the toggle entirely (vs. `disabled`,
// which keeps it visible but greyed out and unpressable) — for a period
// that's not just temporarily unavailable but doesn't make sense at all for
// the current range (e.g. "daily" showing only its last 10 points out of a
// 30-day range), not showing it in the first place reads clearer than a
// greyed-out button the user has to puzzle over.
export function PeriodToggle({ value, onChange, disabled = [], hidden = [] }: { value: BarPeriod; onChange: (period: BarPeriod) => void; disabled?: BarPeriod[]; hidden?: BarPeriod[] }) {
  const { t } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const allOptions: { key: BarPeriod; label: string }[] = [
    { key: 'day', label: t('periodDayLetter') },
    { key: 'week', label: t('periodWeekLetter') },
    { key: 'month', label: t('periodMonthLetter') },
  ];
  const options = allOptions.filter((option) => !hidden.includes(option.key));
  return <View style={styles.toggle}>{options.map((option) => { const isDisabled = disabled.includes(option.key); return <Pressable key={option.key} disabled={isDisabled} onPress={() => onChange(option.key)} style={[styles.option, value === option.key && styles.selected, isDisabled && styles.disabled]}><ThemedText style={[styles.label, value === option.key && styles.selectedLabel]}>{option.label}</ThemedText></Pressable>; })}</View>;
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({
  toggle: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: Radius.sm, overflow: 'hidden' },
  option: { minWidth: 30, minHeight: 28, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.one },
  selected: { backgroundColor: palette.raised },
  disabled: { opacity: 0.3 },
  label: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.5 },
  selectedLabel: { color: palette.text },
});

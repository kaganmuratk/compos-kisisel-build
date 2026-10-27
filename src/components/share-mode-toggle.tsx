import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { useNutritionPalette } from '@/components/nutrition-ui';
import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { softSheet } from '@/constants/soft-sheet';

export type ShareMode = 'summary' | 'detailed';
const OPTIONS: { value: ShareMode; label: string }[] = [{ value: 'summary', label: 'SUMMARY' }, { value: 'detailed', label: 'DETAILED' }];

export function ShareModeToggle({ mode, onChange }: { mode: ShareMode; onChange: (mode: ShareMode) => void }) {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return <View style={styles.row}>{OPTIONS.map(({ value, label }) => { const selected = mode === value; return <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(value)} style={[styles.option, selected && styles.selected]}><ThemedText style={[styles.label, selected && styles.selectedLabel]}>{label}</ThemedText></Pressable>; })}</View>;
}
const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => softSheet({ row: { flexDirection: 'row', alignSelf: 'center', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 3 }, option: { minWidth: 110, minHeight: 36, alignItems: 'center', justifyContent: 'center' }, selected: { backgroundColor: palette.blue }, label: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.8 }, selectedLabel: { color: palette.background } });

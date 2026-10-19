import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { nutritionPaletteLight, PaletteText as ThemedText, useNutritionPalette } from '@/components/nutrition-ui';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useAddSupplementCategory, useSupplementCategories } from '@/db/queries/supplement-categories';
import { db } from '@/db/client';
import { supplementCategories } from '@/db/schema';
import { useAddSupplement, useAddSupplementLog } from '@/db/queries/supplements';
import { useT } from '@/lib/i18n';

// Mirrors Today's/History's categoryAccentPalette exactly — same 4 tones in
// the same order, so a category already reads as "its" color here too, not
// just after it's saved. Dark values are the ones tuned for a near-black
// background — used as-is on a light background they were low-contrast
// (mint especially: pale mint text on a pale mint tint), so light mode gets
// its own darker relit values, same hue as Today's todayThemeLight.
function categoryAccentPaletteFor(palette: ReturnType<typeof useNutritionPalette>) {
  return palette === nutritionPaletteLight
    ? [palette.blue, '#0E8F6C', '#C0392B', '#7C3AED']
    : [palette.blue, '#42E2AD', '#F75C57', '#A78BFA'];
}

export default function NewSupplementScreen() {const palette=useNutritionPalette();const styles=useMemo(()=>createStyles(palette),[palette]);
  const { t } = useT();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const { data: categories = [] } = useSupplementCategories();
  const addCategory = useAddSupplementCategory();
  const addSupplement = useAddSupplement();
  const addLog = useAddSupplementLog();
  const saving = addSupplement.isPending || addLog.isPending;

  // Categorizing is mandatory (no "uncategorized" escape hatch) — default to
  // the first existing category so most saves don't need an extra tap; a
  // user with zero categories still has to create one via "+ New category"
  // before the save button unlocks.
  useEffect(() => {
    if (categoryId == null && categories.length > 0) setCategoryId(categories[0].id);
  }, [categoryId, categories]);

  const saveNewCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed || addCategory.isPending) return;
    await addCategory.mutateAsync(trimmed);
    const createdCategories = await db.select().from(supplementCategories).orderBy(supplementCategories.orderIndex);
    const created = [...createdCategories].reverse().find((category) => category.name === trimmed);
    if (created) setCategoryId(created.id);
    setNewCategoryName('');
    setAddingCategory(false);
  };

  // The "+ New supplement category" chip doubles as its own open/close
  // toggle — no separate Cancel button. Closing it any way other than a
  // successful save (which already resets the field itself) drops
  // whatever was typed, same as Cancel used to.
  const toggleAddingCategory = () => {
    setAddingCategory((wasOpen) => {
      if (wasOpen) setNewCategoryName('');
      return !wasOpen;
    });
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || !categoryId || saving) return;
    const trimmedAmount = amount.trim() || null;
    const [supplement] = await addSupplement.mutateAsync({ name: trimmedName, defaultAmount: trimmedAmount, isDefault, categoryId });
    // A new item represents an action taken now, while its routine status controls future days.
    await addLog.mutateAsync({ supplementId: supplement.id, amount: trimmedAmount });
    router.back();
  };

  return (
    <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.page}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScreenHeader onBack={() => router.back()} eyebrow={t('dailyRoutine').toUpperCase()} title={t('newSupplement').toUpperCase()} accentColor={palette.blue} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.fieldCard}>
            <ThemedText style={styles.label}>{t('name').toUpperCase()}</ThemedText>
            <TextInput autoFocus value={name} onChangeText={setName} placeholder={t('supplementExample')} placeholderTextColor={palette.muted} style={styles.input} />
          </View>
          <View style={styles.fieldCard}>
            <ThemedText style={styles.label}>{t('categoryName').toUpperCase()}</ThemedText>
            <View style={styles.categoryChipRow}>
              {categories.map((category, index) => {
                const categoryAccentPalette = categoryAccentPaletteFor(palette);
                const accentColor = categoryAccentPalette[index % categoryAccentPalette.length];
                const selected = categoryId === category.id;
                return (
                  <Pressable
                    key={category.id}
                    onPress={() => setCategoryId(category.id)}
                    style={[styles.categoryChip, { borderColor: accentColor }, selected && { backgroundColor: accentColor }]}>
                    <ThemedText style={[styles.categoryChipText, selected ? { color: palette.background } : { color: accentColor }]}>{category.name}</ThemedText>
                  </Pressable>
                );
              })}
              <Pressable onPress={toggleAddingCategory} style={[styles.categoryChipAdd, addingCategory && styles.categoryChipAddActive]}>
                <ThemedText style={styles.categoryChipAddText}>+ {t('newSupplementCategory')}</ThemedText>
              </Pressable>
            </View>
            {addingCategory && (
              <View style={styles.newCategoryForm}>
                <TextInput value={newCategoryName} onChangeText={setNewCategoryName} placeholder={t('categoryName')} placeholderTextColor={palette.muted} autoFocus onSubmitEditing={saveNewCategory} style={styles.categoryInput} />
                <View style={styles.categoryInputActions}>
                  <Pressable onPress={saveNewCategory} hitSlop={8}><ThemedText style={styles.confirmText}>{t('addCategory').toUpperCase()}</ThemedText></Pressable>
                </View>
              </View>
            )}
          </View>
          <View style={styles.fieldCard}>
            <ThemedText style={styles.label}>{t('amount').toUpperCase()}</ThemedText>
            <TextInput value={amount} onChangeText={setAmount} placeholder={t('supplementAmountExample')} placeholderTextColor={palette.muted} style={styles.input} />
          </View>
          <View style={styles.routineRow}>
            <View style={styles.routineCopy}>
              <ThemedText style={styles.routineTitle}>{t('addToDailyRoutine').toUpperCase()}</ThemedText>
              <ThemedText style={styles.routineHelp}>{t('showsPendingUntilTaken').toUpperCase()}</ThemedText>
            </View>
            <Switch value={isDefault} onValueChange={setIsDefault} trackColor={{ false: palette.border, true: palette.blue }} thumbColor={palette.text} accessibilityLabel={t('addToDailyRoutine')} />
          </View>
        </ScrollView>
        <Pressable accessibilityRole="button" accessibilityLabel={t('saveSupplement')} onPress={save} disabled={!name.trim() || !categoryId || saving} style={[styles.saveButton, (!name.trim() || !categoryId || saving) && styles.disabled]}>
          {saving ? <ActivityIndicator color={palette.background} /> : <ThemedText style={styles.saveLabel}>{t('saveSupplement').toUpperCase()}</ThemedText>}
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const createStyles=(palette:ReturnType<typeof useNutritionPalette>)=>StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.background },
  safeArea: { flex: 1, paddingHorizontal: Spacing.three },
  content: { flexGrow: 1, paddingVertical: Spacing.four, gap: Spacing.three },
  fieldCard: { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: Spacing.three, gap: Spacing.two },
  label: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 },
  input: { color: palette.text, fontFamily: Fonts.regular, fontSize: 17, borderBottomWidth: 1, borderColor: palette.border, paddingVertical: Spacing.one },
  categoryChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  categoryChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.three, borderWidth: 1.5, backgroundColor: palette.raised },
  categoryChipText: { fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 0.5 },
  categoryChipAdd: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.three, borderWidth: 1.5, borderStyle: 'dashed', borderColor: palette.muted },
  categoryChipAddActive: { borderStyle: 'solid', borderColor: palette.blue },
  categoryChipAddText: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 0.5 },
  newCategoryForm: { gap: Spacing.two, padding: Spacing.three, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.raised },
  categoryInput: { color: palette.text, fontFamily: Fonts.regular, fontSize: 15, borderBottomWidth: 1, borderColor: palette.border, paddingVertical: Spacing.one },
  categoryInputActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.three },
  confirmText: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.7 },
  routineRow: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border },
  routineCopy: { flex: 1, gap: Spacing.one },
  routineTitle: { color: palette.text, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 0.8 },
  routineHelp: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 8, lineHeight: 13, letterSpacing: 0.5 },
  saveButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.blue, marginBottom: Spacing.three },
  saveLabel: { color: palette.background, fontFamily: Fonts.bold, fontSize: 14, letterSpacing: 0.7 },
  disabled: { opacity: 0.45 },
});

import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PaletteText as ThemedText, cardShadowFor, useNutritionPalette } from '@/components/nutrition-ui';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useDeleteProgram, usePrograms } from '@/db/queries/programs';
import { SwipeableRow } from '@/components/swipeable-row';
import { useT } from '@/lib/i18n';

export default function TrainingScreen() {
  const { t } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.page}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader
          eyebrow={t('yourPrograms').toUpperCase()}
          title={t('training').toUpperCase()}
          accentColor={palette.blue}
          backHref="/workout/start"
          trailing={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create new program"
              hitSlop={8}
              onPress={() => router.push('/programs/new')}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
              <ThemedText style={styles.addSymbol}>+</ThemedText>
            </Pressable>
          }
        />
        <ProgramsList />
      </SafeAreaView>
    </ThemedView>
  );
}

function ProgramsList() {
  const { t } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const cardShadow = cardShadowFor(palette);
  const { data: programs = [] } = usePrograms();
  const deleteProgram = useDeleteProgram();

  if (programs.length === 0) {
    return (
      <View style={styles.emptyState}>
        <ThemedText style={styles.emptyKicker}>{t('noProgramsYet').toUpperCase()}</ThemedText>
        <ThemedText style={styles.emptyTitle}>{t('buildRoutine').toUpperCase()}</ThemedText>
        <ThemedText style={styles.emptyCopy}>{t('buildRoutineCopy')}</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create new program"
          onPress={() => router.push('/programs/new')}
          style={({ pressed }) => [styles.emptyAction, pressed && styles.pressed]}>
          <ThemedText style={styles.emptyActionLabel}>{t('newProgram').toUpperCase()}</ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={programs}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      renderItem={({ item, index }) => (
        <SwipeableRow
          onDelete={() => deleteProgram.mutate(item.id)}
          confirmTitle="Programı Sil"
          confirmMessage={`"${item.name}" programı ve içindeki tüm günler kalıcı olarak silinecek.`}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.days.length} training days`}
            onPress={() => router.push({ pathname: '/programs/[id]', params: { id: String(item.id) } })}
            style={({ pressed }) => [styles.programCard, cardShadow, pressed && styles.pressed]}>
            <View style={[styles.programAccent, { backgroundColor: [palette.blue, palette.green, palette.yellow, palette.red][index % 4] }]} />
            <View style={styles.programCopy}>
              <ThemedText style={styles.programName} numberOfLines={1}>{item.name}</ThemedText>
              <ThemedText style={styles.programMeta}>{item.days.length} {(item.days.length === 1 ? t('trainingDay') : t('trainingDays')).toUpperCase()}</ThemedText>
            </View>
            <ThemedText style={styles.programArrow}>›</ThemedText>
          </Pressable>
        </SwipeableRow>
      )}
    />
  );
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.background },
  safeArea: { flex: 1, paddingHorizontal: Spacing.three },
  addButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border },
  addSymbol: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 24, lineHeight: 28 },
  listContent: { gap: Spacing.two, paddingBottom: Spacing.six },
  programCard: { minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border },
  programAccent: { width: 4, alignSelf: 'stretch', backgroundColor: palette.blue },
  programCopy: { flex: 1, gap: Spacing.one },
  programName: { color: palette.text, fontFamily: Fonts.metricMedium, fontSize: 25, lineHeight: 28 },
  programMeta: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, lineHeight: 13, letterSpacing: 0.8 },
  programArrow: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 19 },
  emptyState: { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: Spacing.four, gap: Spacing.two },
  emptyKicker: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 },
  emptyTitle: { color: palette.text, fontFamily: Fonts.metric, fontSize: 28, lineHeight: 32 },
  emptyCopy: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 10, lineHeight: 16 },
  emptyAction: { minHeight: 48, marginTop: Spacing.one, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.blue },
  emptyActionLabel: { color: palette.background, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 1.1 },
  pressed: { opacity: 0.72 },
});

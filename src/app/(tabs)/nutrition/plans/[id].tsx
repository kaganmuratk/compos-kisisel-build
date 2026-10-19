import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PaletteText as ThemedText, cardShadowFor, useNutritionPalette } from '@/components/nutrition-ui';
import { ScreenHeader } from '@/components/screen-header';
import { SwipeableRow } from '@/components/swipeable-row';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useMealCategories } from '@/db/queries/meal-categories';
import { useApplyPlan, useNutritionPlan, usePlanMeals, useRemoveMealFromPlan, useUpdatePlanMeal } from '@/db/queries/nutrition-plans';
import { macrosFor } from '@/lib/nutrition';
import { getFoodNameLabel } from '@/lib/food-name';
import { useT } from '@/lib/i18n';

type PlanMealRow = ReturnType<typeof usePlanMeals>['data'] extends (infer T)[] | undefined ? T : never;

// Ports the main Nutrition tab's long-press-drag-to-move-meal gesture
// (src/app/(tabs)/nutrition/index.tsx) verbatim — same activateAfterLongPress
// (500ms) + minDistance(10) combo that keeps a normal scroll from being
// mistaken for a drag, the exact bug that had to be fixed there before.
function useSectionDropZones() {
  const nodeRefs = useRef<Record<string, View | null>>({});
  const bounds = useRef<Record<string, { top: number; bottom: number }>>({});

  const registerRef = (id: string) => (node: View | null) => {
    nodeRefs.current[id] = node;
  };

  const measureAll = () => {
    Object.entries(nodeRefs.current).forEach(([id, node]) => {
      node?.measureInWindow((_x, y, _width, height) => {
        bounds.current[id] = { top: y, bottom: y + height };
      });
    });
  };

  const findTarget = (absoluteY: number) => {
    const match = Object.entries(bounds.current).find(([, b]) => absoluteY >= b.top && absoluteY <= b.bottom);
    return match?.[0] ?? null;
  };

  return { registerRef, measureAll, findTarget };
}

function DraggableFoodRow({
  children,
  onMeasure,
  onDrop,
}: {
  children: (dragHandle: ReactNode) => ReactNode;
  onMeasure: () => void;
  onDrop: (absoluteY: number) => void;
}) {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const dragging = useSharedValue(0);

  const pan = Gesture.Pan()
    .activateAfterLongPress(500)
    .minDistance(10)
    .onStart(() => {
      dragging.value = 1;
      runOnJS(onMeasure)();
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => runOnJS(onDrop)(event.absoluteY))
    .onFinalize(() => {
      dragging.value = 0;
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: dragging.value ? 1.03 : 1 }],
    opacity: dragging.value ? 0.9 : 1,
    zIndex: dragging.value ? 100 : 0,
    elevation: dragging.value ? 8 : 0,
  }));

  const dragHandle = (
    <GestureDetector gesture={pan}>
      <Pressable accessibilityLabel="Hold and drag to move food" onPress={() => {}} style={styles.dragHandle}>
        <ThemedText style={styles.dragHandleText}>≡</ThemedText>
      </Pressable>
    </GestureDetector>
  );

  return <Animated.View style={style}>{children(dragHandle)}</Animated.View>;
}

// Same card language as the main Nutrition tab — COMPOS wordmark, colored
// macro tiles, meal cards with a bordered food-row list — so a plan being
// edited looks like the same app as the day it eventually gets applied to,
// not a plainer form screen. Moving a food to a different meal is
// drag-and-drop here too, same as the main tab, instead of a picker screen —
// see the removed meal-type chip row in meal/[mealId].tsx.
export default function NutritionPlanDetailScreen() {
  const { t, language } = useT();
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const cardShadow = cardShadowFor(palette);
  const { id: planId } = useLocalSearchParams<{ id: string }>();
  const { data: plan } = useNutritionPlan(planId);
  const { data: meals = [] } = usePlanMeals(planId);
  const { data: categories = [] } = useMealCategories();
  const removeMeal = useRemoveMealFromPlan(planId);
  const updateMeal = useUpdatePlanMeal(planId);
  const applyPlan = useApplyPlan();
  const dropZones = useSectionDropZones();
  const apply = async () => {
    await applyPlan.mutateAsync(planId);
    router.push('/nutrition');
  };

  const groups = categories.map((category) => ({ ...category, items: meals.filter((meal) => meal.mealType === category.id) }));
  const totals = meals.reduce(
    (acc, item) => {
      const macro = macrosFor(item.food, item.amountGrams);
      acc.kcal += macro.kcal;
      acc.protein += macro.protein;
      acc.carbs += macro.carbs;
      acc.fat += macro.fat;
      return acc;
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  if (!plan) return null;

  return (
    <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.page}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader onBack={() => router.back()} eyebrow={t('buildAndApplyThisDay').toUpperCase()} title={plan.name} accentColor={palette.blue} />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          <View style={styles.summaryGrid}>
            <MetricCard label="KCAL" value={Math.round(totals.kcal).toLocaleString('en-US')} color={palette.blue} />
            <MetricCard label={t('protein').toUpperCase()} value={`${Math.round(totals.protein)}G`} color={palette.green} />
            <MetricCard label={t('carbs').toUpperCase()} value={`${Math.round(totals.carbs)}G`} color={palette.yellow} />
            <MetricCard label={t('fat').toUpperCase()} value={`${Math.round(totals.fat)}G`} color={palette.red} />
          </View>

          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionLabel}>{t('meals').toUpperCase()}</ThemedText>
          </View>

          {groups.map((group) => {
            const mealKcal = group.items.reduce((sum, item) => sum + macrosFor(item.food, item.amountGrams).kcal, 0);
            return (
              <View key={group.id} ref={dropZones.registerRef(group.id)} style={[styles.mealCard, cardShadow]}>
                <View style={styles.mealHeader}>
                  <View style={styles.mealTitleBlock}>
                    <ThemedText style={styles.mealTitle}>{group.label.toUpperCase()}</ThemedText>
                    <ThemedText style={styles.mealCalories}>{Math.round(mealKcal)} KCAL</ThemedText>
                  </View>
                  <Pressable
                    accessibilityLabel={`Add food to ${group.label}`}
                    onPress={() => router.push({ pathname: '/nutrition/plans/add-food', params: { planId, mealType: group.id } })}
                    hitSlop={8}
                    style={styles.mealActionButton}>
                    <ThemedText style={styles.mealAddSymbol}>+</ThemedText>
                  </Pressable>
                </View>

                {group.items.length === 0 ? (
                  <View style={styles.emptyMeal}>
                    <ThemedText style={styles.emptyMealText}>{t('noFoodAdded').toUpperCase()}</ThemedText>
                  </View>
                ) : (
                  group.items.map((item: PlanMealRow) => {
                    const macro = macrosFor(item.food, item.amountGrams);
                    return (
                      <DraggableFoodRow
                        key={item.id}
                        onMeasure={dropZones.measureAll}
                        onDrop={(absoluteY) => {
                          const target = dropZones.findTarget(absoluteY);
                          if (target && target !== group.id) updateMeal.mutate({ id: item.id, mealType: target });
                        }}>
                        {(dragHandle) => (
                          <SwipeableRow onDelete={() => removeMeal.mutate(item.id)} confirmTitle={t('removeFood')} confirmMessage={t('removeFoodConfirm')}>
                            <Pressable
                              onPress={() => router.push({ pathname: '/nutrition/plans/meal/[mealId]', params: { mealId: String(item.id), planId } })}
                              style={styles.foodRow}>
                              <View style={styles.foodMain}>
                                <ThemedText style={styles.foodName}>{getFoodNameLabel(item.food.name, language)}</ThemedText>
                                <ThemedText style={styles.foodMeta}>
                                  {item.amountGrams} G · {Math.round(macro.kcal)} KCAL
                                </ThemedText>
                              </View>
                              {dragHandle}
                            </Pressable>
                          </SwipeableRow>
                        )}
                      </DraggableFoodRow>
                    );
                  })
                )}
              </View>
            );
          })}
        </ScrollView>

        <Pressable onPress={apply} disabled={applyPlan.isPending} style={[styles.applyButton, applyPlan.isPending && styles.disabled]}>
          <ThemedText style={styles.applyButtonLabel}>{t('applyToToday').toUpperCase()}</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.metricCard}>
      <ThemedText style={styles.technicalLabel}>{label}</ThemedText>
      <ThemedText style={[styles.metricValue, { color }]}>{value}</ThemedText>
    </View>
  );
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.background },
  safeArea: { flex: 1, paddingHorizontal: Spacing.three },
  content: { paddingBottom: Spacing.six, gap: Spacing.three },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  metricCard: { width: '48.9%', minHeight: 88, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: 12, justifyContent: 'space-between' },
  technicalLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, lineHeight: 13, letterSpacing: 1.15 },
  metricValue: { fontFamily: Fonts.metric, fontSize: 32, lineHeight: 34, letterSpacing: -0.6 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.one },
  sectionLabel: { color: palette.text, fontFamily: Fonts.technical, fontSize: 11, letterSpacing: 1.6 },
  mealCard: { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: 12, gap: Spacing.two },
  mealHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: Spacing.two, borderBottomWidth: 1, borderColor: palette.border },
  mealTitleBlock: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  mealTitle: { color: palette.text, fontFamily: Fonts.technical, fontSize: 11, lineHeight: 15, letterSpacing: 1.2 },
  mealCalories: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.4 },
  mealActionButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  mealAddSymbol: { color: palette.blue, fontFamily: Fonts.bold, fontSize: 24, lineHeight: 28 },
  emptyMeal: { borderWidth: 1, borderColor: palette.border, borderStyle: 'dashed', minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  emptyMealText: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1.1 },
  foodRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, backgroundColor: palette.card },
  foodMain: { flex: 1, gap: 1 },
  foodName: { color: palette.text, fontFamily: Fonts.bold, fontSize: 13, lineHeight: 17 },
  foodMeta: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, lineHeight: 13, letterSpacing: 0.15 },
  dragHandle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dragHandleText: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 18, lineHeight: 20 },
  applyButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.blue, marginBottom: Spacing.three },
  applyButtonLabel: { color: palette.background, fontFamily: Fonts.bold, fontSize: 14, letterSpacing: 0.7 },
  disabled: { opacity: 0.45 },
});

export const exerciseCategoryColors: Record<string, string> = {
  Göğüs: '#3D8DFF', Sırt: '#2DD4A0', Omuz: '#FB923C', Bacak: '#A78BFA', Biceps: '#F87171', Triceps: '#67E8F9', Karın: '#FBBF24', Kardiyo: '#FB7185',
};

export const exerciseCategoryLabels: Record<string, string> = {
  Göğüs: 'CHEST', Sırt: 'BACK', Omuz: 'SHOULDERS', Biceps: 'BICEPS', Triceps: 'TRICEPS', Bacak: 'LEGS', Karın: 'ABS', Kardiyo: 'CARDIO',
};

export const exerciseCategoryLabelsTr: Record<string, string> = {
  Göğüs: 'GÖĞÜS', Sırt: 'SIRT', Omuz: 'OMUZ', Biceps: 'BICEPS', Triceps: 'TRICEPS', Bacak: 'BACAK', Karın: 'KARIN', Kardiyo: 'KARDİYO',
};

export function getExerciseCategoryLabel(category: string, language: 'en' | 'tr' = 'en') {
  const labels = language === 'tr' ? exerciseCategoryLabelsTr : exerciseCategoryLabels;
  return labels[category] ?? category.toUpperCase();
}

export function getExerciseCategoryColor(category: string | null | undefined) {
  return category ? exerciseCategoryColors[category] ?? '#343434' : '#343434';
}

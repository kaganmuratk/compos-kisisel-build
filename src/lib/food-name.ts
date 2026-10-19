import nameTranslations from '@/db/nutrition-name-translations.json';

const translations = nameTranslations as Record<string, string>;

// User-added custom foods have no entry here — they fall back to the name
// as typed, same as any catalog item this batch-translated file hasn't
// reached yet (see CLAUDE.md's food-catalog-translation note).
export function getFoodNameLabel(name: string, language: 'en' | 'tr' = 'tr') {
  return language === 'en' ? translations[name] ?? name : name;
}

// The catalog's `name` column is always the original Turkish name — a
// plain `like` search against it (see useFoodSearch) only ever matches
// Turkish substrings. In English mode the user types English terms, so a
// search also needs to check them against this dictionary's English side
// and hand back which original (Turkish) names to additionally include.
export function findFoodNamesByEnglishQuery(query: string): string[] {
  const needle = query.toLowerCase();
  const matches: string[] = [];
  for (const [originalName, englishName] of Object.entries(translations)) {
    if (englishName.toLowerCase().includes(needle)) matches.push(originalName);
  }
  return matches;
}

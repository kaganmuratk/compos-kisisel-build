import { useSettings } from '@/db/queries/settings';

import en, { type TranslationKey } from './en';
import tr from './tr';

export type AppLanguage = 'en' | 'tr';

export function useT(overrideLanguage?: AppLanguage) {
  const { data: settings } = useSettings();
  const language = overrideLanguage ?? settings?.language ?? 'en';
  const dictionary = language === 'tr' ? tr : en;
  return { language, t: (key: TranslationKey) => dictionary[key] };
}

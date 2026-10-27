import Storage from 'expo-sqlite/kv-store';

// Read synchronously at module load (theme.ts and every StyleSheet built from
// it are evaluated once, before the first render), so this can't go through
// the async PowerSync-backed settings row. It's a per-device display choice.
const KEY = 'compos.designVariant';

export function readDesignVariant(): string | null {
  try {
    return Storage.getItemSync(KEY);
  } catch {
    return null;
  }
}

export function writeDesignVariant(value: string) {
  Storage.setItemSync(KEY, value);
}

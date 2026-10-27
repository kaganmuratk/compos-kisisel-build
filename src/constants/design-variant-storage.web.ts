const KEY = 'compos.designVariant';

export function readDesignVariant(): string | null {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeDesignVariant(value: string) {
  globalThis.localStorage?.setItem(KEY, value);
}

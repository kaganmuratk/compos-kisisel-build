import { createClient, type Session, type SupportedStorage } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

// expo-secure-store only exposes get/set/remove, not the full Storage
// interface Supabase's client expects — this adapts it. Session tokens are
// small (a JWT + refresh token), well under SecureStore's per-key size limit.
const SecureStoreAdapter: SupportedStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// expo-secure-store's web implementation is an empty stub — every call
// throws, since browsers have no Keychain/Keystore equivalent. localStorage
// is the web fallback (fine for a personal-use PC session; not as hardened
// as native secure storage, but scoped to the browser origin). Expo
// Router's web output renders once server-side (Node.js, no `localStorage`)
// before hydrating in the real browser, so every method has to no-op there
// rather than assume a browser environment.
const hasLocalStorage = typeof localStorage !== 'undefined';
const WebStorageAdapter: SupportedStorage = {
  getItem: (key: string) => Promise.resolve(hasLocalStorage ? localStorage.getItem(key) : null),
  setItem: (key: string, value: string) => {
    if (hasLocalStorage) localStorage.setItem(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    if (hasLocalStorage) localStorage.removeItem(key);
    return Promise.resolve();
  },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY eksik.');
}

// Pinned to the same value supabase-js would derive by default
// (`sb-${projectRef}-auth-token`) — passed explicitly (rather than left
// implicit) purely so getPersistedSession() below can read the exact same
// key without duplicating an undocumented internal formula. Not a real
// behavior change: an existing signed-in install keeps working unchanged.
const authStorageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
const authStorage = Platform.OS === 'web' ? WebStorageAdapter : SecureStoreAdapter;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: authStorage,
    storageKey: authStorageKey,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Reads the last session Supabase persisted to disk, directly and without
// any network call — bypasses supabase-js's own getSession(), which refuses
// to hand back a session if the access token's real expiry has passed and
// it can't reach the network to refresh it (see use-auth.tsx for why that
// matters: this app is offline-first, and a stale-but-present session must
// still be enough to open the app with no connectivity at all).
export async function getPersistedSession(): Promise<Session | null> {
  const raw = await authStorage.getItem(authStorageKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Session;
    return parsed?.access_token && parsed?.user ? parsed : null;
  } catch {
    return null;
  }
}

import { BricolageGrotesque_400Regular } from '@expo-google-fonts/bricolage-grotesque/400Regular';
import { BricolageGrotesque_500Medium } from '@expo-google-fonts/bricolage-grotesque/500Medium';
import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed/600SemiBold';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium';
import { IBMPlexMono_700Bold } from '@expo-google-fonts/ibm-plex-mono/700Bold';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FontDisplay, useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Appearance, AppState, Platform, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import { legacyMigratorDb } from '@/db/client';
import migrations from '@/db/migrations/migrations';
import { powerSyncDb } from '@/db/powersync';
import { getSettingsRow, useSettings } from '@/db/queries/settings';
import { supabaseConnector } from '@/db/supabase-connector';
import { runUuidMigration } from '@/db/uuid-migration';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { useAuthDeepLink } from '@/hooks/use-auth-deep-link';
import { KeyboardDoneBar, modalScreenLayout } from '@/components/keyboard-done-bar';
import { recoverPendingMediaPick } from '@/lib/pending-media-recovery';
// Compos Kişisel: koç bildirimlerinin arka plan görevi uygulama arka planda başlatıldığında da tanımlı olmalı
// (modül kendi içinde sadece Kişisel + native'de etkin; normal Compos'ta hiçbir şey yapmaz).
import '@/lib/coach-notifications';
import {
  applyDetailedNutritionUpdate,
  backfillFoodPortionsIfMissing,
  closeStaleOpenSessions,
  dedupeFoods,
  fixEtiLifalifYulafEzmesiNutrition,
  repairOrphanedCatalogReferences,
  seedExercisesIfEmpty,
  seedFoodsIfEmpty,
  seedSettingsIfEmpty,
} from '@/db/seed';
import { dedupeSupplementLogs } from '@/db/queries/supplements';
import { ensureUncategorizedSupplementCategory } from '@/db/queries/supplement-categories';
import '@/lib/background-location';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// react-native-screens renders 'fullScreenModal' on Android as a real Dialog
// window (BottomSheetDialogFragment), not a plain screen — expo-image-picker
// launching the system gallery picker from inside that Dialog never gets its
// Activity-result callback routed back, so the picker either never opens or
// opens and never resolves the promise, with zero error either way. Both
// screens below (workout/[sessionId] via SessionMediaRow, run/share/[id]'s
// background-photo picker) call the image picker, so both need this. iOS's
// native full-screen modal presentation doesn't have this problem.
const fullScreenModalPresentation = Platform.OS === 'ios' ? 'fullScreenModal' : 'card';

// Web has no legacy pre-Faz-2 database to migrate (see db/client.web.ts) —
// running the real migrator against its stub would do nothing useful, so
// this reports "done" immediately instead. Platform.OS never changes for a
// running app instance, so this conditional hook call never actually
// changes hook order across re-renders of the same mount, unlike the
// pattern React's rule is meant to catch.
function useLegacyMigrations() {
  if (Platform.OS === 'web') {
    return { success: true, error: undefined };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useMigrations(legacyMigratorDb, migrations);
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function RootLayoutNav() {
  useAuthDeepLink();
  const nativeColorScheme = useColorScheme();
  // react-native-web's useColorScheme only ever reflects the OS/browser
  // prefers-color-scheme, never the in-app theme picker (see use-theme.ts) —
  // without this, React Navigation's own chrome (the Tabs/Stack scene
  // container background behind the tab bar) stayed on the OS scheme even
  // when the rest of the app switched to the in-app choice.
  const { data: settings } = useSettings();
  const themeMode = settings?.themeMode;
  const colorScheme = themeMode === 'light' || themeMode === 'dark' ? themeMode : nativeColorScheme;
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  const webFont = (path: string, nativeAsset: number) =>
    Platform.OS === 'web' ? { uri: path, display: FontDisplay.BLOCK } : nativeAsset;
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_400Regular: webFont('/fonts/BricolageGrotesque-Regular.ttf', BricolageGrotesque_400Regular),
    BricolageGrotesque_500Medium: webFont('/fonts/BricolageGrotesque-Medium.ttf', BricolageGrotesque_500Medium),
    BricolageGrotesque_600SemiBold: webFont('/fonts/BricolageGrotesque-SemiBold.ttf', BricolageGrotesque_600SemiBold),
    BricolageGrotesque_700Bold: webFont('/fonts/BricolageGrotesque-Bold.ttf', BricolageGrotesque_700Bold),
    BarlowCondensed_600SemiBold: webFont('/fonts/BarlowCondensed-SemiBold.ttf', BarlowCondensed_600SemiBold),
    BarlowCondensed_700Bold: webFont('/fonts/BarlowCondensed-Bold.ttf', BarlowCondensed_700Bold),
    IBMPlexMono_500Medium: webFont('/fonts/IBMPlexMono-Medium.ttf', IBMPlexMono_500Medium),
    IBMPlexMono_700Bold: webFont('/fonts/IBMPlexMono-Bold.ttf', IBMPlexMono_700Bold),
  });
  // Runs against the pre-Faz-2 file (legacyMigratorDb/sqliteDb) — brings it
  // up to date so uuid-migration.ts can safely read every column it expects.
  // The new PowerSync-managed database (db/powersync.ts) doesn't go through
  // this at all; its schema is created automatically from DrizzleAppSchema.
  const { success: migrationsReady, error: migrationError } = useLegacyMigrations();
  const [seeded, setSeeded] = useState(false);
  const [webUpdateReady, setWebUpdateReady] = useState(false);
  const [webFontWaitElapsed, setWebFontWaitElapsed] = useState(false);

  // Static PWA font files are local assets, but a cold Android browser can
  // still paint its system fallback before they arrive. Give them a brief,
  // bounded head start; a failed request must never recreate the old white
  // startup screen, so the app continues after this short window.
  useEffect(() => {
    if (Platform.OS !== 'web' || fontsLoaded) {
      return;
    }
    const timer = setTimeout(() => setWebFontWaitElapsed(true), 6000);
    return () => clearTimeout(timer);
  }, [fontsLoaded]);

  // A browser needs a service worker for “Ana Ekrana Ekle” to remain usable
  // offline. This is deliberately registered after the React app mounts so a
  // first visitor still gets a normal online load before anything is cached.
  useEffect(() => {
    if (Platform.OS !== 'web' || !('serviceWorker' in navigator)) {
      return;
    }

    let cancelled = false;
    let updatePoll: ReturnType<typeof setInterval> | undefined;
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        const showUpdateWhenReady = () => {
          if (!cancelled && registration.waiting && navigator.serviceWorker.controller) {
            setWebUpdateReady(true);
          }
        };
        showUpdateWhenReady();
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed') showUpdateWhenReady();
          });
        });
        updatePoll = setInterval(showUpdateWhenReady, 15000);
      })
      .catch((error) => console.warn('PWA çevrimdışı önbelleği başlatılamadı:', error));
    return () => {
      cancelled = true;
      if (updatePoll) clearInterval(updatePoll);
    };
  }, []);

  const applyWebUpdate = async () => {
    if (Platform.OS !== 'web' || !('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!registration?.waiting) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  // Every table (including the uuid-migration itself) is keyed by user_id
  // now, so nothing else can safely touch the database until we know who's
  // signed in. The migration/seed steps below decide what to do by checking
  // whether the LOCAL database already has rows — which is only accurate
  // once an initial sync has come down from Supabase. Skipping that wait
  // (e.g. on a second device, or after a reinstall) would make them think
  // this is a brand-new account and re-import/re-seed data that already
  // exists there, which for `settings` (unique per user_id) would fail to
  // upload and jam the sync queue forever — the exact failure class already
  // fixed elsewhere in seed.ts/uuid-migration.ts, just from the opposite
  // direction. So: connect first, give the first sync a few seconds to land,
  // *then* run migration/seed — but don't block forever, since this app is
  // offline-first and a genuinely fresh, never-synced-before signup must
  // still work with no network at all.
  useEffect(() => {
    if (migrationsReady && userId && user) {
      // A closed/unreachable PowerSync worker can leave one local seed query
      // pending forever. The app is offline-first, so do not hold the whole
      // UI behind that optional preparation chain; open with whatever local
      // data is available and let the chain finish if the worker recovers.
      let settled = false;
      const preparationFallback = setTimeout(() => {
        if (!settled) {
          console.warn('App preparation timed out; opening with local data');
          setSeeded(true);
        }
      }, 10000);
      powerSyncDb.connect(supabaseConnector);
      Promise.race([powerSyncDb.waitForFirstSync(), new Promise((resolve) => setTimeout(resolve, 5000))])
        .then(() => runUuidMigration(user.id))
        .then(() =>
          Promise.all([seedExercisesIfEmpty(user.id), seedFoodsIfEmpty(user.id), seedSettingsIfEmpty(user.id, user.user_metadata.media_cloud_backup === true, user.user_metadata.language === 'tr' ? 'tr' : 'en')])
        )
        .then(() => backfillFoodPortionsIfMissing())
        .then(() => fixEtiLifalifYulafEzmesiNutrition())
        .then(() => applyDetailedNutritionUpdate())
        .then(() => repairOrphanedCatalogReferences())
        .then(() => dedupeFoods(user.id))
        .then(() => dedupeSupplementLogs())
        .then(() => ensureUncategorizedSupplementCategory(user.id, user.user_metadata.language === 'tr' ? 'tr' : 'en'))
        .then(() => closeStaleOpenSessions())
        .then(() => getSettingsRow())
        .then((row) => {
          // react-native-web has no Appearance.setColorScheme — calling it
          // threw here on every boot once a user had themeMode set, which
          // aborted this whole init chain (seeding, dedupe, etc. above) and
          // fell back to "opening with local data only" every single time.
          if (Platform.OS !== 'web' && row?.themeMode && row.themeMode !== 'system') {
            Appearance.setColorScheme(row.themeMode);
          }
          setSeeded(true);
        })
        // Without this, any failure anywhere in the chain above (e.g.
        // waitForFirstSync() rejecting because connect() couldn't reach the
        // network) left `seeded` false forever — the app stuck on a blank
        // splash screen with no recovery, even though every step here reads
        // from local SQLite and this app is meant to be offline-first.
        .catch((error) => {
          console.error('App init chain failed, opening with local data only', error);
          setSeeded(true);
        })
        .finally(() => {
          settled = true;
          clearTimeout(preparationFallback);
        });
      return () => {
        settled = true;
        clearTimeout(preparationFallback);
      };
    }
  }, [migrationsReady, userId]);

  // PowerSync changes its SQLite data outside React Query mutations. Refresh
  // query results when a completed download becomes visible, otherwise a web
  // tab that passed the five-second startup fallback can keep rendering its
  // old local cache until the user manually reloads.
  useEffect(() => {
    if (!migrationsReady || !userId) {
      return;
    }
    let lastHandledSync: number | undefined;
    const refreshAfterCompletedSync = (status: typeof powerSyncDb.currentStatus) => {
      const completedAt = status.lastSyncedAt?.getTime();
      if (!status.hasSynced || completedAt == null || completedAt === lastHandledSync) {
        return;
      }
      lastHandledSync = completedAt;
      queryClient.invalidateQueries();
    };
    refreshAfterCompletedSync(powerSyncDb.currentStatus);
    return powerSyncDb.registerListener({ statusChanged: refreshAfterCompletedSync });
  }, [migrationsReady, userId]);

  // Independent of the seed/migration chain above — recovers a photo picked
  // just before Android killed the app's activity mid-pick (see
  // lib/pending-media-recovery.ts). Runs on app start AND on every return
  // to the foreground: when the activity is recreated the JS process
  // usually survives, so the foreground transition is the only signal that
  // fires in exactly the broken scenario. No-op when nothing is pending.
  useEffect(() => {
    if (!user) {
      return;
    }
    recoverPendingMediaPick(queryClient, user.id);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // Small delay so the native side finishes persisting the orphaned
        // result before we ask for it.
        setTimeout(() => recoverPendingMediaPick(queryClient, user.id), 500);
      }
    });
    return () => subscription.remove();
  }, [user]);

  // Android may suspend the native PowerSync connection while the device is
  // locked. Reconnect as soon as the app returns instead of letting the next
  // write surface as a misleading network error.
  useEffect(() => {
    if (Platform.OS === 'web' || !user) {
      return;
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        powerSyncDb.connect(supabaseConnector);
      }
    });
    return () => subscription.remove();
  }, [user]);

  useEffect(() => {
    // The web PowerSync worker keeps the singleton database client alive
    // across auth transitions. Disconnecting the freshly-created client
    // during the initial signed-out render closes its extension, and the
    // same singleton then cannot accept the first authenticated write.
    if (Platform.OS !== 'web' && !user) {
      powerSyncDb.disconnect();
    }
  }, [user]);

  // Every table now requires user_id, so nothing in the app works signed
  // out — once auth has finished loading with no session, stop waiting on
  // the (never-coming) seed and let the app mount straight to /account.
  const needsAuth = migrationsReady && !authLoading && !user;
  // Web fonts get a short bounded preparation window: enough to avoid
  // Android painting the permanent system fallback, never enough to hold a
  // signed-out visitor on the startup screen after a failed request.
  // On web, route-level remounts can reset the optional seed state while the
  // authenticated PowerSync preparation worker is still settling. Auth has
  // already decided whether the visitor is signed in at this point, so keep
  // the UI reachable and let each query reflect the local/sync state. Native
  // startup retains the existing seeded gate.
  const webFontsReady = fontsLoaded || webFontWaitElapsed;
  const applicationReady = seeded || needsAuth || (Platform.OS === 'web' && migrationsReady && !authLoading);
  const appReady = applicationReady && (Platform.OS !== 'web' || webFontsReady);

  useEffect(() => {
    if (appReady) {
      SplashScreen.hideAsync();
    }
  }, [appReady]);

  useEffect(() => {
    if (needsAuth) {
      router.replace('/account');
    }
  }, [needsAuth]);

  if (migrationError) {
    throw migrationError;
  }

  if (!appReady) {
    // Returning null here makes a slow first web load indistinguishable from
    // a broken page: the browser shows only its white document background.
    // Keep the native splash for its normal brief hand-off, then show an
    // explicit in-app state while fonts, local auth, and the offline store
    // are getting ready.
    return <StartupScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false }} screenLayout={modalScreenLayout}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="workout" options={{ presentation: fullScreenModalPresentation }} />
            <Stack.Screen name="run" options={{ presentation: fullScreenModalPresentation }} />
            <Stack.Screen name="nutrition" />
            <Stack.Screen name="exercise/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="supplement/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="account" options={{ presentation: 'modal' }} />
          </Stack>
          <KeyboardDoneBar />
          {webUpdateReady && (
            <Pressable accessibilityRole="button" onPress={applyWebUpdate} style={styles.webUpdateBanner}>
              <Text style={styles.webUpdateText}>Yeni sürüm hazır · Yenile</Text>
            </Pressable>
          )}
        </ThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

function StartupScreen() {
  const [takingLonger, setTakingLonger] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTakingLonger(true), 15000);
    return () => clearTimeout(timer);
  }, []);

  const retry = async () => {
    if (Platform.OS === 'web') {
      // This is deliberately stronger than the normal update flow above:
      // a stale/broken service worker can keep serving the same bad startup
      // bundle on every ordinary reload. Clear its registrations and every
      // Cache Storage entry before restarting from the network.
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
      }
      window.location.href = window.location.href;
      return;
    }
    Updates.reloadAsync().catch(() => router.replace('/'));
  };

  return (
    <View style={styles.startupScreen} accessibilityLiveRegion="polite">
      <Text style={styles.startupWordmark}>COMPOS</Text>
      <ActivityIndicator color="#32D583" size="small" />
      <Text style={styles.startupText}>Preparing your workspace…</Text>
      {takingLonger && <View style={styles.startupRetry}><Text style={styles.startupWarning}>Bu normalden uzun sürdü.</Text><Pressable accessibilityRole="button" onPress={retry} style={styles.startupRetryButton}><Text style={styles.startupRetryLabel}>Yeniden Dene</Text></Pressable></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  startupScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    backgroundColor: '#101116',
  },
  startupWordmark: {
    color: '#F7F8FA',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 4,
  },
  startupText: {
    color: '#A0A5B1',
    fontSize: 14,
  },
  startupRetry: { alignItems: 'center', gap: 12, marginTop: 8 },
  startupWarning: { color: '#F7F8FA', fontSize: 14 },
  startupRetryButton: { minHeight: 44, minWidth: 128, alignItems: 'center', justifyContent: 'center', backgroundColor: '#208AEF', paddingHorizontal: 16, borderRadius: 10 },
  startupRetryLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  webUpdateBanner: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    zIndex: 100,
    borderRadius: 999,
    backgroundColor: '#208AEF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  webUpdateText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

import { withGradleProperties } from '@expo/config-plugins';
import type { ExpoConfig } from 'expo/config';

// Set only on the build profile submitted for Huawei AppGallery review
// (eas.json's "huawei" profile) — Health Connect is a Google Health
// Connect integration, unrelated to Huawei's own Health Kit, but keeping it
// out of the exact build sent for that review avoids raising questions
// during it. Every other build profile keeps Health Connect fully working.
const hideHealthConnect = process.env.EXPO_PUBLIC_HIDE_HEALTH_CONNECT === 'true';

// Kaan'ın kişisel "Compos Kişisel" varyantı (eas.json `personal` profili): AI koç sekmesi
// açılır, ayrı isim/paket kimliğiyle normal Compos'un yanına ayrı uygulama olarak kurulur.
// Normal ve yayın build'leri bu bayrağı hiç set etmez, onlarda hiçbir şey değişmez.
const personal = process.env.EXPO_PUBLIC_PERSONAL === 'true';

const config: ExpoConfig = {
  name: personal ? 'Compos Kişisel' : 'Compos',
  slug: 'fitness-tracker',
  version: '1.0.1',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: personal ? 'composkisisel' : 'fitnesstracker',
  userInterfaceStyle: 'automatic',
  ios: {
    icon: './assets/expo.icon',
    ...(personal && {
      bundleIdentifier: 'com.kaan.composkisisel',
      // Koç sunucusu evdeki makinede/telefonda düz HTTP ile çalışıyor (yerel ağ ya da
      // Tailscale) — ATS bunu varsayılan olarak engeller. NSAllowsLocalNetworking EKLEME: varlığında iOS
      // NSAllowsArbitraryLoads'u yok sayıyor ve Tailscale adresine (100.x) düz HTTP yine engelleniyor.
      infoPlist: { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true } },
    }),
  },
  android: {
    package: personal ? 'com.kaan.composkisisel' : 'com.compos.app',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY,
      },
    },
    // Not inferred from the react-native-health-connect JS calls — Expo
    // requires these declared explicitly to end up in AndroidManifest.xml.
    permissions: hideHealthConnect
      ? []
      : [
          'android.permission.health.READ_HEART_RATE',
          'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
          'android.permission.health.READ_STEPS',
          'android.permission.health.READ_SLEEP',
          'android.permission.health.READ_WEIGHT',
          'android.permission.health.READ_RESTING_HEART_RATE',
          'android.permission.health.READ_TOTAL_CALORIES_BURNED',
          'android.permission.health.READ_VO2_MAX',
          'android.permission.health.READ_OXYGEN_SATURATION',
          'android.permission.health.READ_HEART_RATE_VARIABILITY',
          'android.permission.health.READ_RESPIRATORY_RATE',
          'android.permission.health.READ_EXERCISE',
          'android.permission.health.READ_EXERCISE_ROUTES',
          'android.permission.health.READ_DISTANCE',
          'android.permission.health.READ_ELEVATION_GAINED',
          'android.permission.health.READ_SPEED',
          'android.permission.health.READ_BASAL_METABOLIC_RATE',
          'android.permission.health.READ_BODY_FAT',
          'android.permission.health.READ_BODY_TEMPERATURE',
          'android.permission.health.READ_BASAL_BODY_TEMPERATURE',
          'android.permission.health.READ_SKIN_TEMPERATURE',
          'android.permission.health.READ_BLOOD_GLUCOSE',
          'android.permission.health.READ_BLOOD_PRESSURE',
          'android.permission.health.READ_BONE_MASS',
          'android.permission.health.READ_BODY_WATER_MASS',
          'android.permission.health.READ_LEAN_BODY_MASS',
          'android.permission.health.READ_FLOORS_CLIMBED',
          'android.permission.health.READ_HEIGHT',
          'android.permission.health.READ_POWER',
          'android.permission.health.READ_HYDRATION',
          'android.permission.health.READ_NUTRITION',
          // Added 2026-08-21, second pass — "her turlu izni istiyorum" taken
          // literally this time (only reproductive-health types stay
          // excluded). Verified against the installed react-native-health-
          // connect's own native Kotlin source (PermissionUtils.kt) and
          // Google's official Health Connect docs, not guessed — see
          // src/lib/health-connect.ts REQUIRED_PERMISSIONS for the matching
          // entries and per-permission notes. StepsCadence/CyclingPedaling
          // Cadence need no new manifest line (they ride on READ_STEPS/
          // READ_EXERCISE, already declared above).
          'android.permission.health.READ_WHEELCHAIR_PUSHES',
          'android.permission.health.READ_MINDFULNESS',
          'android.permission.health.READ_HEALTH_DATA_HISTORY',
          'android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND',
        ],
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    'expo-sqlite',
    'expo-sharing',
    'expo-secure-store',
    // TODO: this plugin only adds READ/WRITE_EXTERNAL_STORAGE + INTERNET
    // Android permissions, which app-private documentDirectory/cacheDirectory
    // access (all we use it for) doesn't actually need — drop this entry on
    // the next real rebuild. Left in for now purely so this build's native
    // fingerprint keeps matching the already-installed local APK, letting
    // JS-only fixes ship via `eas update` instead of forcing another local
    // build+reinstall cycle just for a permission cleanup.
    'expo-file-system',
    './plugins/with-stable-debug-keystore',
    [
      'expo-image-picker',
      {
        photosPermission: personal
          ? 'Hareketlere ve koça görsel ekleyebilmek için galeriye erişim izni gerekiyor.'
          : 'Hareketlere görsel ekleyebilmek için galeriye erişim izni gerekiyor.',
        // Kişisel varyantta koça besin etiketi/tabak fotoğrafı çekip göndermek için.
        cameraPermission: personal ? 'Koça fotoğraf (ör. besin etiketi) gönderebilmek için kamera izni gerekiyor.' : false,
        microphonePermission: false,
      },
    ],
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Koşu rotanı haritada çizebilmek için konumuna, uygulama arka plandayken de erişim gerekiyor.',
        isAndroidBackgroundLocationEnabled: true,
      },
    ],
    ...(hideHealthConnect ? [] : ['react-native-health-connect']),
    // Koç bildirimleri: arka planda sunucuyu yoklayıp yerel bildirim (push yetkisi olmadan) — sadece Kişisel'de.
    ...(personal ? ['expo-background-task', './plugins/with-no-push-entitlement'] : []),
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 26,
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          // Kişisel varyantta koç sunucusuna yerel ağda düz HTTP ile bağlanılıyor.
          ...(personal && { usesCleartextTraffic: true }),
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  runtimeVersion: {
    policy: 'fingerprint',
  },
  updates: {
    url: 'https://u.expo.dev/f7222919-e3ad-4665-98c3-5ebabf802710',
  },
  extra: {
    router: {},
    eas: {
      projectId: 'f7222919-e3ad-4665-98c3-5ebabf802710',
    },
  },
  owner: 'kaganmuratk',
};

// Local builds (`eas build --local`, used to work around EAS Build's free
// monthly cloud-build quota) run Gradle on this dev machine, whose default
// jvmargs from the RN/Expo template (Xmx2048m/MaxMetaspaceSize512m) aren't
// enough for this project's module count and fail with a Metaspace OOM.
// Cloud builds use EAS's own build-machine config instead, so this only
// matters for local builds — harmless either way.
export default withGradleProperties(config, (mod) => {
  mod.modResults = mod.modResults.filter(
    (item) => !(item.type === 'property' && item.key === 'org.gradle.jvmargs')
  );
  mod.modResults.push({
    type: 'property',
    key: 'org.gradle.jvmargs',
    value: '-Xmx6144m -XX:MaxMetaspaceSize=2048m -XX:+HeapDumpOnOutOfMemoryError',
  });
  return mod;
});

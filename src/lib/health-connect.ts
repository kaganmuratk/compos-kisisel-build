import type {
  BackgroundAccessPermission,
  Permission,
  ReadHealthDataHistoryPermission,
} from 'react-native-health-connect';

import type { ActivityType } from '@/lib/activity-type';
import type { RoutePoint } from '@/lib/geo';

// The `huawei` EAS build profile (see app.config.ts's `hideHealthConnect`)
// deliberately drops the `react-native-health-connect` config plugin so the
// native module never gets linked into that build — done so Huawei's
// AppGallery review doesn't see a Google Health Connect integration in the
// exact APK submitted to them. But the package's own native binding
// (NativeHealthConnect.js: `TurboModuleRegistry.getEnforcing('HealthConnect')`)
// runs at IMPORT time and throws immediately whenever the native module
// isn't linked — a plain `import {...} from 'react-native-health-connect'`
// at the top of this file crashed the app on launch in that profile (found
// 2026-09-07: "keeps stopping" on first open), because this file is
// imported unconditionally by src/app/(tabs)/index.tsx on every profile,
// huawei included. `require()` is evaluated lazily at this line instead of
// at static-import time, so the native binding is only ever touched when
// this build profile actually links it.
const HEALTH_CONNECT_DISABLED = process.env.EXPO_PUBLIC_HIDE_HEALTH_CONNECT === 'true';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const HealthConnectNative = HEALTH_CONNECT_DISABLED ? null : (require('react-native-health-connect') as typeof import('react-native-health-connect'));

// Every exported function below already wraps its native calls in a
// try/catch that falls back to null/[]/{} ("no data"), the same contract
// as when Health Connect is genuinely absent from a device — so leaving
// these undefined in the disabled profile reuses that existing safe path
// rather than needing a second one. The cast trusts that every real call
// site is reached only through that try/catch (true today — verified by
// reading every export in this file).
const {
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings: openHealthConnectSettingsNative,
  readRecords,
  requestExerciseRoute,
  requestPermission,
  SdkAvailabilityStatus,
  SleepStageType,
  ExerciseSegmentType,
} = (HealthConnectNative ?? {}) as typeof import('react-native-health-connect');

// Not part of the package's public exports (only used internally in its
// own type files) — inlined here to match the 'between' variant this file
// always passes.
type TimeRangeFilter = { operator: 'between'; startTime: string; endTime: string };

const REQUIRED_PERMISSIONS: (Permission | ReadHealthDataHistoryPermission | BackgroundAccessPermission)[] = [
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'Vo2Max' },
  { accessType: 'read', recordType: 'OxygenSaturation' },
  { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
  { accessType: 'read', recordType: 'RespiratoryRate' },
  // Lets Compos notice a workout/run that was started and recorded on the
  // watch itself (via the Huawei Health -> Health Sync -> Health Connect
  // bridge) and offer to import it after the fact — see
  // queryRecentWatchSessions below.
  { accessType: 'read', recordType: 'ExerciseSession' },
  // Added 2026-08-20 alongside queryDistanceAndElevationForRange/
  // queryRawSampleCounts — a route-less (indoor/no-GPS) watch session still
  // has real distance/elevation, Health Connect just stores it as these
  // separate record types rather than inside ExerciseSession itself.
  // Missing from this list meant every read of them failed with a
  // permission error the callers' try/catch swallowed silently.
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'ElevationGained' },
  { accessType: 'read', recordType: 'Speed' },
  // Added 2026-08-21 — Kağan asked to broaden this to everything Gadgetbridge
  // could plausibly write, on purpose ahead of any Compos feature actually
  // reading these: "pull it all now, decide what to show later." Reproductive
  // -health record types (CervicalMucus/SexualActivity/Menstruation*/
  // OvulationTest/IntermenstrualBleeding) are the only ones left out —
  // categorically irrelevant to a fitness-watch data source and GDPR
  // "special category" data not worth requesting with zero justification.
  { accessType: 'read', recordType: 'BasalMetabolicRate' },
  { accessType: 'read', recordType: 'BodyFat' },
  { accessType: 'read', recordType: 'BodyTemperature' },
  { accessType: 'read', recordType: 'BasalBodyTemperature' },
  { accessType: 'read', recordType: 'SkinTemperature' },
  { accessType: 'read', recordType: 'BloodGlucose' },
  { accessType: 'read', recordType: 'BloodPressure' },
  { accessType: 'read', recordType: 'BoneMass' },
  { accessType: 'read', recordType: 'BodyWaterMass' },
  { accessType: 'read', recordType: 'LeanBodyMass' },
  { accessType: 'read', recordType: 'FloorsClimbed' },
  { accessType: 'read', recordType: 'Height' },
  { accessType: 'read', recordType: 'Power' },
  { accessType: 'read', recordType: 'Hydration' },
  { accessType: 'read', recordType: 'Nutrition' },
  // Added 2026-08-21, second pass, on Kağan's explicit "literally everything
  // except cycle-tracking" instruction. The previous pass excluded these for
  // reasons that turned out wrong once actually checked instead of guessed:
  //  - StepsCadence / CyclingPedalingCadence: no dedicated READ_* constant
  //    exists for either — confirmed via the installed react-native-health-
  //    connect's own native source (PermissionUtils.kt) that they ride on
  //    the ALREADY-requested READ_STEPS / READ_EXERCISE permissions. Adding
  //    them here needs no new manifest entry.
  //  - WheelchairPushes: not reproductive-health data, so it's in scope
  //    under this session's literal instruction even though no watch in
  //    this picture is likely to ever write it.
  // MindfulnessSession, ReadHealthDataHistory, and BackgroundAccessPermission
  // are genuinely new permissions (manifest entries added in app.config.ts):
  //  - MindfulnessSession: still marked experimental in the underlying
  //    androidx library, but exposed by this RN wrapper already.
  //  - ReadHealthDataHistory: lets Compos read records older than the
  //    default 30-day window — relevant once anything logs day-by-day
  //    history from Health Connect.
  //  - BackgroundAccessPermission: the actual OS gate for reading Health
  //    Connect data when Compos isn't in the foreground. Requesting it here
  //    does NOT by itself make Compos poll in the background — no
  //    scheduled/background task exists yet — it only removes the
  //    permission blocker for when one does.
  { accessType: 'read', recordType: 'StepsCadence' },
  { accessType: 'read', recordType: 'CyclingPedalingCadence' },
  { accessType: 'read', recordType: 'WheelchairPushes' },
  { accessType: 'read', recordType: 'MindfulnessSession' },
  { accessType: 'read', recordType: 'ReadHealthDataHistory' },
  { accessType: 'read', recordType: 'BackgroundAccessPermission' },
];

export type HealthConnectAvailability = 'unavailable' | 'update-required' | 'available';

// react-native-health-connect's own README shows initialize() as the very
// first call before anything else (getSdkStatus, requestPermission,
// readRecords...) — this app never called it at all, so every real
// Health Connect operation failed with "client is not initialized" (found
// 2026-08-12, the first time this feature was actually exercised on a real
// device; see project memory — Phase 1 shipped without on-device
// verification). Memoized since initialize() is cheap to call once but
// pointless to repeat on every query.
let initializedPromise: Promise<boolean> | null = null;
function ensureInitialized(): Promise<boolean> {
  if (!initializedPromise) {
    initializedPromise = initialize();
  }
  return initializedPromise;
}

export async function getHealthConnectAvailability(): Promise<HealthConnectAvailability> {
  await ensureInitialized();
  const status = await getSdkStatus();
  if (status === SdkAvailabilityStatus.SDK_AVAILABLE) {
    return 'available';
  }
  if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
    return 'update-required';
  }
  return 'unavailable';
}

export async function isHealthConnectConnected(): Promise<boolean> {
  await ensureInitialized();
  const granted = await getGrantedPermissions();
  return REQUIRED_PERMISSIONS.every((required) =>
    granted.some((g) => 'recordType' in g && g.recordType === required.recordType && g.accessType === required.accessType)
  );
}

export async function requestHealthConnectPermissions(): Promise<boolean> {
  await ensureInitialized();
  await requestPermission(REQUIRED_PERMISSIONS);
  return isHealthConnectConnected();
}

export const openHealthConnectSettings = openHealthConnectSettingsNative;

export type WorkoutHealthSummary = {
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  caloriesBurned: number | null;
  vo2Max: number | null;
  oxygenSaturation: number | null;
  heartRateVariability: number | null;
  respiratoryRate: number | null;
  avgCadence: number | null;
  maxCadence: number | null;
};

// VO2Max/SpO2/HRV/respiratory rate aren't in aggregateRecord's supported
// record-type union (checked the library's own aggregate.types.d.ts —
// only Health Connect's own "aggregatable" types are listed there, and
// these four aren't among them) — so unlike heart rate/calories/steps,
// there's no server-side average to ask for. Read the raw instantaneous
// records in the window instead and average them here. Returns null if
// no measurements fell in the window, same "no data" contract as
// aggregateRecord-based queries.
async function averageInstantaneousValue<T extends { time: string }>(
  recordType: Parameters<typeof readRecords>[0],
  timeRangeFilter: TimeRangeFilter,
  extractValue: (record: T) => number
): Promise<number | null> {
  const { records } = await readRecords(recordType, { timeRangeFilter });
  if (records.length === 0) {
    return null;
  }
  const sum = records.reduce((total, record) => total + extractValue(record as unknown as T), 0);
  return sum / records.length;
}

// StepsCadence (unlike Vo2Max/SpO2/HRV/respiratory rate above) is an
// interval record with a samples[] array — same shape as HeartRate/Speed —
// so it needs sample-flattening rather than averageInstantaneousValue's
// one-value-per-record read. cardioSessions.avgCadence/maxCadence have
// existed in the schema and the run summary screen's UI (see
// src/app/run/summary/[id].tsx) since before this session, but nothing
// ever wrote to them — found while auditing this file, not asked for
// separately, and a natural fit now that StepsCadence is a requested
// permission (added earlier this same session).
async function averageAndMaxCadence(timeRangeFilter: TimeRangeFilter): Promise<{ avg: number; max: number } | null> {
  const { records } = await readRecords('StepsCadence', { timeRangeFilter });
  const rates = records.flatMap((record) => record.samples.map((sample) => sample.rate));
  if (rates.length === 0) {
    return null;
  }
  return { avg: rates.reduce((sum, rate) => sum + rate, 0) / rates.length, max: Math.max(...rates) };
}

export type WatchDistanceSummary = {
  distanceMeters: number | null;
  elevationGainMeters: number | null;
};

// Cycling cadence and power are meaningful only for a bike session. Keeping
// them separate from the generic workout summary avoids labelling a runner's
// step cadence as pedal cadence (or showing bike-only fields for a swim).
export async function queryCyclingDetails(startedAt: string, finishedAt: string): Promise<Record<string, string>> {
  try {
    await ensureInitialized();
    const timeRangeFilter = { operator: 'between' as const, startTime: startedAt, endTime: finishedAt };
    const [cadence, power] = await Promise.all([
      aggregateRecord({ recordType: 'CyclingPedalingCadence', timeRangeFilter }).catch(() => null),
      aggregateRecord({ recordType: 'Power', timeRangeFilter }).catch(() => null),
    ]);
    const details: Record<string, string> = {};
    if (cadence && cadence.dataOrigins.length > 0) {
      details['Ortalama pedal ritmi'] = `${Math.round(cadence.RPM_AVG)} rpm`;
      details['Maksimum pedal ritmi'] = `${Math.round(cadence.RPM_MAX)} rpm`;
    }
    if (power && power.dataOrigins.length > 0) {
      details['Ortalama güç'] = `${Math.round(power.POWER_AVG.inWatts)} W`;
      details['Maksimum güç'] = `${Math.round(power.POWER_MAX.inWatts)} W`;
    }
    return details;
  } catch (error) {
    console.warn('Health Connect bisiklet metrikleri sorgusu başarısız:', error);
    return {};
  }
}

// A GPS route (when present) already gives distance/elevation for free via
// totalDistance()/totalElevationGain() over its points — but an
// indoor/no-GPS session (treadmill, indoor walk, gym cardio) has no route
// at all, even though the watch itself measured real distance (from its
// step/accelerometer data) and wrote it to Health Connect as its own
// Distance/ElevationGained records. Import used to just leave these null
// whenever there was no route, silently dropping data the watch actually
// had. Called as a fallback specifically for that no-route case.
export async function queryDistanceAndElevationForRange(startedAt: string, finishedAt: string): Promise<WatchDistanceSummary> {
  try {
    await ensureInitialized();
    const timeRangeFilter = { operator: 'between' as const, startTime: startedAt, endTime: finishedAt };
    const [distance, elevation] = await Promise.all([
      aggregateRecord({ recordType: 'Distance', timeRangeFilter }).catch(() => null),
      aggregateRecord({ recordType: 'ElevationGained', timeRangeFilter }).catch(() => null),
    ]);
    // Same "dataOrigins empty means no data, not a real zero" check as
    // queryDailyHealthSummary's resting-heart-rate/calories fields above.
    return {
      distanceMeters: (distance?.dataOrigins.length ?? 0) > 0 ? distance!.DISTANCE.inMeters : null,
      elevationGainMeters: (elevation?.dataOrigins.length ?? 0) > 0 ? elevation!.ELEVATION_GAINED_TOTAL.inMeters : null,
    };
  } catch (error) {
    console.warn('Health Connect mesafe/irtifa sorgusu başarısız:', error);
    return { distanceMeters: null, elevationGainMeters: null };
  }
}

export type TimeSeriesPoint = { value: number; label: string };

const MAX_CHART_POINTS = 60;

// A session can carry hundreds of raw samples (confirmed on-device: 201
// heart-rate + 72 speed samples for one ~indoor walk) — react-native-
// gifted-charts' LineChart renders that as unreadable noise on a phone
// screen, not a real graph. Buckets samples into at most maxPoints
// equal-duration slices and averages each, so the chart shows a smooth
// trend instead of every raw tick.
function elapsedMinutesLabel(bucketCenterMs: number): string {
  return `${Math.round(bucketCenterMs / 60000)}dk`;
}

function clockTimeLabel(bucketCenterMs: number, windowStartMs: number): string {
  const d = new Date(windowStartMs + bucketCenterMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function downsampleToChartPoints(
  samples: { time: string; value: number }[],
  windowStart: string,
  maxPoints = MAX_CHART_POINTS,
  formatLabel: (bucketCenterMs: number, windowStartMs: number) => string = elapsedMinutesLabel
): TimeSeriesPoint[] {
  if (samples.length === 0) {
    return [];
  }
  const startMs = new Date(windowStart).getTime();
  const lastMs = new Date(samples[samples.length - 1].time).getTime();
  const durationMs = Math.max(1, lastMs - startMs);
  const bucketCount = Math.min(maxPoints, samples.length);
  const buckets: { sum: number; count: number }[] = Array.from({ length: bucketCount }, () => ({ sum: 0, count: 0 }));
  for (const sample of samples) {
    const elapsedMs = new Date(sample.time).getTime() - startMs;
    const bucketIndex = Math.min(bucketCount - 1, Math.max(0, Math.floor((elapsedMs / durationMs) * bucketCount)));
    buckets[bucketIndex].sum += sample.value;
    buckets[bucketIndex].count += 1;
  }
  const points: TimeSeriesPoint[] = [];
  buckets.forEach((bucket, i) => {
    if (bucket.count === 0) return;
    const bucketCenterMs = (durationMs * (i + 0.5)) / bucketCount;
    points.push({ value: bucket.sum / bucket.count, label: formatLabel(bucketCenterMs, startMs) });
  });
  return points;
}

// Per-workout time series, queried live (not persisted — same "ask Health
// Connect fresh every time" contract as queryStepsForDate/querySleepForDate)
// for the graph on the run summary screen. Empty array means either no
// permission, no data in this window, or a session that didn't come from a
// watch — the caller just hides the chart, same "no data" contract as
// queryWorkoutHealthSummary returning null.
export async function queryHeartRateTimeSeries(startedAt: string, finishedAt: string): Promise<TimeSeriesPoint[]> {
  try {
    await ensureInitialized();
    const timeRangeFilter = { operator: 'between' as const, startTime: startedAt, endTime: finishedAt };
    const { records } = await readRecords('HeartRate', { timeRangeFilter });
    const samples = records
      .flatMap((record) => record.samples.map((sample) => ({ time: sample.time, value: sample.beatsPerMinute })))
      .sort((a, b) => a.time.localeCompare(b.time));
    return downsampleToChartPoints(samples, startedAt);
  } catch (error) {
    console.warn('Health Connect nabız zaman serisi sorgusu başarısız:', error);
    return [];
  }
}

// Dedicated sleep-window heart-rate graph — same downsampling as
// queryHeartRateTimeSeries (the per-workout version) but with clock-time
// labels instead of elapsed-minutes, since an 8-hour sleep window makes
// "420dk" much less readable than "23:45"/"04:10" would be. Shown in
// History's day-detail screen, not Bugün (Kağan's own split: Bugün shows
// daytime-only, History shows the night that led into that day).
export async function querySleepHeartRateTimeSeries(startTime: string, endTime: string): Promise<TimeSeriesPoint[]> {
  try {
    await ensureInitialized();
    const { records } = await readRecords('HeartRate', {
      timeRangeFilter: { operator: 'between', startTime, endTime },
    });
    const samples = records
      .flatMap((record) => record.samples.map((sample) => ({ time: sample.time, value: sample.beatsPerMinute })))
      .sort((a, b) => a.time.localeCompare(b.time));
    return downsampleToChartPoints(samples, startTime, MAX_CHART_POINTS, clockTimeLabel);
  } catch (error) {
    console.warn('Health Connect uyku nabız zaman serisi sorgusu başarısız:', error);
    return [];
  }
}

async function readSpeedSamples(startedAt: string, finishedAt: string): Promise<{ time: string; value: number }[]> {
  await ensureInitialized();
  const timeRangeFilter = { operator: 'between' as const, startTime: startedAt, endTime: finishedAt };
  const { records } = await readRecords('Speed', { timeRangeFilter });
  return records
    .flatMap((record) => record.samples.map((sample) => ({ time: sample.time, value: sample.speed.inKilometersPerHour })))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export async function querySpeedTimeSeries(startedAt: string, finishedAt: string): Promise<TimeSeriesPoint[]> {
  try {
    const samples = await readSpeedSamples(startedAt, finishedAt);
    return downsampleToChartPoints(samples, startedAt);
  } catch (error) {
    console.warn('Health Connect hız zaman serisi sorgusu başarısız:', error);
    return [];
  }
}

// Undownsampled speed samples, for lib/pace-segments.ts's run/walk/stopped
// classification — the chart's MAX_CHART_POINTS bucketing would average
// away exactly the short stop/walk stretches that classification needs to
// tell apart from a genuine pace change.
export async function queryRawSpeedSamples(startedAt: string, finishedAt: string): Promise<{ time: string; value: number }[]> {
  try {
    return await readSpeedSamples(startedAt, finishedAt);
  } catch (error) {
    console.warn('Health Connect ham hız örneklemi sorgusu başarısız:', error);
    return [];
  }
}

// Temporary diagnostic (2026-08-20) — originally added because whether a
// real graph feature was even buildable from what Gadgetbridge writes was
// an open question rather than something to guess at (confirmed on-device:
// 201 heart-rate + 72 speed samples for one session). That question is now
// answered and queryHeartRateTimeSeries/querySpeedTimeSeries above are the
// real querying this comment originally said would replace it — this
// function is only still here because Settings still has a "Ham Veri
// Kontrolü" button wired to it (src/app/(tabs)/settings.tsx). Safe to
// remove both together whenever that's wanted; not removed here since
// deleting a working Settings button wasn't part of what this pass asked.
export async function queryRawSampleCounts(startedAt: string, finishedAt: string): Promise<{ heartRateSamples: number; speedSamples: number }> {
  await ensureInitialized();
  const timeRangeFilter = { operator: 'between' as const, startTime: startedAt, endTime: finishedAt };
  const [heartRate, speed] = await Promise.all([
    readRecords('HeartRate', { timeRangeFilter }),
    readRecords('Speed', { timeRangeFilter }),
  ]);
  return {
    heartRateSamples: heartRate.records.reduce((sum, record) => sum + record.samples.length, 0),
    speedSamples: speed.records.reduce((sum, record) => sum + record.samples.length, 0),
  };
}

// Called after a workout/run session finishes — queries Health Connect for
// whatever heart-rate/calorie/advanced-metric data fell inside the
// session's own time window. Returns null on ANY failure (no permission,
// Health Connect not installed, unexpected error) so the caller can treat
// "no data" and "not connected" the same way: skip the write-back
// silently, this is optional enrichment on top of data that already works
// fully without it.
export async function queryWorkoutHealthSummary(startedAt: string, finishedAt: string): Promise<WorkoutHealthSummary | null> {
  try {
    await ensureInitialized();
    const timeRangeFilter = { operator: 'between' as const, startTime: startedAt, endTime: finishedAt };
    // Each metric below is caught individually (found 2026-08-25 — Kağan
    // reported the run summary's heart-rate chart missing entirely for a
    // run that should have had watch data). Without this, one flaky/
    // unsupported record type anywhere in this Promise.all (StepsCadence is
    // the newest and least-proven addition, per averageAndMaxCadence's own
    // doc comment) rejects the whole array and this function returns null —
    // silently discarding heart rate/calories data that DID come back fine,
    // and (via useFinishCardioSession's `if (summary || movement || ...)`
    // check) can even skip setting healthSyncedAt entirely, which also
    // disables the summary screen's separate live heart-rate/speed chart
    // queries. Same per-call isolation queryDistanceAndElevationForRange
    // above already uses, for the same reason.
    const [heartRate, calories, vo2Max, oxygenSaturation, heartRateVariability, respiratoryRate, cadence] = await Promise.all([
      aggregateRecord({ recordType: 'HeartRate', timeRangeFilter }).catch(() => null),
      aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter }).catch(() => null),
      averageInstantaneousValue<{ time: string; vo2MillilitersPerMinuteKilogram: number }>(
        'Vo2Max',
        timeRangeFilter,
        (r) => r.vo2MillilitersPerMinuteKilogram
      ).catch(() => null),
      averageInstantaneousValue<{ time: string; percentage: number }>('OxygenSaturation', timeRangeFilter, (r) => r.percentage).catch(
        () => null
      ),
      averageInstantaneousValue<{ time: string; heartRateVariabilityMillis: number }>(
        'HeartRateVariabilityRmssd',
        timeRangeFilter,
        (r) => r.heartRateVariabilityMillis
      ).catch(() => null),
      averageInstantaneousValue<{ time: string; rate: number }>('RespiratoryRate', timeRangeFilter, (r) => r.rate).catch(() => null),
      averageAndMaxCadence(timeRangeFilter).catch(() => null),
    ]);
    const hasHeartRateData = (heartRate?.MEASUREMENTS_COUNT ?? 0) > 0;
    return {
      avgHeartRate: hasHeartRateData ? Math.round(heartRate!.BPM_AVG) : null,
      maxHeartRate: hasHeartRateData ? Math.round(heartRate!.BPM_MAX) : null,
      caloriesBurned: calories?.ACTIVE_CALORIES_TOTAL.inKilocalories ?? null,
      vo2Max,
      oxygenSaturation,
      heartRateVariability,
      respiratoryRate,
      avgCadence: cadence?.avg ?? null,
      maxCadence: cadence?.max ?? null,
    };
  } catch (error) {
    console.warn('Health Connect sorgusu başarısız:', error);
    return null;
  }
}

// Steps are a whole-day metric (not tied to a session's fixed window), and
// unlike heart rate/calories they're never written to our own DB — Health
// Connect is queried live every time, for whichever date the caller wants
// (today's card, or a past day in history), so there's nothing to keep in
// sync or backfill.
export async function queryStepsForDate(dateString: string): Promise<number | null> {
  try {
    await ensureInitialized();
    const startOfDay = new Date(`${dateString}T00:00:00`);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const result = await aggregateRecord({
      recordType: 'Steps',
      timeRangeFilter: { operator: 'between', startTime: startOfDay.toISOString(), endTime: endOfDay.toISOString() },
    });
    return result.COUNT_TOTAL;
  } catch (error) {
    console.warn('Health Connect adım sorgusu başarısız:', error);
    return null;
  }
}

export type DailyHealthSummary = {
  restingHeartRate: number | null;
  totalCaloriesBurned: number | null;
};

// Some bridge apps (e.g. Health Sync relaying Huawei Health data) never
// write a dedicated RestingHeartRate record at all, even though they do
// write plain HeartRate samples — that source's "resting heart rate" stays
// permanently invisible to the aggregate query above. Fallback: approximate
// it from the day's raw HeartRate samples by averaging the lowest 10% of
// readings (the readings most likely captured at actual rest), rather than
// showing nothing. Returns null if there are no HeartRate samples either.
async function estimateRestingHeartRateFromSamples(timeRangeFilter: TimeRangeFilter): Promise<number | null> {
  const { records } = await readRecords('HeartRate', { timeRangeFilter });
  const allBpm = records.flatMap((record) => record.samples.map((sample) => sample.beatsPerMinute));
  if (allBpm.length === 0) {
    return null;
  }
  const sorted = [...allBpm].sort((a, b) => a - b);
  const lowestCount = Math.max(1, Math.round(sorted.length * 0.1));
  const lowest = sorted.slice(0, lowestCount);
  return Math.round(lowest.reduce((sum, bpm) => sum + bpm, 0) / lowest.length);
}

// Same whole-day, always-live-queried shape as queryStepsForDate — a daily
// summary card, not tied to any workout session and never persisted.
export async function queryDailyHealthSummary(dateString: string): Promise<DailyHealthSummary | null> {
  try {
    await ensureInitialized();
    const startOfDay = new Date(`${dateString}T00:00:00`);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const timeRangeFilter = { operator: 'between' as const, startTime: startOfDay.toISOString(), endTime: endOfDay.toISOString() };
    const [restingHeartRate, totalCalories] = await Promise.all([
      aggregateRecord({ recordType: 'RestingHeartRate', timeRangeFilter }).catch(() => null),
      aggregateRecord({ recordType: 'TotalCaloriesBurned', timeRangeFilter }).catch(() => null),
    ]);
    // Unlike HeartRateAggregateResult, RestingHeartRateAggregateResult and
    // TotalCaloriesBurnedAggregateResult don't expose a MEASUREMENTS_COUNT
    // field to check against — and aggregateRecord doesn't throw when the
    // window has zero underlying records, it resolves with BPM_AVG/
    // ENERGY_TOTAL defaulted to 0, which read back as a real "0 bpm" /
    // "0 kcal" instead of "no data." `dataOrigins` (on every aggregate
    // result, per BaseAggregate) is empty exactly when nothing contributed
    // to the aggregate, so it's the one field reliable enough to tell
    // "genuinely zero" apart from "no data at all" here.
    const hasRestingHeartRateData = (restingHeartRate?.dataOrigins.length ?? 0) > 0;
    const hasCaloriesData = (totalCalories?.dataOrigins.length ?? 0) > 0;
    const restingHeartRateValue = hasRestingHeartRateData
      ? Math.round(restingHeartRate!.BPM_AVG)
      : await estimateRestingHeartRateFromSamples(timeRangeFilter);
    return {
      restingHeartRate: restingHeartRateValue,
      totalCaloriesBurned: hasCaloriesData ? totalCalories!.ENERGY_TOTAL.inKilocalories : null,
    };
  } catch (error) {
    console.warn('Health Connect günlük özet sorgusu başarısız:', error);
    return null;
  }
}

export type SleepStageBreakdown = {
  deepHours: number;
  lightHours: number;
  remHours: number;
  awakeHours: number;
};

export type SleepSummary = {
  bedTime: string;
  wakeTime: string;
  sleepHours: number;
  napHours: number | null;
  // Only watches that record sleep stages (not every Health Connect source
  // does) populate this — undefined means "no stage breakdown available",
  // distinct from all-zero durations.
  stages?: SleepStageBreakdown;
  // Real ISO timestamps of the sleep window (bedTime/wakeTime above are
  // HH:MM-only, losing which calendar day they fall on — a sleep session
  // starting 23:30 and ending 07:30 needs the actual dates to query
  // anything else, like heart rate, against the right window). Added
  // specifically so querySleepHeartRateTimeSeries below has a real window
  // to work with.
  startTime: string;
  endTime: string;
};

// Sleep sessions span across midnight (e.g. 23:30 one day to 07:30 the
// next) — querying a window from noon the day before to noon of the
// requested date reliably catches "the main sleep that led into this
// morning" regardless of exact bed/wake times. Picks the LONGEST session
// in that window (the real night's sleep, not a nap), converts to the
// same HH:MM local-time strings dailyCheckins already stores.
// Not every source records stages — a watch that only reports total
// bed/wake times gives an empty or missing `stages` array, in which case
// this returns undefined rather than a misleading all-zero breakdown.
function summarizeSleepStages(stages: { startTime: string; endTime: string; stage: number }[] | undefined) {
  if (!stages || stages.length === 0) {
    return undefined;
  }
  const hoursByStage = { deep: 0, light: 0, rem: 0, awake: 0 };
  for (const segment of stages) {
    const hours = (new Date(segment.endTime).getTime() - new Date(segment.startTime).getTime()) / (1000 * 60 * 60);
    if (segment.stage === SleepStageType.DEEP) hoursByStage.deep += hours;
    else if (segment.stage === SleepStageType.LIGHT) hoursByStage.light += hours;
    else if (segment.stage === SleepStageType.REM) hoursByStage.rem += hours;
    else if (segment.stage === SleepStageType.AWAKE) hoursByStage.awake += hours;
  }
  const total = hoursByStage.deep + hoursByStage.light + hoursByStage.rem + hoursByStage.awake;
  if (total === 0) {
    return undefined;
  }
  return { deepHours: hoursByStage.deep, lightHours: hoursByStage.light, remHours: hoursByStage.rem, awakeHours: hoursByStage.awake };
}

export async function querySleepForDate(dateString: string): Promise<SleepSummary | null> {
  try {
    await ensureInitialized();
    const dayStart = new Date(`${dateString}T00:00:00`);
    const windowStart = new Date(dayStart.getTime() - 12 * 60 * 60 * 1000);
    const windowEnd = new Date(dayStart.getTime() + 12 * 60 * 60 * 1000);
    const { records } = await readRecords('SleepSession', {
      timeRangeFilter: { operator: 'between', startTime: windowStart.toISOString(), endTime: windowEnd.toISOString() },
    });
    if (records.length === 0) {
      return null;
    }
    const longest = records.reduce((best, record) => {
      const duration = new Date(record.endTime).getTime() - new Date(record.startTime).getTime();
      const bestDuration = new Date(best.endTime).getTime() - new Date(best.startTime).getTime();
      return duration > bestDuration ? record : best;
    });
    const start = new Date(longest.startTime);
    const end = new Date(longest.endTime);
    const napHours =
      records
        .filter((record) => record !== longest)
        .reduce((total, record) => total + new Date(record.endTime).getTime() - new Date(record.startTime).getTime(), 0) /
        (1000 * 60 * 60) || null;
    const toHHMM = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return {
      bedTime: toHHMM(start),
      wakeTime: toHHMM(end),
      sleepHours: (end.getTime() - start.getTime()) / (1000 * 60 * 60),
      napHours,
      stages: summarizeSleepStages(longest.stages),
      startTime: longest.startTime,
      endTime: longest.endTime,
    };
  } catch (error) {
    console.warn('Health Connect uyku sorgusu başarısız:', error);
    return null;
  }
}

// Most recent weigh-in of the given date, in kg (dailyCheckins.weightKg's
// own unit — MassResult.inKilograms is already unit-converted by the
// library, no manual conversion needed).
export async function queryWeightForDate(dateString: string): Promise<number | null> {
  try {
    await ensureInitialized();
    const startOfDay = new Date(`${dateString}T00:00:00`);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const { records } = await readRecords('Weight', {
      timeRangeFilter: { operator: 'between', startTime: startOfDay.toISOString(), endTime: endOfDay.toISOString() },
    });
    if (records.length === 0) {
      return null;
    }
    const latest = records.reduce((best, record) => (new Date(record.time) > new Date(best.time) ? record : best));
    return latest.weight.inKilograms;
  } catch (error) {
    console.warn('Health Connect kilo sorgusu başarısız:', error);
    return null;
  }
}

// Health Connect's own ExerciseType numeric codes (see the library's
// constants.ts) that have a GPS route to speak of — used only to decide
// whether it's worth calling resolveWatchSessionRoute() for a detected
// session. NOT the same question as "is this cardio" (see
// CARDIO_EXERCISE_TYPES below) — swimming/rowing/elliptical are cardio but
// never have a route, and using this set for that decision too used to
// route swim sessions into the strength-workout import path instead.
const ROUTE_BASED_EXERCISE_TYPES = new Set([8, 9, 37, 56, 57, 61, 63, 79]); // biking, biking stationary, hiking, running, running treadmill, skiing, snowshoeing, walking

// Exercise types that should import as a cardioSessions row (distance/
// duration/heart-rate tracking, shown in Koşu/cardio history) rather than a
// workoutSessions row (an empty shell meant for hand-added exercises/sets —
// see useImportWorkoutSessionFromHealthConnect's own comment on why it has
// no exercise/set data to pull in). Superset of ROUTE_BASED_EXERCISE_TYPES:
// every route-based type is cardio, but swimming (73/74), rowing (53/54) and
// elliptical (25) are cardio too despite never having a GPS route. Found
// 2026-08-28 — a pool swim was landing as a workout session with 0 sets
// because isRouteBased (route-only concern) was being reused for this
// classification.
const CARDIO_EXERCISE_TYPES = new Set([...ROUTE_BASED_EXERCISE_TYPES, 25, 53, 54, 73, 74]); // + elliptical, rowing, rowing machine, open water swim, pool swim

// English label for Health Connect's own ExerciseType numeric codes —
// covers the types realistically producable by a fitness watch. Anything
// else (sports, misc. codes) falls back to a generic label rather than
// growing this list indefinitely.
const EXERCISE_TYPE_LABELS: Record<number, string> = {
  8: 'Cycling',
  9: 'Stationary bike',
  11: 'Boxing',
  13: 'Calisthenics',
  25: 'Elliptical',
  36: 'HIIT',
  37: 'Hiking',
  48: 'Pilates',
  53: 'Rowing',
  54: 'Rowing machine',
  56: 'Running',
  57: 'Treadmill running',
  61: 'Skiing',
  63: 'Snowshoeing',
  68: 'Stair climbing',
  69: 'Stair machine',
  70: 'Strength training',
  73: 'Open water swimming',
  74: 'Pool swimming',
  79: 'Walking',
  81: 'Weightlifting',
  83: 'Yoga',
};

export function watchExerciseTypeLabel(exerciseType: number): string {
  return EXERCISE_TYPE_LABELS[exerciseType] ?? 'Activity';
}

const SWIM_EXERCISE_TYPES = new Set([73, 74]); // open water swim, pool swim
const BIKE_EXERCISE_TYPES = new Set([8, 9]); // biking, biking stationary

// Compos only distinguishes run/swim/bike/motor (see lib/activity-type.ts).
// Motor never comes from Health Connect (no such ExerciseType exists — a
// fitness watch has no way to record a motorcycle ride), so it's never
// returned here; everything not swim/bike (hiking, walking, skiing, rowing,
// elliptical, etc.) buckets into 'run', matching this app's pre-existing
// implicit behavior for those types.
export function activityTypeForExercise(exerciseType: number): ActivityType {
  if (SWIM_EXERCISE_TYPES.has(exerciseType)) return 'swim';
  if (BIKE_EXERCISE_TYPES.has(exerciseType)) return 'bike';
  return 'run';
}

// react-native-health-connect's ExerciseRouteResultType enum isn't
// re-exported from the package's public entry point (its barrel only
// re-exports records/results/aggregate/changes/metadata types, not
// base.types, where this enum lives). The package's own .d.ts types
// ExerciseRoute.type as that numeric enum (DATA = 0, NO_DATA = 1,
// CONSENT_REQUIRED = 2) — but that's a TS-side fiction that doesn't match
// what actually crosses the bridge: the installed native module
// (android/.../ReactExerciseSessionRecord.kt, parseRecord) puts the type as
// a STRING ("DATA"/"NO_DATA"/"CONSENT_REQUIRED"), confirmed by reading that
// file directly. Comparing against the numeric values below always fell
// through to the 'none' branch, so a route never got read even when
// Health Connect genuinely had one (found 2026-08-25 — Kağan reported route
// data never coming through despite permission looking granted). Route
// access is a separate, per-record Android system consent (privacy-
// sensitive — a route can reveal home/work addresses) distinct from the
// regular ExerciseSession read permission: a record can say "I have a
// route" while still requiring a dedicated requestExerciseRoute() call to
// actually reveal the points.
const EXERCISE_ROUTE_DATA = 'DATA';
const EXERCISE_ROUTE_CONSENT_REQUIRED = 'CONSENT_REQUIRED';

export type DetectedWatchSession = {
  id: string;
  startTime: string;
  endTime: string;
  exerciseType: number;
  title: string | null;
  isRouteBased: boolean;
  isCardio: boolean;
  activityType: ActivityType;
  details: Record<string, string>;
  routeAvailability: 'data' | 'none' | 'consent-required';
  routePoints: RoutePoint[]; // only ever populated when routeAvailability === 'data'
};

// Laps and segments live on ExerciseSession itself, not in the generic
// distance/heart-rate records queried later. Preserve the meaningful swim
// metadata when the watch provides it; absent fields remain absent instead
// of inventing a misleading "0 set" or "0 lap" value.
function exerciseDetails(record: {
  laps?: unknown[];
  segments?: { segmentType: number; repetitions: number }[];
}): Record<string, string> {
  const details: Record<string, string> = {};
  if (record.laps?.length) {
    details['Tur sayısı'] = String(record.laps.length);
  }
  const strokeLabels = new Map<number, string>([
    [ExerciseSegmentType.SWIMMING_FREESTYLE, 'Serbest'],
    [ExerciseSegmentType.SWIMMING_BACKSTROKE, 'Sırtüstü'],
    [ExerciseSegmentType.SWIMMING_BREASTSTROKE, 'Kurbağalama'],
    [ExerciseSegmentType.SWIMMING_BUTTERFLY, 'Kelebek'],
    [ExerciseSegmentType.SWIMMING_MIXED, 'Karışık'],
    [ExerciseSegmentType.SWIMMING_OTHER, 'Diğer'],
  ]);
  const strokes = record.segments
    ?.map((segment) => {
      const label = strokeLabels.get(segment.segmentType);
      return label ? `${label}${segment.repetitions > 0 ? ` (${segment.repetitions})` : ''}` : null;
    })
    .filter((value): value is string => value != null);
  if (strokes?.length) {
    details['Yüzme stilleri'] = [...new Set(strokes)].join(', ');
  }
  return details;
}

function mapLocationToRoutePoint(location: { time: string; latitude: number; longitude: number; altitude?: { value: number } }): RoutePoint {
  return {
    lat: location.latitude,
    lng: location.longitude,
    timestamp: new Date(location.time).getTime(),
    altitude: location.altitude?.value ?? null,
  };
}

// Health Connect has no push notifications for new data — the documented
// pattern is to check for changes each time the app comes to the
// foreground, which is exactly when this is called from (see
// useUnhandledWatchSessions). A watch-recorded session (Huawei Health ->
// Health Sync -> Health Connect) can take anywhere from minutes to about an
// hour to actually land here, depending on Health Sync's own background
// sync cycle — this is a delayed "did you do something on your watch
// recently?" check, never a live/instant one.
export async function queryRecentWatchSessions(sinceHours = 72): Promise<DetectedWatchSession[]> {
  try {
    await ensureInitialized();
    const start = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
    const { records } = await readRecords('ExerciseSession', {
      timeRangeFilter: { operator: 'after', startTime: start.toISOString() },
    });
    return records
      .filter((record): record is typeof record & { metadata: { id: string } } => !!record.metadata?.id)
      .map((record) => {
        // Cast past the package's incorrect numeric-enum typing — see the
        // EXERCISE_ROUTE_DATA/EXERCISE_ROUTE_CONSENT_REQUIRED comment above.
        const routeType = record.exerciseRoute?.type as unknown as string | undefined;
        const routeAvailability: DetectedWatchSession['routeAvailability'] =
          routeType === EXERCISE_ROUTE_DATA ? 'data' : routeType === EXERCISE_ROUTE_CONSENT_REQUIRED ? 'consent-required' : 'none';
        return {
          id: record.metadata.id,
          startTime: record.startTime,
          endTime: record.endTime,
          exerciseType: record.exerciseType,
          title: record.title ?? null,
          isRouteBased: ROUTE_BASED_EXERCISE_TYPES.has(record.exerciseType),
          isCardio: CARDIO_EXERCISE_TYPES.has(record.exerciseType),
          activityType: activityTypeForExercise(record.exerciseType),
          details: exerciseDetails(record),
          routeAvailability,
          routePoints: routeAvailability === 'data' ? (record.exerciseRoute?.route ?? []).map(mapLocationToRoutePoint) : [],
        };
      })
      .sort((a, b) => b.startTime.localeCompare(a.startTime));
  } catch (error) {
    console.warn('Health Connect antrenman oturumu sorgusu başarısız:', error);
    return [];
  }
}

// Route points are only ever eagerly populated when routeAvailability is
// already 'data' (see queryRecentWatchSessions). When it's
// 'consent-required', Android shows its own one-time system consent screen
// for that specific record the first time requestExerciseRoute() is called
// — that system prompt should only ever appear in direct response to the
// user tapping "import," never silently from a background query.
export async function resolveWatchSessionRoute(session: DetectedWatchSession): Promise<RoutePoint[]> {
  if (session.routeAvailability === 'data') {
    return session.routePoints;
  }
  if (session.routeAvailability === 'none') {
    return [];
  }
  try {
    await ensureInitialized();
    const locations = await requestExerciseRoute(session.id);
    return locations.map(mapLocationToRoutePoint);
  } catch (error) {
    console.warn('Health Connect rota izni alınamadı:', error);
    return [];
  }
}

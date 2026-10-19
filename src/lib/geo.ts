export type Coordinate = { lat: number; lng: number };
export type RoutePoint = Coordinate & { timestamp: number; altitude?: number | null };

const EARTH_RADIUS_METERS = 6371000;

export function distanceBetween(a: Coordinate, b: Coordinate): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function totalDistance(points: Coordinate[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distanceBetween(points[i - 1], points[i]);
  }
  return total;
}

// Phone GPS altitude jitters by a few meters fix-to-fix even standing still —
// summing raw deltas wildly overstates climb. Only count a change once it
// clears a noise deadzone, and rebase from wherever it settled (not the
// deadzone edge) so small back-and-forth jitter around the same spot doesn't
// slowly accumulate fake gain.
const ELEVATION_NOISE_DEADZONE_METERS = 2;

export function totalElevationGain(points: { altitude?: number | null }[]): number {
  let gain = 0;
  let baseline: number | null = null;
  for (const point of points) {
    if (point.altitude == null) {
      continue;
    }
    if (baseline == null) {
      baseline = point.altitude;
      continue;
    }
    const delta = point.altitude - baseline;
    if (Math.abs(delta) <= ELEVATION_NOISE_DEADZONE_METERS) {
      continue;
    }
    if (delta > 0) {
      gain += delta;
    }
    baseline = point.altitude;
  }
  return gain;
}

// Indoors (or with a cold GPS fix), Android can report fixes accurate to
// only tens of meters — recorded as "movement" even while standing still.
// Drop anything worse than this so the tracked distance stays honest.
export const MAX_ACCEPTABLE_ACCURACY_METERS = 20;
// Accuracy alone isn't enough: a fix can report "18m accurate" and still be
// 15m off from the last one purely from GPS noise. Also require each new
// point to be a plausible amount of real movement away from the last
// *accepted* point before recording it, so a stationary phone doesn't rack
// up fake distance from jitter.
//
// Lowered from 8 to 6 (2026-08-13) — a real under-measurement was reported
// (~500m short over a 5km run) traced to this: totalDistance() sums
// straight-line segments between *accepted* points only, so any curve or
// turn between two accepted points gets "cut across" as a straight line,
// always underestimating true path length. At running speed a 3s fix
// interval easily covers >8m even on a curve, so this barely showed — but
// during walking segments within the same run, less ground is covered per
// fix, more points got rejected, and the corner-cutting error compounded.
// 6m stays comfortably above this device's accuracy ceiling (still filtered
// separately, at 20m) while accepting points closer together during slow
// movement.
export const MIN_MOVEMENT_METERS = 6;

// Starting a location watch/task can hand back a cached fix (e.g. last
// known network location from wherever the phone last had a lock — often
// home) as the very first delivery, before the real GPS chip settles. Such a
// fix can report deceptively good accuracy despite being minutes or hours
// stale in time. Since the first point in a route has no `lastAccepted` to
// sanity-check against, an unfiltered stale fix anchors the whole route at
// the wrong place and every real fix after it looks like one huge jump away
// from it. Reject anything whose capture time is older than this.
const MAX_FIX_AGE_MS = 15000;

// Shared by the background-location task and the live screen's foreground
// watcher — both append to the same route, so both must agree on what
// counts as an acceptable point.
export function selectAcceptedPoints(
  existingRoute: RoutePoint[],
  rawFixes: (RoutePoint & { accuracy: number | null })[]
): RoutePoint[] {
  let lastAccepted = existingRoute[existingRoute.length - 1] ?? null;
  const newPoints: RoutePoint[] = [];
  for (const { accuracy, ...point } of rawFixes) {
    if (accuracy != null && accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) {
      continue;
    }
    if (Date.now() - point.timestamp > MAX_FIX_AGE_MS) {
      continue;
    }
    if (lastAccepted && distanceBetween(lastAccepted, point) < MIN_MOVEMENT_METERS) {
      continue;
    }
    newPoints.push(point);
    lastAccepted = point;
  }
  return newPoints;
}

export function formatPace(distanceMeters: number, durationSeconds: number): string {
  // Below ~20m, pace math (seconds per km) blows up to nonsense values — GPS
  // noise before the first real movement is registered.
  if (distanceMeters < 20) {
    return '–';
  }
  const secondsPerKm = durationSeconds / (distanceMeters / 1000);
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')} /km`;
}

// Bike/motor sessions show average speed (km/h) rather than pace (min/km) —
// the conventional unit for those, and pace math is nonsensical at
// motorcycle speeds anyway (formatPace's "below 20m" guard doesn't help
// here, the numbers are just too small to read as minutes:seconds).
export function formatSpeed(distanceMeters: number, durationSeconds: number): string {
  if (distanceMeters < 20 || durationSeconds <= 0) {
    return '–';
  }
  const kmh = distanceMeters / 1000 / (durationSeconds / 3600);
  return `${kmh.toFixed(1)} km/sa`;
}

export function formatSwimPace(distanceMeters: number, durationSeconds: number): string {
  if (distanceMeters < 1 || durationSeconds <= 0) return '–';
  const secondsPer100m = (durationSeconds / distanceMeters) * 100;
  const minutes = Math.floor(secondsPer100m / 60);
  const seconds = Math.round(secondsPer100m % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')} /100m`;
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

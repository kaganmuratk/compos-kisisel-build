export type MovementType = 'run' | 'walk' | 'stopped';

export type MovementSegment = {
  type: MovementType;
  durationSeconds: number;
};

export type MovementBreakdown = {
  runSeconds: number;
  walkSeconds: number;
  stoppedSeconds: number;
  segments: MovementSegment[];
};

// Recreational-runner defaults: a comfortable brisk walk tops out well
// under 7 km/h (≈8:34/km), jogging starts above it — and true standing
// still (traffic light, tying a shoe) reads near 0 rather than a slow
// walk's 3-5 km/h. These are round, easy-to-reason-about cutoffs, not
// derived from any of Kağan's own pace data.
const STOPPED_MAX_KMH = 1.5;
const WALK_MAX_KMH = 7.2;

// Raw watch/GPS speed samples jitter sample-to-sample (a single noisy 0
// km/h reading mid-stride, or a brief spike) — classifying each raw sample
// on its own would chop a real 20-minute run into dozens of flickering
// micro-segments. Smoothing first, then merging anything that still comes
// out too short, is what "tutarlı veri" (per Kağan's own ask) means here:
// only a change that persists gets counted as an actual pace change.
const SMOOTHING_HALF_WINDOW_MS = 10_000;
const MIN_SEGMENT_SECONDS = 20;

function classify(speedKmh: number): MovementType {
  if (speedKmh < STOPPED_MAX_KMH) return 'stopped';
  if (speedKmh < WALK_MAX_KMH) return 'walk';
  return 'run';
}

type RawSample = { time: string; value: number };

// Turns raw (timestamped, irregularly-spaced) speed samples into a
// run/walk/stopped time breakdown for the [windowStart, windowEnd] the
// samples were queried over. Pure function — no I/O — so it can be reused
// for both a single run's summary and a batch trend over many past
// sessions without re-touching Health Connect for each one.
export function computeMovementBreakdown(samples: RawSample[], windowStart: string, windowEnd: string): MovementBreakdown {
  const startMs = new Date(windowStart).getTime();
  const endMs = new Date(windowEnd).getTime();
  const points = samples
    .map((s) => ({ ms: new Date(s.time).getTime(), value: s.value }))
    .filter((p) => Number.isFinite(p.ms) && Number.isFinite(p.value))
    .sort((a, b) => a.ms - b.ms);

  if (points.length === 0 || endMs <= startMs) {
    return { runSeconds: 0, walkSeconds: 0, stoppedSeconds: 0, segments: [] };
  }

  const smoothed = points.map((point, i) => {
    let sum = 0;
    let count = 0;
    // Points are sorted, so the in-window neighborhood is contiguous —
    // walk outward from i instead of re-filtering the whole array per point.
    for (let j = i; j >= 0 && point.ms - points[j].ms <= SMOOTHING_HALF_WINDOW_MS; j -= 1) {
      sum += points[j].value;
      count += 1;
    }
    for (let j = i + 1; j < points.length && points[j].ms - point.ms <= SMOOTHING_HALF_WINDOW_MS; j += 1) {
      sum += points[j].value;
      count += 1;
    }
    return { ms: point.ms, type: classify(sum / count) };
  });

  // Attribute the time before the first sample and after the last one to
  // that nearest sample's type, so the segments always cover the full
  // window (same total as durationSeconds elsewhere) instead of leaving
  // GPS-cold-start gaps uncounted.
  const boundaries: { ms: number; type: MovementType }[] = [
    { ms: startMs, type: smoothed[0].type },
    ...smoothed,
    { ms: endMs, type: smoothed[smoothed.length - 1].type },
  ];

  let raw: MovementSegment[] = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const durationSeconds = (boundaries[i + 1].ms - boundaries[i].ms) / 1000;
    if (durationSeconds <= 0) continue;
    const last = raw[raw.length - 1];
    if (last && last.type === boundaries[i].type) {
      last.durationSeconds += durationSeconds;
    } else {
      raw.push({ type: boundaries[i].type, durationSeconds });
    }
  }

  // Fold any segment shorter than MIN_SEGMENT_SECONDS into its neighbor
  // (prefer the longer one) and re-merge, until nothing short is left —
  // a single blip can otherwise survive as its own tiny segment right next
  // to two different-typed neighbors.
  let changed = true;
  while (changed && raw.length > 1) {
    changed = false;
    for (let i = 0; i < raw.length; i += 1) {
      if (raw[i].durationSeconds >= MIN_SEGMENT_SECONDS) continue;
      const prev = raw[i - 1];
      const next = raw[i + 1];
      const target = !prev ? next : !next ? prev : prev.durationSeconds >= next.durationSeconds ? prev : next;
      target.durationSeconds += raw[i].durationSeconds;
      raw.splice(i, 1);
      changed = true;
      break;
    }
    // Re-merge adjacent same-type segments the fold above may have created.
    const merged: MovementSegment[] = [];
    for (const segment of raw) {
      const last = merged[merged.length - 1];
      if (last && last.type === segment.type) {
        last.durationSeconds += segment.durationSeconds;
      } else {
        merged.push({ ...segment });
      }
    }
    raw = merged;
  }

  const totals = raw.reduce(
    (acc, segment) => {
      acc[segment.type] += segment.durationSeconds;
      return acc;
    },
    { run: 0, walk: 0, stopped: 0 } as Record<MovementType, number>
  );

  return {
    runSeconds: Math.round(totals.run),
    walkSeconds: Math.round(totals.walk),
    stoppedSeconds: Math.round(totals.stopped),
    segments: raw.map((s) => ({ type: s.type, durationSeconds: Math.round(s.durationSeconds) })),
  };
}

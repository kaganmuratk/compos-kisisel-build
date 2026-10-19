// Estimated 1-rep-max (e1RM) via the Epley formula, the balanced/default
// choice used by most RPE-based calculators and lifting apps — most accurate
// in the ~3-10 rep range. RIR is folded in as "effective reps" (reps you'd
// have done to failure), so a set closer to failure counts for more than the
// same weight/reps done with reps left in the tank.
export function effectiveReps(reps: number, rir: number): number {
  return reps + rir;
}

export function estimatedOneRepMax(weightKg: number, reps: number, rir: number): number {
  return weightKg * (1 + effectiveReps(reps, rir) / 30);
}

// Bodyweight exercises (pull-ups, dips) need a total-load figure to feed into
// e1RM: bodyweight (from the closest check-in) + whatever added weight was
// entered. Prefers the most recent check-in on/before the session date so a
// weight logged mid-program doesn't retroactively rewrite older sessions;
// falls back to the closest available check-in (before or after) otherwise.
export function nearestBodyweightKg(
  checkins: { date: string; weightKg: number | null }[],
  targetDate: string
): number | null {
  const withWeight = checkins.filter((c): c is { date: string; weightKg: number } => c.weightKg != null);
  if (withWeight.length === 0) {
    return null;
  }
  const sorted = [...withWeight].sort((a, b) => a.date.localeCompare(b.date));
  let best: (typeof sorted)[number] | null = null;
  for (const c of sorted) {
    if (c.date <= targetDate) {
      best = c;
    } else {
      break;
    }
  }
  return (best ?? sorted[0]).weightKg;
}

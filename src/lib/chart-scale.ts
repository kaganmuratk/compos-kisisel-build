export type ChartMetricKind = 'weight' | 'oneRepMax' | 'sleep' | 'stress' | 'water' | 'heartRate' | 'speed' | 'calories';

export type ChartScale = {
  maxValue: number;
  noOfSections: number;
  stepValue: number;
  roundToDigits: number;
  showFractionalValues: boolean;
};

// Guards near-empty/all-zero data (e.g. a day with 0ml water) from producing
// a degenerate near-zero axis.
const MIN_MAX_FLOOR: Record<ChartMetricKind, number> = {
  weight: 10,
  oneRepMax: 10,
  sleep: 2,
  stress: 2,
  water: 500,
  heartRate: 60,
  speed: 5,
  calories: 500,
};

// Sleep/stress/water gridlines should always land on whole numbers even
// though the underlying data can be fractional (e.g. 7.5h sleep) — weight
// and 1RM are fine showing a decimal step.
const ALLOW_DECIMAL_STEP: Record<ChartMetricKind, boolean> = {
  weight: true,
  oneRepMax: true,
  sleep: false,
  stress: false,
  water: false,
  heartRate: false,
  speed: true,
  calories: false,
};

// Classic Heckbert "nice numbers" rounding: snaps to the nearest 1/2/5×10ⁿ
// so an axis step never comes out as an ugly fraction like 25.33.
function niceNumber(value: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  let niceFraction: number;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * 10 ** exponent;
}

// Computes clean, round-number Y-axis props for react-native-gifted-charts'
// LineChart. Without maxValue/stepValue, the library auto-derives an axis
// max from raw data and divides it by noOfSections — a step that almost
// never lands on a round number (e.g. 76/3 = 25.33).
export function computeChartScale(values: number[], kind: ChartMetricKind, targetSections = 4): ChartScale {
  const finiteValues = values.filter((v) => Number.isFinite(v));
  const dataMax = finiteValues.length > 0 ? Math.max(0, ...finiteValues) : 0;
  const effectiveMax = Math.max(dataMax, MIN_MAX_FLOOR[kind]);

  let step = niceNumber(effectiveMax / targetSections, true);
  if (!ALLOW_DECIMAL_STEP[kind] && step < 1) {
    step = 1;
  }

  const noOfSections = Math.max(1, Math.ceil(effectiveMax / step));
  const maxValue = step * noOfSections;
  const isWholeStep = Number.isInteger(step);

  return {
    maxValue,
    noOfSections,
    stepValue: step,
    roundToDigits: isWholeStep ? 0 : 1,
    showFractionalValues: !isWholeStep,
  };
}

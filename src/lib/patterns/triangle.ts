import type { Candle, Timeframe } from "../exchange/types";
import { atr } from "./atr";
import { cleanDeclines, pivotIndices, selectDeclines } from "./declines";
import { mirrorSeries } from "./mirror";
import { findPivots } from "./pivots";
import { findPole, type Pole } from "./pole";
import { score, type ScoreBreakdown } from "./score";
import { apexBarIndex, fitLine, valueAt, type LineSpec } from "./trendline";
import type { PatternConfig } from "./config";

export type TriangleStatus = "forming" | "h3_formed" | "complete" | "breakout";
export type Direction = "ascending" | "descending";
export type Subtype = "classic" | "symmetrical";

export interface PatternPivot {
  index: number;
  time: number;
  price: number;
}

export interface TrianglePattern {
  symbol: string;
  timeframe: Timeframe;
  direction: Direction;
  subtype: Subtype;
  status: TriangleStatus;
  score: number;
  breakdown: ScoreBreakdown;
  highQuality: boolean;
  pivots: {
    pole?: PatternPivot;
    h1: PatternPivot;
    l1: PatternPivot;
    h2: PatternPivot;
    l2: PatternPivot;
    h3?: PatternPivot;
    l3?: PatternPivot;
  };
  resistance: LineSpec;
  support: LineSpec;
  apexBarIndex?: number;
  breakoutLevel: number;
  timings: {
    t1?: number;
    t2: number;
    t3: number;
    t4: number;
    t5?: number;
    t6?: number;
  };
  detectedAtBarTime: number;
}

/** A candidate in the coordinate space it was found in — possibly mirrored. */
interface Candidate {
  indices: number[];
  pole?: Pole;
  breakdown: ScoreBreakdown;
  subtype: Subtype;
  status: TriangleStatus;
  resistance: LineSpec;
  support: LineSpec;
  apex?: number;
  timings: TrianglePattern["timings"];
  /** offset of the window inside the full series */
  offset: number;
}

export interface DetectOptions {
  symbol: string;
  timeframe: Timeframe;
  config: PatternConfig;
}

/**
 * §6.3 + §6.10. Runs the ascending detector on the series and on its mirror,
 * lets the pole decide which reading wins, and returns the best pattern per
 * direction.
 *
 * The input must be closed candles only — drop the forming bar before calling.
 */
export const detectTriangles = (
  candles: readonly Candle[],
  options: DetectOptions,
): TrianglePattern[] => {
  const { config } = options;
  if (candles.length < config.minCandles) return [];

  const ascending = bestCandidate(candles, config);
  const descending = bestCandidate(mirrorSeries(candles), config);

  // §6.3: direction is decided by which reading has a qualifying pole, not by
  // comparing trendline slopes. A triangle preceded by a long clean decline is
  // descending whatever its two lines happen to be doing — Boeing reads
  // `symmetrical` on slopes alone and is descending on its pole.
  const readings: ReadonlyArray<readonly [Candidate | undefined, Direction]> = [
    [ascending, "ascending"],
    [descending, "descending"],
  ];

  // Exactly one reading having a pole settles the direction outright. If
  // neither does the pattern is reversal-type, and if both do the pole tells
  // us nothing; either way, report both readings and let the score rank them.
  const withPole = readings.filter(([c]) => c?.pole !== undefined);
  const chosen = withPole.length === 1 ? withPole : readings;

  return chosen
    .flatMap(([c, dir]) =>
      c === undefined ? [] : [build(c, candles, dir, options)],
    )
    .sort((a, b) => b.score - a.score);
};

/**
 * §6.2b: the selection depends on the window, but tolerance is wide, so a
 * coarse sweep of window lengths is enough — there is no need to search bar by
 * bar. The best-scoring candidate across the sweep wins.
 */
const bestCandidate = (
  series: readonly Candle[],
  config: PatternConfig,
): Candidate | undefined => {
  let best: Candidate | undefined;
  const widths = new Set(
    config.windowSweep.filter((w) => w <= series.length).concat(series.length),
  );

  for (const width of widths) {
    const offset = series.length - width;
    const window = series.slice(offset);
    for (const legs of [3, 2] as const) {
      const c = candidateFor(window, offset, legs, config);
      if (
        c !== undefined &&
        (best === undefined || c.breakdown.total > best.breakdown.total)
      ) {
        best = c;
      }
    }
    // A three-leg pattern found in this window makes the two-leg reading of
    // the same window redundant.
  }
  return best;
};

const candidateFor = (
  window: readonly Candle[],
  offset: number,
  legs: 2 | 3,
  config: PatternConfig,
): Candidate | undefined => {
  const pivots = findPivots(window, config);
  const selected = selectDeclines(cleanDeclines(window, pivots), legs);
  if (selected.length < legs) return undefined;

  const idx = pivotIndices(selected);
  const price = (i: number, kind: "high" | "low") =>
    kind === "high" ? window[i].high : window[i].low;

  const h = idx.filter((_, n) => n % 2 === 0).map((i) => price(i, "high"));
  const l = idx.filter((_, n) => n % 2 === 1).map((i) => price(i, "low"));
  const atrs = atr(window);

  // --- Rule 5: meaningful size ---------------------------------------
  const height = h[0] - l[0];
  if (height < config.minHeightAtr * atrs[idx[0]]) return undefined;

  // --- Rule 2: highs step down, but only slightly --------------------
  // Additive, in units of the leg's own range. Written multiplicatively it
  // inverts under the mirror, where prices are negative.
  const highSteps: number[] = [];
  for (let n = 0; n + 1 < h.length; n++) {
    const range = h[n] - l[n];
    if (range <= 0) return undefined;
    const upper = h[n] + config.overshoot * range;
    const lower = h[n] - config.fibHighMax * range;
    if (h[n + 1] > upper || h[n + 1] < lower) return undefined;
    highSteps.push((h[n] - h[n + 1]) / range);
  }

  // --- Rule 3: lows retrace the up-leg -------------------------------
  // A scoring input with hard bounds, not a Fibonacci gate.
  const fLows: number[] = [];
  for (let n = 1; n < l.length; n++) {
    const leg = h[n] - l[n - 1];
    if (leg <= 0) return undefined;
    const f = (l[n] - l[n - 1]) / leg;
    if (f <= config.fibLowFloor || f >= config.fibLowCeil) return undefined;
    fLows.push(f);
  }

  // --- Rule 4: convergence -------------------------------------------
  const highPoints = idx
    .filter((_, n) => n % 2 === 0)
    .map((i) => ({ index: i, price: price(i, "high") }));
  const lowPoints = idx
    .filter((_, n) => n % 2 === 1)
    .map((i) => ({ index: i, price: price(i, "low") }));
  const resistance = fitLine(highPoints, "above");
  const support = fitLine(lowPoints, "below");

  const atrHere = atrs[idx[idx.length - 1]];
  if (resistance.slope > config.maxResistanceSlopeAtr * atrHere)
    return undefined;
  if (support.slope <= 0) return undefined;

  // --- Rule 7: not already broken ------------------------------------
  const lastPivot = idx[idx.length - 1];
  for (let i = lastPivot + 1; i < window.length; i++) {
    const line = valueAt(support, i);
    if (window[i].low < line - Math.abs(line) * config.breakdownTol)
      return undefined;
  }

  const pole = findPole(window, idx[0], l[0], config);

  // --- §6.5 timing ----------------------------------------------------
  const t = (a: number, b: number) => idx[b] - idx[a];
  const timings: TrianglePattern["timings"] = {
    t1: pole === undefined ? undefined : idx[0] - pole.index,
    t2: t(0, 1),
    t3: t(1, 2),
    t4: t(2, 3),
    t5: legs === 3 ? t(3, 4) : undefined,
    t6: legs === 3 ? t(4, 5) : undefined,
  };
  const rules: Array<[number | undefined, number | undefined]> = [
    [timings.t1, timings.t2],
    [timings.t3, timings.t4],
    [timings.t5, timings.t6],
  ];
  const applicable = rules.filter(
    ([a, b]) => a !== undefined && b !== undefined,
  );
  const passed = applicable.filter(([a, b]) => (a ?? 0) < (b ?? 0)).length;

  // --- shape tag, never a direction ----------------------------------
  const subtype: Subtype =
    Math.abs(resistance.slope) > config.symmetricalSlopeRatio * support.slope
      ? "symmetrical"
      : "classic";

  const apex = apexBarIndex(resistance, support);
  const breakdown = score(
    {
      highSteps,
      fLows,
      timingPassed: passed,
      timingApplicable: applicable.length,
      poleRatio: pole?.ratio,
      fitErrorAtr:
        (resistance.fitError + support.fitError) / 2 / (atrHere || 1),
      apexProgress:
        apex === undefined || apex <= idx[0]
          ? undefined
          : (window.length - 1 - idx[0]) / (apex - idx[0]),
      hasH3: legs === 3,
      hasL3: legs === 3,
    },
    config,
  );

  const last = window.length - 1;
  const status: TriangleStatus =
    window[last].close > valueAt(resistance, last)
      ? "breakout"
      : legs === 3
        ? "complete"
        : "forming";

  return {
    indices: idx.map((i) => i + offset),
    pole:
      pole === undefined ? undefined : { ...pole, index: pole.index + offset },
    breakdown,
    subtype,
    status,
    resistance: shiftLine(resistance, offset),
    support: shiftLine(support, offset),
    apex: apex === undefined ? undefined : apex + offset,
    timings,
    offset,
  };
};

/** Re-express a line fitted in window coordinates in full-series coordinates. */
const shiftLine = (line: LineSpec, offset: number): LineSpec => ({
  slope: line.slope,
  intercept: line.intercept - line.slope * offset,
  anchorBarIndex: line.anchorBarIndex + offset,
});

/**
 * Un-mirror where needed and label the pivots. §6.9: for descending patterns
 * the keys stay semantically correct — `l1` is the first pivot
 * chronologically, then `h1`, `l2`, `h2`, `l3`, `h3` — matching the brief's
 * Boeing example.
 */
const build = (
  c: Candidate,
  candles: readonly Candle[],
  direction: Direction,
  options: DetectOptions,
): TrianglePattern => {
  const flip = direction === "descending";
  const at = (i: number, kind: "high" | "low"): PatternPivot => ({
    index: i,
    time: candles[i].time,
    price: kind === "high" ? candles[i].high : candles[i].low,
  });

  // In the mirrored reading a "high" is an original low, so the labels shift
  // by one: the six pivots run L1, H1, L2, H2, L3, H3 rather than H1, L1, ...
  // That is what keeps the keys semantically correct after un-mirroring, and
  // it matches the brief's Boeing example.
  const kinds: ReadonlyArray<"high" | "low"> = flip
    ? ["low", "high", "low", "high", "low", "high"]
    : ["high", "low", "high", "low", "high", "low"];
  const p = c.indices.map((barIndex, n) => at(barIndex, kinds[n]));

  // The first four always exist: a candidate is built from at least two legs.
  const [h1, l1, h2, l2] = flip
    ? [p[1], p[0], p[3], p[2]]
    : [p[0], p[1], p[2], p[3]];
  const [h3, l3] = flip ? [p[5], p[4]] : [p[4], p[5]];

  const unflip = (line: LineSpec): LineSpec =>
    flip ? { ...line, slope: -line.slope, intercept: -line.intercept } : line;

  // Mirrored resistance (through the mirrored highs) is the real support.
  const resistance = flip ? unflip(c.support) : c.resistance;
  const support = flip ? unflip(c.resistance) : c.support;

  const last = candles.length - 1;
  const allTimingsPass = c.breakdown.timing === 15 && c.status !== "forming";

  return {
    symbol: options.symbol,
    timeframe: options.timeframe,
    direction,
    subtype: c.subtype,
    status: c.status,
    score: c.breakdown.total,
    breakdown: c.breakdown,
    highQuality:
      c.breakdown.total >= options.config.highQualityScore && allTimingsPass,
    pivots: {
      pole:
        c.pole === undefined
          ? undefined
          : {
              index: c.pole.index,
              time: candles[c.pole.index].time,
              price: flip
                ? candles[c.pole.index].high
                : candles[c.pole.index].low,
            },
      h1,
      l1,
      h2,
      l2,
      h3,
      l3,
    },
    resistance,
    support,
    apexBarIndex: c.apex,
    breakoutLevel: valueAt(resistance, last),
    timings: c.timings,
    detectedAtBarTime: candles[last].time,
  };
};

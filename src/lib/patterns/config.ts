import type { Timeframe } from "../exchange/types";

/**
 * Every tunable threshold in the pattern engine, in one object.
 *
 * When you change a value here, say why in `docs/decisions.md` in the same
 * commit. If a fixture starts passing because a threshold was loosened, say
 * that explicitly in the PR — see CLAUDE.md.
 */
export interface PatternConfig {
  // ---- §6.2 pivots ----------------------------------------------------
  /** A swing high is the max of `high[i-k .. i+k]`. Also the number of bars
   * that can never contain a confirmed pivot, which is what stops repainting. */
  pivotStrength: number;
  /** Minimum prominence of a pivot, in ATR(14) at that bar. */
  minPivotAtr: number;

  // ---- §6.3 hard constraints -----------------------------------------
  /** Rule 2. H(n+1) must sit in the top 31.6% of the H(n)->L(n) range. */
  fibHighMax: number;
  /** Rule 2. Marginal higher highs happen constantly and should not
   * disqualify a clean pattern. Applied **additively**, in units of the leg's
   * own range: a multiplicative tolerance inverts under the §6.1 mirror,
   * where prices are negative. */
  overshoot: number;
  /** Rule 3. Hard bounds on `f_low`; the 0.236-0.786 band is the *ideal* and
   * lives in scoring only. Three of the four fixture values sit below 0.236. */
  fibLowFloor: number;
  fibLowCeil: number;
  /** Rule 4. Resistance may drift very slightly up, for symmetrical shapes. */
  maxResistanceSlopeAtr: number;
  /** Rule 5. `h1 - l1` in ATR(14) at H1. Filters out chop. */
  minHeightAtr: number;
  /** Rule 7. How far below support a closed low may sit before the pattern
   * counts as broken rather than forming. */
  breakdownTol: number;

  // ---- §6.4 the pole --------------------------------------------------
  maxPoleBars: number;
  /** Without a minimum, Boeing finds a 4-bar pole off the COVID low, scores
   * 1.43 against the real 55-bar pole's 1.41, and gets labelled ascending. */
  minPoleBars: number;
  /** `(h1 - low(P)) / (h1 - l1)` must reach this for the pole to qualify. */
  minPoleRatio: number;
  /** Worst drawdown from the pole's **running** high, as a fraction of pole
   * height. Measured against the pole's end instead, this rejects every pole
   * that has ever existed. */
  maxPoleDrawdown: number;

  // ---- windowing ------------------------------------------------------
  /** Below this a series is not screenable at this timeframe. */
  minCandles: number;
  /** §6.2b: the selection depends on the window, but tolerance is wide — both
   * fixtures survive hundreds of bars of padding — so a coarse sweep suffices.
   * There is no need to search bar by bar. */
  windowSweep: readonly number[];

  // ---- §6.3 shape tag -------------------------------------------------
  /** Tag `symmetrical` when |resistance slope| exceeds this share of the
   * support slope. A shape tag only: it never overrides direction. */
  symmetricalSlopeRatio: number;
  /** `fibHighMax` is relaxed to this for symmetrical shapes. */
  fibHighMaxSymmetrical: number;

  // ---- §6.8 scoring shape ---------------------------------------------
  /** How hard the low-pivot score falls off *below* the 0.5 ideal. At 0.55 a
   * near-flat support (`f_low` 0.05) still takes about half the 25 points,
   * which it must: real triangles sit far below the brief's ideal band. */
  lowSideFalloff: number;
  /** Pole ratio that earns the full 15. */
  poleRatioForFullMarks: number;
  /** Line fit error, in ATR, at which the cleanliness term reaches zero. */
  fitErrorForZero: number;
  /** `score >= this` and all applicable timing rules passing earns the badge. */
  highQualityScore: number;
}

export const DEFAULT_CONFIG: PatternConfig = {
  pivotStrength: 3,
  minPivotAtr: 1.5,

  fibHighMax: 0.316,
  overshoot: 0.005,
  fibLowFloor: 0.0,
  fibLowCeil: 0.95,
  maxResistanceSlopeAtr: 0.05,
  minHeightAtr: 4,
  breakdownTol: 0.005,

  maxPoleBars: 60,
  minPoleBars: 10,
  minPoleRatio: 1.0,
  maxPoleDrawdown: 0.4,

  minCandles: 120,
  windowSweep: [150, 250, 400, 600, 900],

  symmetricalSlopeRatio: 0.5,
  fibHighMaxSymmetrical: 0.5,

  lowSideFalloff: 0.55,
  poleRatioForFullMarks: 2.0,
  fitErrorForZero: 1.5,
  highQualityScore: 75,
};

/** §6.2: low timeframes are noisier and need a stronger filter. */
const OVERRIDES: Partial<Record<Timeframe, Partial<PatternConfig>>> = {
  "5m": { pivotStrength: 5, minPivotAtr: 2.0 },
  "15m": { pivotStrength: 4, minPivotAtr: 1.8 },
  "30m": { pivotStrength: 4 },
};

export const configFor = (
  tf: Timeframe,
  overrides: Partial<PatternConfig> = {},
): PatternConfig => ({ ...DEFAULT_CONFIG, ...OVERRIDES[tf], ...overrides });

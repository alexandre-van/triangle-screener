import type { PatternConfig } from "./config";

export interface ScoreInputs {
  /** Rule 2 ratios: `(h(n) - h(n+1)) / (h(n) - l(n))`, one per high step. */
  highSteps: readonly number[];
  /** Rule 3 ratios. */
  fLows: readonly number[];
  /** Satisfied / applicable timing rules (§6.5). */
  timingPassed: number;
  timingApplicable: number;
  /** Pole ratio, or undefined when no pole qualified. */
  poleRatio?: number;
  /** RMS residual of the line fits, normalised by ATR. */
  fitErrorAtr: number;
  /** Where the last bar sits between H1 and the apex, 0-1. */
  apexProgress?: number;
  hasH3: boolean;
  hasL3: boolean;
}

export interface ScoreBreakdown {
  highFib: number;
  lowFib: number;
  timing: number;
  pole: number;
  geometry: number;
  completeness: number;
  total: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * §6.8. 0-100 across six components.
 *
 * The hard constraints in §6.3 have already rejected anything malformed, so
 * this is grading admitted patterns against the ideal, not re-testing them.
 * That is why the falloffs are quadratic rather than linear: a value inside
 * the band but off-centre is still a real triangle.
 */
export const score = (
  i: ScoreInputs,
  config: PatternConfig,
): ScoreBreakdown => {
  // --- High-pivot Fibonacci fit, 25 -----------------------------------
  // §6.8 says "distance from the ideal (centre of the allowed band)". That
  // reading is wrong: a **flat** resistance is the defining feature of an
  // ascending triangle, so the ideal step is 0 and the band is a tolerance,
  // not a distribution to centre on. Centring scores a perfectly flat
  // resistance 1.5 out of 25 and makes §11's "perfect triangle scores >= 95"
  // arithmetically unreachable. See docs/decisions.md.
  const highFib =
    25 *
    mean(
      i.highSteps.map((r) => 1 - clamp01(Math.abs(r) / config.fibHighMax) ** 2),
    );

  // --- Low-pivot Fibonacci fit, 25 ------------------------------------
  // Asymmetric by design. Drift toward the high edge is penalised steeply;
  // drift toward the low edge gently, because a near-flat rising support is
  // extremely common — the two fixtures measure 0.031, 0.407, 0.067, 0.095,
  // and three of those sit below the 0.236 the brief calls ideal.
  const lowFib =
    25 *
    mean(
      i.fLows.map((f) => {
        if (f >= 0.5) {
          return 1 - clamp01((f - 0.5) / (config.fibLowCeil - 0.5));
        }
        return 1 - clamp01(config.lowSideFalloff * ((0.5 - f) / 0.5));
      }),
    );

  // --- Timing, 15 ------------------------------------------------------
  // Rules involving pivots that do not exist yet are scored pro-rata over the
  // rules that do apply, rather than counted as failures.
  const timing =
    i.timingApplicable === 0 ? 15 : 15 * (i.timingPassed / i.timingApplicable);

  // --- Pole, 15 --------------------------------------------------------
  // §6.4 makes the pole optional — triangles are legitimately reversal
  // patterns — so its absence is scored neutrally rather than as a failure.
  // The neutral value is not a free parameter: it is what a pole sitting
  // exactly on `minPoleRatio` earns, which makes the component continuous
  // across the qualify/does-not-qualify boundary. Score it 0 instead and a
  // pattern is better off with a barely-qualifying pole than with none,
  // which is backwards.
  const neutralPole =
    15 * clamp01(config.minPoleRatio / config.poleRatioForFullMarks);
  const pole =
    i.poleRatio === undefined
      ? neutralPole
      : 15 * clamp01(i.poleRatio / config.poleRatioForFullMarks);

  // --- Geometry, 10 ----------------------------------------------------
  // Clean touches, and a pattern that has travelled a useful way toward its
  // apex without running past it.
  const cleanliness = 1 - clamp01(i.fitErrorAtr / config.fitErrorForZero);
  const apex =
    i.apexProgress === undefined
      ? 0.5
      : 1 - clamp01(Math.abs(i.apexProgress - 0.675) / 0.5);
  const geometry = 10 * (0.6 * cleanliness + 0.4 * apex);

  // --- Completeness, 10 ------------------------------------------------
  const completeness = (i.hasH3 ? 5 : 0) + (i.hasL3 ? 5 : 0);

  const total = highFib + lowFib + timing + pole + geometry + completeness;
  return {
    highFib,
    lowFib,
    timing,
    pole,
    geometry,
    completeness,
    total: Math.round(total * 10) / 10,
  };
};

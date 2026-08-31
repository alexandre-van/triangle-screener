import type { PatternConfig } from "./config";

/**
 * §6.3's hard constraints, as pure predicates.
 *
 * They live apart from the detector so their boundaries can be tested
 * directly, the table-driven way §11 asks for. Testing them through a
 * synthetic series instead couples every assertion to geometry that has to be
 * hand-tuned — and some admissible ratios cannot be built at all: an `f_low`
 * near the ceiling makes support so steep it meets resistance almost
 * immediately, so a triangle with that ratio has no room for an H3.
 */

/** Rule 2: how far H(n+1) steps down, in units of the H(n)->L(n) range. */
export const highStep = (h: number, l: number, hNext: number): number =>
  (h - hNext) / (h - l);

/**
 * Rule 2's band. The overshoot is **additive**: the §6.1 mirror negates
 * prices, and multiplying a negative price by `1 + OVERSHOOT` moves it
 * *down*, opening the band in the wrong direction for every descending
 * pattern.
 */
export const highStepOk = (step: number, config: PatternConfig): boolean =>
  step >= -config.overshoot && step <= config.fibHighMax;

/**
 * Rule 3: how far L(n) pulled back into the L(n-1) -> H(n) leg it just
 * closed. 0 means it fell all the way back to the prior low; 1 means no
 * pullback at all.
 */
export const fLow = (lPrev: number, h: number, l: number): number =>
  (l - lPrev) / (h - lPrev);

/**
 * A scoring input with hard bounds, not a Fibonacci gate. The low must
 * genuinely be above the previous one, so support is rising, and must not sit
 * so close to the high that no pullback happened. The 0.236-0.786 band is the
 * ideal and lives in scoring only — three of the four fixture values are below
 * its floor.
 */
export const fLowOk = (f: number, config: PatternConfig): boolean =>
  f > config.fibLowFloor && f < config.fibLowCeil;

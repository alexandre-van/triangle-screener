import type { Candle } from "../exchange/types";
import type { Pivot } from "./pivots";

export interface Decline {
  /** index of the high that opens it */
  from: number;
  /** index of the low that closes it */
  to: number;
  /** size in log price */
  size: number;
}

/**
 * §6.2b. A triangle spanning years contains dozens of swings, so the detector
 * chooses six pivots rather than walking six consecutive ones.
 *
 * The unit of selection is the **move**, not the pivot, and each move is spent
 * once. An ascending triangle is three declines — H1→L1, H2→L2, H3→L3 — which
 * never overlap in time. So: take the three largest non-overlapping declines;
 * their six endpoints are the six pivots.
 *
 * Two properties fall out for free. Alternation is automatic: three disjoint
 * H→L moves sorted by time are H,L,H,L,H,L by construction. And descending
 * needs no new code — clean declines on the mirrored series are clean rallies.
 */

/**
 * A *clean decline* runs a→b where `high[a]` is the maximum over [a, b] and
 * `low[b]` is the minimum over [a, b].
 */
export const cleanDeclines = (
  candles: readonly Candle[],
  pivots: readonly Pivot[],
): Decline[] => {
  const lows = new Set(
    pivots.filter((p) => p.kind === "low").map((p) => p.index),
  );
  const highs = pivots.filter((p) => p.kind === "high").map((p) => p.index);

  const out: Decline[] = [];
  for (const a of highs) {
    const top = candles[a].high;
    let runMin = candles[a].low;

    for (let b = a + 1; b < candles.length; b++) {
      // Once a later bar trades above it, `high[a]` is no longer the maximum
      // over the range and no decline starting at `a` can extend past here.
      if (candles[b].high > top) break;

      if (candles[b].low < runMin) runMin = candles[b].low;
      // `low[b]` is the minimum over [a, b] exactly when it is the running low.
      if (lows.has(b) && candles[b].low <= runMin) {
        out.push({ from: a, to: b, size: logSize(top, candles[b].low) });
      }
    }
  }
  return out;
};

/**
 * Log price, not absolute. Over a long history a stock multiplies, and in
 * absolute terms every recent wiggle then outranks every early swing — ranked
 * in euros the six Hermès pivots come 219th to 320th, because the stock went
 * from €40 to €2500. In logs they come first.
 *
 * The magnitudes are taken before the log because §6.1 detects descending
 * patterns by **negating** prices, and `log` of a negative number is NaN. This
 * is the same hazard as rule 2's overshoot: an expression that reads fine for
 * ascending silently breaks under the mirror.
 */
const logSize = (high: number, low: number): number =>
  Math.abs(Math.log(Math.abs(high)) - Math.log(Math.abs(low)));

/**
 * Greedily keep the largest declines that do not overlap in time with one
 * already kept. A move that has supplied a high and a low is spent — it cannot
 * also supply a pivot for the next pair. That constraint is the whole of the
 * rule, and it is what makes the selection stable.
 */
export const selectDeclines = (
  declines: readonly Decline[],
  count: number,
): Decline[] => {
  const kept: Decline[] = [];
  for (const d of [...declines].sort((x, y) => y.size - x.size)) {
    if (kept.length === count) break;
    if (kept.some((k) => d.from <= k.to && k.from <= d.to)) continue;
    kept.push(d);
  }
  return kept.sort((x, y) => x.from - y.from);
};

/** The six (or four) pivot indices, in time order: H1, L1, H2, L2, H3, L3. */
export const pivotIndices = (selected: readonly Decline[]): number[] =>
  selected.flatMap((d) => [d.from, d.to]);

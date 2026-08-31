import type { Candle } from "../exchange/types";
import { atr } from "./atr";
import type { PatternConfig } from "./config";

export type PivotKind = "high" | "low";

export interface Pivot {
  index: number;
  time: number;
  price: number;
  kind: PivotKind;
}

/**
 * §6.2. Fractal swing detection with an ATR prominence filter.
 *
 * Always uses wick extremes — `high` and `low`, never `close`. The brief is
 * explicit, and a close-based pivot sits inside the bar that actually made the
 * turn.
 */
export const findPivots = (
  candles: readonly Candle[],
  config: PatternConfig,
): Pivot[] => {
  const k = config.pivotStrength;
  const n = candles.length;
  if (n < 2 * k + 1) return [];

  const atrs = atr(candles);
  const raw: Pivot[] = [];

  // A pivot needs k bars on its right to be confirmed, so the last k bars can
  // never hold one. That is what stops the pattern from repainting.
  for (let i = k; i < n - k; i++) {
    if (isExtreme(candles, i, k, "high")) {
      raw.push({
        index: i,
        time: candles[i].time,
        price: candles[i].high,
        kind: "high",
      });
    } else if (isExtreme(candles, i, k, "low")) {
      raw.push({
        index: i,
        time: candles[i].time,
        price: candles[i].low,
        kind: "low",
      });
    }
  }

  return filterByProminence(alternate(raw), atrs, config.minPivotAtr);
};

const isExtreme = (
  candles: readonly Candle[],
  i: number,
  k: number,
  kind: PivotKind,
): boolean => {
  const value = kind === "high" ? candles[i].high : candles[i].low;
  for (let j = i - k; j <= i + k; j++) {
    if (j === i) continue;
    const other = kind === "high" ? candles[j].high : candles[j].low;
    // A tie on the left is not an extreme; a tie on the right is, so a run of
    // equal bars yields exactly one pivot rather than none or several.
    if (
      kind === "high"
        ? other > value || (j < i && other === value)
        : other < value || (j < i && other === value)
    ) {
      return false;
    }
  }
  return true;
};

/**
 * Two highs with no low between them are the same turn seen twice. Keep the
 * higher one; keep the lower of two adjacent lows.
 */
const alternate = (pivots: readonly Pivot[]): Pivot[] => {
  const out: Pivot[] = [];
  for (const p of pivots) {
    const prev = out[out.length - 1];
    if (prev === undefined || prev.kind !== p.kind) {
      out.push(p);
      continue;
    }
    const keepNew =
      p.kind === "high" ? p.price > prev.price : p.price < prev.price;
    if (keepNew) out[out.length - 1] = p;
  }
  return out;
};

/**
 * Prominence is the vertical distance to the adjacent opposite pivots — the
 * **smaller** of the two, as in topographic prominence. Taking the larger
 * keeps every tiny wobble that happens to sit next to a big move, which is
 * exactly the noise this filter exists to remove.
 *
 * Dropping a pivot can leave two of the same kind adjacent, so alternation is
 * re-applied afterwards.
 */
const filterByProminence = (
  pivots: readonly Pivot[],
  atrs: readonly number[],
  minPivotAtr: number,
): Pivot[] => {
  const kept = pivots.filter((p, i) => {
    const before = pivots[i - 1];
    const after = pivots[i + 1];
    const drops = [before, after]
      .filter((q): q is Pivot => q !== undefined)
      .map((q) => Math.abs(p.price - q.price));
    if (drops.length === 0) return true;
    const threshold = minPivotAtr * atrs[p.index];
    return Math.min(...drops) >= threshold;
  });
  return alternate(kept);
};

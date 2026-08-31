import type { Candle } from "../exchange/types";
import type { PatternConfig } from "./config";

export interface Pole {
  index: number;
  time: number;
  price: number;
  /** `(h1 - low(P)) / (h1 - l1)` */
  ratio: number;
  /** worst pullback from the running high, as a fraction of pole height */
  drawdown: number;
  bars: number;
}

/**
 * §6.4. The bullish impulse into H1. Search back from H1 for the start bar
 * that maximises the ratio, subject to two conditions that both matter.
 *
 * Cleanliness is measured as a drawdown from the **running** high. "No low
 * between P and H1 is more than 40% of the way back down the pole" — the
 * obvious reading — rejects every pole ever formed, because the bars just
 * after P are by definition still near the bottom.
 *
 * `minPoleBars` is what makes the §6.3 direction test work. Without it Boeing
 * finds a 4-bar pole in its ascending reading, scoring 1.43 on noise off the
 * COVID low, which beats the real 55-bar descending pole at 1.41 and flips the
 * label.
 *
 * The pole is optional — triangles can be reversal patterns — so `undefined`
 * is a normal result, not a failure.
 */
export const findPole = (
  candles: readonly Candle[],
  h1Index: number,
  l1Price: number,
  config: PatternConfig,
): Pole | undefined => {
  const h1 = candles[h1Index].high;
  const height = h1 - l1Price;
  if (height <= 0) return undefined;

  const earliest = Math.max(0, h1Index - config.maxPoleBars);
  const latest = h1Index - config.minPoleBars;

  let best: Pole | undefined;

  for (let p = earliest; p <= latest; p++) {
    const low = candles[p].low;
    const poleHeight = h1 - low;
    if (poleHeight <= 0) continue;

    const ratio = poleHeight / height;
    if (ratio < config.minPoleRatio) continue;
    if (best !== undefined && ratio <= best.ratio) continue;

    let runningHigh = candles[p].high;
    let worst = 0;
    for (let i = p; i <= h1Index; i++) {
      if (candles[i].high > runningHigh) runningHigh = candles[i].high;
      const drop = (runningHigh - candles[i].low) / poleHeight;
      if (drop > worst) worst = drop;
    }
    if (worst > config.maxPoleDrawdown) continue;

    best = {
      index: p,
      time: candles[p].time,
      price: low,
      ratio,
      drawdown: worst,
      bars: h1Index - p,
    };
  }
  return best;
};

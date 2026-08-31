import { TIMEFRAME_SECONDS, type Candle, type Timeframe } from "./types";

/** PLAN.md §5.3. Below this the detector cannot see six pivots plus a pole. */
export const MIN_CANDLES = 120;

/** How many candles to fetch per timeframe group. */
export const candleLimit = (tf: Timeframe): number => {
  if (tf === "1w") return 500;
  if (tf === "1M" || tf === "3M") return 300;
  return 1000;
};

/**
 * Cache TTL: roughly a third of the bar interval, so a chart is never more
 * than a third of a bar stale. PLAN.md §5.4.
 */
export const cacheTtlSeconds = (tf: Timeframe): number =>
  Math.min(3600, Math.max(60, Math.round(TIMEFRAME_SECONDS[tf] / 3)));

/**
 * Drop the currently forming candle. The pattern engine runs on closed bars
 * only — a pattern that repaints is worse than no pattern at all.
 */
export const dropForming = (candles: readonly Candle[]): Candle[] =>
  candles.length === 0 ? [] : candles.slice(0, -1);

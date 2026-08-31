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
 * A scan fetches a shorter history than the chart does.
 *
 * OKX caps a request at 300 candles, so the chart's 1000 costs four upstream
 * requests per pair — 800 for a 200-pair scan, which no rate limit will
 * tolerate. One page per pair keeps a full scan inside §8.2's budget.
 *
 * The screener looks for patterns forming *now*, at the right-hand edge, and
 * 300 bars is ample for that: the largest window in the sweep is 900, but a
 * pattern needing 900 bars of context is not one that is about to break out.
 * Clicking a row loads the chart, which fetches the full history.
 */
export const scanCandleLimit = (tf: Timeframe): number =>
  Math.min(candleLimit(tf), 300);

/**
 * Drop the currently forming candle. The pattern engine runs on closed bars
 * only — a pattern that repaints is worse than no pattern at all.
 */
export const dropForming = (candles: readonly Candle[]): Candle[] =>
  candles.length === 0 ? [] : candles.slice(0, -1);

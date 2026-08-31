import type { Candle } from "./types";

/**
 * PLAN.md §5.2. Bybit has no `3d` and no `3M` interval, so both are built from
 * the interval below. `open` = first open, `close` = last close, `high` = max,
 * `low` = min, `volume` = sum.
 *
 * OKX needs none of this — it serves every timeframe natively — so this exists
 * for the Bybit adapter and for any future provider with the same gaps.
 */

/** 1970-01-05, the first Monday of the unix epoch. Fixing the anchor is what
 * makes 3-day groups reproducible across calls and across pairs. */
export const EPOCH_MONDAY = 345_600;

const merge = (group: Candle[], time: number): Candle => {
  const first = group[0];
  const last = group[group.length - 1];
  let high = first.high;
  let low = first.low;
  let volume = 0;
  for (const c of group) {
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
    volume += c.volume;
  }
  return { time, open: first.open, high, low, close: last.close, volume };
};

/**
 * Group into fixed-length buckets anchored to `anchor`.
 *
 * A leading group whose first candle does not land exactly on a bucket
 * boundary is dropped: it is missing bars, so its open, high and low are all
 * lies. The trailing group is kept — it is the forming bar, and callers
 * already know the last candle is incomplete.
 */
export const resampleFixed = (
  candles: readonly Candle[],
  bucketSeconds: number,
  anchor: number = EPOCH_MONDAY,
): Candle[] => {
  if (bucketSeconds <= 0) throw new RangeError("bucketSeconds must be > 0");
  const bucketOf = (t: number) =>
    anchor + Math.floor((t - anchor) / bucketSeconds) * bucketSeconds;
  return group(candles, bucketOf);
};

/**
 * Calendar quarters: Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec. Not rolling 3-month
 * windows — those match no charting platform, so a pattern found on one would
 * not exist on anyone's screen.
 */
export const resampleQuarters = (candles: readonly Candle[]): Candle[] =>
  group(candles, (t) => {
    const d = new Date(t * 1000);
    return (
      Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3) / 1000
    );
  });

const group = (
  candles: readonly Candle[],
  bucketOf: (time: number) => number,
): Candle[] => {
  if (candles.length === 0) return [];

  const out: Candle[] = [];
  let bucket = bucketOf(candles[0].time);
  let current: Candle[] = [];

  for (const c of candles) {
    const b = bucketOf(c.time);
    if (b !== bucket) {
      out.push(merge(current, bucket));
      bucket = b;
      current = [];
    }
    current.push(c);
  }
  out.push(merge(current, bucket));

  // The first group is only trustworthy if it starts on its own boundary.
  if (out.length > 0 && candles[0].time !== out[0].time) out.shift();
  return out;
};

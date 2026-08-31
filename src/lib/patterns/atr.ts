import type { Candle } from "../exchange/types";

/**
 * Wilder's ATR, as a value per bar. Index `i` holds the ATR *at* bar `i`.
 *
 * Bars before the period is filled carry the running simple average, so the
 * series is defined everywhere and callers never have to guard an index. The
 * pattern engine uses ATR only as a scale — "is this move big enough to be
 * worth looking at" — so an approximate early value is harmless and a hole is
 * not.
 */
export const atr = (candles: readonly Candle[], period = 14): number[] => {
  const out = new Array<number>(candles.length).fill(0);
  if (candles.length === 0) return out;

  let sum = 0;
  let prev = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const tr =
      i === 0
        ? c.high - c.low
        : Math.max(
            c.high - c.low,
            Math.abs(c.high - candles[i - 1].close),
            Math.abs(c.low - candles[i - 1].close),
          );

    if (i < period) {
      sum += tr;
      prev = sum / (i + 1);
    } else {
      prev = (prev * (period - 1) + tr) / period;
    }
    out[i] = prev;
  }
  return out;
};

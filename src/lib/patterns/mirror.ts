import type { Candle } from "../exchange/types";

/**
 * §6.1. A descending triangle is an ascending triangle on a vertically
 * flipped chart, so the detector is written once, for ascending only, and
 * descending is found by running it on a mirrored series.
 *
 * Note the high/low swap: negating a candle turns its high into its low.
 * Any bug fixed in the ascending path is fixed for descending by
 * construction, which the §12 property test exists to guarantee.
 */
export const mirror = (c: Candle): Candle => ({
  time: c.time,
  open: -c.open,
  close: -c.close,
  high: -c.low,
  low: -c.high,
  volume: c.volume,
});

export const mirrorSeries = (candles: readonly Candle[]): Candle[] =>
  candles.map(mirror);

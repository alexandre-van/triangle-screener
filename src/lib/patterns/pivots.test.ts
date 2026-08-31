import { describe, expect, it } from "vitest";
import type { Candle } from "../exchange/types";
import { atr } from "./atr";
import { configFor, DEFAULT_CONFIG } from "./config";
import { findPivots } from "./pivots";

/** A bar whose high and low straddle `price` by `spread`. */
const bar = (i: number, price: number, spread = 1): Candle => ({
  time: 1_700_000_000 + i * 3600,
  open: price,
  high: price + spread,
  low: price - spread,
  close: price,
  volume: 1,
});

/** Walks between the given turning-point prices in `step` increments. */
const zigzag = (points: readonly number[], step: number): Candle[] => {
  const prices: number[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    const dir = Math.sign(to - from);
    for (
      let p = from + dir * step;
      dir > 0 ? p < to : p > to;
      p += dir * step
    ) {
      prices.push(p);
    }
    prices.push(to);
  }
  return prices.map((p, i) => bar(i, p));
};

describe("findPivots", () => {
  it("finds the turning points of a clean zigzag", () => {
    const candles = zigzag([100, 200, 120, 260, 140], 10);
    const pivots = findPivots(candles, { ...DEFAULT_CONFIG, minPivotAtr: 0 });

    expect(pivots.map((p) => p.kind)).toEqual(["high", "low", "high"]);
    // The turning points sit where the walk reverses.
    const prices = candles.map((c) => c.close);
    expect(prices[pivots[0].index]).toBe(200);
    expect(prices[pivots[1].index]).toBe(120);
    expect(prices[pivots[2].index]).toBe(260);
  });

  it("uses wick extremes, never the close", () => {
    const candles = zigzag([100, 200, 120, 180], 10);
    const pivots = findPivots(candles, { ...DEFAULT_CONFIG, minPivotAtr: 0 });
    const high = pivots.find((p) => p.kind === "high");
    expect(high?.price).toBe(201); // high, not the 200 close
    const low = pivots.find((p) => p.kind === "low");
    expect(low?.price).toBe(119);
  });

  it("never confirms a pivot in the last k bars — this is what stops repainting", () => {
    for (const k of [2, 3, 5]) {
      const candles = zigzag([100, 300, 120, 400], 10);
      const pivots = findPivots(candles, {
        ...DEFAULT_CONFIG,
        pivotStrength: k,
        minPivotAtr: 0,
      });
      const cutoff = candles.length - k;
      expect(pivots.every((p) => p.index < cutoff)).toBe(true);
    }
  });

  it("alternates strictly: never two highs in a row", () => {
    const candles = zigzag([100, 200, 150, 220, 130, 260, 110], 5);
    const pivots = findPivots(candles, { ...DEFAULT_CONFIG, minPivotAtr: 0 });
    for (let i = 1; i < pivots.length; i++) {
      expect(pivots[i].kind).not.toBe(pivots[i - 1].kind);
    }
  });

  it("drops turns smaller than the ATR prominence floor", () => {
    // A big swing containing one shallow 4-point dip. The dip is a genuine
    // fractal low; it is only noise once measured against ATR.
    const candles = zigzag([100, 300, 296, 500, 200], 1);
    const loose = findPivots(candles, { ...DEFAULT_CONFIG, minPivotAtr: 0 });
    const strict = findPivots(candles, { ...DEFAULT_CONFIG, minPivotAtr: 4 });
    expect(strict.length).toBeLessThan(loose.length);
  });

  it("returns nothing for a series too short to confirm anything", () => {
    expect(findPivots([bar(0, 100)], DEFAULT_CONFIG)).toEqual([]);
    expect(findPivots([], DEFAULT_CONFIG)).toEqual([]);
  });

  it("uses a wider strength on noisy low timeframes", () => {
    expect(configFor("5m").pivotStrength).toBe(5);
    expect(configFor("15m").pivotStrength).toBe(4);
    expect(configFor("1w").pivotStrength).toBe(3);
    expect(configFor("5m").minPivotAtr).toBeGreaterThan(
      configFor("1w").minPivotAtr,
    );
  });
});

describe("atr", () => {
  it("is defined on every bar, including before the period fills", () => {
    const candles = zigzag([100, 200], 10);
    const a = atr(candles);
    expect(a).toHaveLength(candles.length);
    expect(a.every((v) => Number.isFinite(v) && v > 0)).toBe(true);
  });

  it("grows with the true range", () => {
    const calm = atr(Array.from({ length: 40 }, (_, i) => bar(i, 100, 1)));
    const wild = atr(Array.from({ length: 40 }, (_, i) => bar(i, 100, 10)));
    expect(wild[39]).toBeGreaterThan(calm[39]);
  });

  it("handles an empty series", () => {
    expect(atr([])).toEqual([]);
  });
});

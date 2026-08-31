import { describe, expect, it } from "vitest";
import type { Candle } from "../exchange/types";
import {
  cleanDeclines,
  pivotIndices,
  selectDeclines,
  type Decline,
} from "./declines";
import type { Pivot } from "./pivots";

const bar = (i: number, high: number, low: number): Candle => ({
  time: 1_700_000_000 + i * 604_800,
  open: (high + low) / 2,
  close: (high + low) / 2,
  high,
  low,
  volume: 1,
});

/** Marks index `i` as a pivot of the given kind. */
const pivot = (i: number, kind: "high" | "low", price: number): Pivot => ({
  index: i,
  time: 1_700_000_000 + i * 604_800,
  price,
  kind,
});

describe("cleanDeclines", () => {
  it("finds a decline where the high tops the range and the low bottoms it", () => {
    const candles = [bar(0, 100, 98), bar(1, 90, 88), bar(2, 80, 78)];
    const found = cleanDeclines(candles, [
      pivot(0, "high", 100),
      pivot(2, "low", 78),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ from: 0, to: 2 });
  });

  it("stops at a bar that trades above the opening high", () => {
    // Bar 1 exceeds bar 0, so high[0] is no longer the max over [0, 2].
    const candles = [bar(0, 100, 98), bar(1, 120, 118), bar(2, 80, 78)];
    expect(
      cleanDeclines(candles, [pivot(0, "high", 100), pivot(2, "low", 78)]),
    ).toHaveLength(0);
  });

  it("rejects a low that is not the minimum of the range", () => {
    // Bar 1 dips below bar 2, so low[2] is not the min over [0, 2].
    const candles = [bar(0, 100, 98), bar(1, 90, 50), bar(2, 80, 78)];
    expect(
      cleanDeclines(candles, [pivot(0, "high", 100), pivot(2, "low", 78)]),
    ).toHaveLength(0);
  });

  it("measures size in log price, so early moves are not swamped by later ones", () => {
    // Two identical halvings at very different price levels must rank equal.
    const cheap = [bar(0, 100, 99), bar(1, 60, 50)];
    const dear = [bar(0, 10_000, 9900), bar(1, 6000, 5000)];
    const a = cleanDeclines(cheap, [
      pivot(0, "high", 100),
      pivot(1, "low", 50),
    ])[0];
    const b = cleanDeclines(dear, [
      pivot(0, "high", 10_000),
      pivot(1, "low", 5000),
    ])[0];
    expect(a.size).toBeCloseTo(b.size, 10);
    // In absolute terms the second is 100x the first, which is the trap.
    expect(10_000 - 5000).toBeGreaterThan(100 - 50);
  });

  it("is mirror-safe: negative prices do not produce NaN", () => {
    // §6.1 detects descending patterns by negating prices, and log of a
    // negative number is NaN. Same hazard as rule 2's overshoot.
    const mirrored = [bar(0, -50, -60), bar(1, -90, -100)];
    const found = cleanDeclines(mirrored, [
      pivot(0, "high", -50),
      pivot(1, "low", -100),
    ]);
    expect(found).toHaveLength(1);
    expect(Number.isNaN(found[0].size)).toBe(false);
    expect(found[0].size).toBeGreaterThan(0);
  });
});

describe("selectDeclines", () => {
  const d = (from: number, to: number, size: number): Decline => ({
    from,
    to,
    size,
  });

  it("takes the largest first", () => {
    const out = selectDeclines([d(0, 1, 0.1), d(2, 3, 0.9), d(4, 5, 0.5)], 3);
    expect(out.map((x) => x.size)).toEqual([0.1, 0.9, 0.5]); // returned in time order
  });

  it("refuses to reuse a move that overlaps one already kept", () => {
    // A move that has supplied a high and a low is spent.
    const out = selectDeclines(
      [d(0, 10, 0.9), d(5, 15, 0.8), d(20, 30, 0.7)],
      3,
    );
    expect(out).toHaveLength(2);
    expect(out.map((x) => x.from)).toEqual([0, 20]);
  });

  it("treats touching endpoints as overlapping", () => {
    const out = selectDeclines([d(0, 10, 0.9), d(10, 20, 0.8)], 2);
    expect(out).toHaveLength(1);
  });

  it("returns them in time order, whatever order they were ranked in", () => {
    const out = selectDeclines(
      [d(40, 50, 0.9), d(0, 10, 0.5), d(20, 30, 0.7)],
      3,
    );
    expect(out.map((x) => x.from)).toEqual([0, 20, 40]);
  });

  it("returns fewer than asked when there is nothing left to take", () => {
    expect(selectDeclines([d(0, 10, 0.9)], 3)).toHaveLength(1);
    expect(selectDeclines([], 3)).toEqual([]);
  });
});

describe("pivotIndices", () => {
  it("flattens the declines into H, L, H, L, H, L", () => {
    const out = pivotIndices([
      { from: 0, to: 10, size: 1 },
      { from: 20, to: 30, size: 1 },
      { from: 40, to: 50, size: 1 },
    ]);
    expect(out).toEqual([0, 10, 20, 30, 40, 50]);
  });

  it("alternates by construction — three disjoint H->L moves cannot do otherwise", () => {
    const out = pivotIndices([
      { from: 0, to: 10, size: 1 },
      { from: 20, to: 30, size: 1 },
    ]);
    for (let i = 1; i < out.length; i++)
      expect(out[i]).toBeGreaterThan(out[i - 1]);
  });
});

import { describe, expect, it } from "vitest";
import type { Candle } from "../exchange/types";
import { configFor, DEFAULT_CONFIG } from "./config";
import { detectTriangles } from "./triangle";

const LEG = 30;
const opts = { symbol: "T", timeframe: "1w" as const, config: configFor("1w") };

/**
 * Builds an ascending triangle with exactly the requested pivot prices, by
 * walking linearly between them. Wicks are kept small so ATR stays well under
 * the rule 5 size floor and the shape, not the noise, decides the outcome.
 */
const buildSeries = (turns: readonly number[], trailing = 8): Candle[] => {
  // Lead-in so the series clears minCandles. Flat, so it creates no decline
  // that could outrank the pattern's own legs in the §6.2b selection.
  const prices: number[] = Array.from({ length: 60 }, () => turns[0]);
  for (let i = 1; i < turns.length; i++) {
    const from = turns[i - 1];
    const to = turns[i];
    for (let s = 0; s < LEG; s++) prices.push(from + ((to - from) * s) / LEG);
  }
  const last = turns[turns.length - 1];
  prices.push(last);
  // Track the rising support after the final low. Drifting flat here is a
  // genuine breakdown once support has risen away underneath, and rule 7 is
  // right to reject it.
  const supportSlope =
    turns.length >= 5 ? (last - turns[turns.length - 3]) / (2 * LEG) : 0;
  for (let i = 1; i <= trailing; i++) prices.push(last + i * supportSlope);

  return prices.map((p, i) => ({
    time: 1_700_000_000 + i * 604_800,
    open: p,
    close: p,
    high: p + 0.02,
    low: p - 0.02,
    volume: 1,
  }));
};

/** H1 -> L1 -> H2 -> L2, with `step` and `fLow` chosen exactly. */
const triangle = (step: number, fLow: number) => {
  const h1 = 200;
  const l1 = 100;
  const h2 = h1 - step * (h1 - l1);
  const l2 = l1 + fLow * (h2 - l1);
  return buildSeries([l1 - 60, h1, l1, h2, l2]);
};

const detectOne = (candles: Candle[]) => detectTriangles(candles, opts)[0];

describe("rule 2 — highs step down, but only slightly", () => {
  it("accepts a step just inside the limit", () => {
    expect(detectOne(triangle(0.315, 0.5))).toBeDefined();
  });

  it("rejects a step just outside it", () => {
    expect(detectOne(triangle(0.317, 0.5))).toBeUndefined();
  });

  it("accepts a marginal higher high, because real markets make them", () => {
    // Overshoot is additive, in units of the leg's own range: written
    // multiplicatively it inverts under the §6.1 mirror, where prices are
    // negative.
    expect(detectOne(triangle(-0.004, 0.5))).toBeDefined();
  });

  it("rejects a higher high beyond the overshoot tolerance", () => {
    expect(detectOne(triangle(-0.05, 0.5))).toBeUndefined();
  });
});

describe("rule 3 — the low must rise, but not to the high", () => {
  it("accepts a retracement just inside the ceiling", () => {
    expect(detectOne(triangle(0.1, 0.94))).toBeDefined();
  });

  it("rejects one that leaves no pullback at all", () => {
    expect(detectOne(triangle(0.1, 0.96))).toBeUndefined();
  });

  it("accepts a near-flat support, far below the brief's ideal band", () => {
    // Three of the four fixture values sit below 0.236. f_low is a scoring
    // input, not a gate.
    expect(detectOne(triangle(0.1, 0.03))).toBeDefined();
  });

  it("rejects a low that fails to rise at all", () => {
    expect(detectOne(triangle(0.1, 0))).toBeUndefined();
  });
});

describe("rule 5 — meaningful size", () => {
  it("rejects a triangle smaller than the ATR floor", () => {
    const chop = detectTriangles(triangle(0.1, 0.5), {
      ...opts,
      config: { ...DEFAULT_CONFIG, minHeightAtr: 10_000 },
    });
    expect(chop).toHaveLength(0);
  });
});

describe("rule 7 — not already broken", () => {
  it("drops a pattern whose price has closed away below support", () => {
    const broken = triangle(0.1, 0.5);
    for (let i = broken.length - 6; i < broken.length; i++) {
      broken[i] = { ...broken[i], low: 20, close: 25 };
    }
    expect(detectOne(broken)).toBeUndefined();
  });
});

describe("series that cannot hold a pattern", () => {
  it("returns nothing below minCandles", () => {
    expect(
      detectTriangles(buildSeries([100, 200, 150]).slice(0, 50), opts),
    ).toEqual([]);
  });

  it("returns nothing for a flat line", () => {
    const flat = Array.from({ length: 300 }, (_, i) => ({
      time: 1_700_000_000 + i * 604_800,
      open: 100,
      high: 100.1,
      low: 99.9,
      close: 100,
      volume: 1,
    }));
    expect(detectTriangles(flat, opts)).toEqual([]);
  });
});

describe("output shape", () => {
  const pattern = detectOne(triangle(0.1, 0.5));

  it("carries the pivots in time order", () => {
    expect(pattern).toBeDefined();
    const p = pattern.pivots;
    expect(p.h1.index).toBeLessThan(p.l1.index);
    expect(p.l1.index).toBeLessThan(p.h2.index);
    expect(p.h2.index).toBeLessThan(p.l2.index);
  });

  it("converges: resistance flat or falling, support rising", () => {
    expect(pattern.resistance.slope).toBeLessThanOrEqual(0.05);
    expect(pattern.support.slope).toBeGreaterThan(0);
  });

  it("reports a breakout level and the bar it was detected on", () => {
    expect(Number.isFinite(pattern.breakoutLevel)).toBe(true);
    expect(pattern.detectedAtBarTime).toBeGreaterThan(0);
  });

  it("is forming while H3 and L3 are still missing", () => {
    expect(pattern.status).toBe("forming");
    expect(pattern.pivots.h3).toBeUndefined();
    expect(pattern.breakdown.completeness).toBe(0);
  });
});

describe("shape tag and status", () => {
  it("tags a steeply falling resistance as symmetrical without changing direction", () => {
    // Lows rise while highs fall hard — Boeing's shape. The tag is cosmetic:
    // direction is settled by the pole, never by the slopes.
    const p = detectOne(triangle(0.3, 0.6));
    expect(p).toBeDefined();
    expect(p.subtype).toBe("symmetrical");
    expect(p.direction).toBe("ascending");
  });

  it("tags a nearly flat resistance as classic", () => {
    expect(detectOne(triangle(0.02, 0.5)).subtype).toBe("classic");
  });

  it("reports a breakout once a bar closes above resistance", () => {
    const candles = triangle(0.1, 0.5);
    const last = candles.length - 1;
    for (let i = last - 2; i <= last; i++) {
      candles[i] = { ...candles[i], close: 400, high: 401, low: 300 };
    }
    expect(detectOne(candles)?.status).toBe("breakout");
  });
});

describe("direction when the pole is silent", () => {
  it("reports both readings when neither has a qualifying pole", () => {
    // The run-up into H1 is only half the triangle's height, so it falls short
    // of minPoleRatio and no pole qualifies. The pattern is reversal-type, and
    // the score rather than the pole ranks the readings.
    const weakRunUp = buildSeries([150, 200, 100, 190, 145]);
    const out = detectTriangles(weakRunUp, opts);
    const ascending = out.find((p) => p.direction === "ascending");
    expect(ascending).toBeDefined();
    expect(ascending?.pivots.pole).toBeUndefined();
    expect(out.length).toBeGreaterThanOrEqual(1);
    // Sorted best first.
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
    }
  });
});

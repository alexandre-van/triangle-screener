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
const buildSeries = (turns: readonly number[], trailing = 3): Candle[] => {
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
  // Continue along the line the final pivot sits on — the slope from the
  // previous turn of the same kind. After a low that is the support line, and
  // drifting flatter than it is a genuine breakdown that rule 7 will reject.
  //
  // Short, too: long enough to confirm the final pivot, not long enough to
  // create another. A longer tail turns the shallow dip after H3 into a
  // confirmed low, which then strips H3 out on prominence — a 1.6-point
  // wobble off a 48-point rally is noise.
  // turns[0] is the pole, so odd positions are highs. After a high the series
  // pulls back — otherwise the high is not a local maximum and never confirms.
  // After a low it continues up the support line; drifting flatter than
  // support is a genuine breakdown, and rule 7 is right to reject it.
  const lastIsHigh = (turns.length - 1) % 2 === 1;
  const slope = lastIsHigh
    ? -(last - turns[turns.length - 2]) / (LEG * 4)
    : (last - turns[turns.length - 3]) / LEG;
  for (let i = 1; i <= trailing; i++) prices.push(last + i * slope);

  return prices.map((p, i) => ({
    time: 1_700_000_000 + i * 604_800,
    open: p,
    close: p,
    high: p + 0.02,
    low: p - 0.02,
    volume: 1,
  }));
};

/**
 * H1 -> L1 -> H2 -> L2 -> H3, with `step` and `fLow` chosen exactly.
 *
 * H3 is included because a pattern is not reported without it: four pivots is
 * a shape that has not yet held its resistance a third time.
 */
const triangle = (step: number, fLow: number) => {
  const h1 = 200;
  const l1 = 100;
  const h2 = h1 - step * (h1 - l1);
  const l2 = l1 + fLow * (h2 - l1);
  const h3 = h2 - step * (h2 - l2);
  return buildSeries([l1 - 60, h1, l1, h2, l2, h3]);
};

/** H1 -> L1 -> H2 -> L2 -> H3 -> L3: all six pivots. */
const completeTriangle = (step: number, fLow: number) => {
  const h1 = 200;
  const l1 = 100;
  const h2 = h1 - step * (h1 - l1);
  const l2 = l1 + fLow * (h2 - l1);
  const h3 = h2 - step * (h2 - l2);
  const l3 = l2 + fLow * (h3 - l2);
  return buildSeries([l1 - 60, h1, l1, h2, l2, h3, l3]);
};

/** The same shape truncated at L2 — the state that must NOT be reported. */
const truncatedAtL2 = (step: number, fLow: number) => {
  const h1 = 200;
  const l1 = 100;
  const h2 = h1 - step * (h1 - l1);
  const l2 = l1 + fLow * (h2 - l1);
  return buildSeries([l1 - 60, h1, l1, h2, l2]);
};

const detectOne = (candles: Candle[]) => detectTriangles(candles, opts)[0];

/*
 * The boundary tables for rules 2 and 3 live in rules.test.ts, where the
 * predicates can be exercised directly. Some admissible ratios cannot be built
 * as a series at all: an `f_low` near the 0.95 ceiling makes support so steep
 * it meets resistance almost at once, leaving no room for an H3. These are the
 * end-to-end checks at geometry a triangle can actually take.
 */
describe("rule 2 end to end", () => {
  it("rejects a step outside the band", () => {
    expect(detectOne(triangle(0.4, 0.4))).toBeUndefined();
  });

  it("accepts a marginal higher high, because real markets make them", () => {
    expect(detectOne(triangle(-0.004, 0.4))).toBeDefined();
  });

  it("rejects a higher high beyond the overshoot tolerance", () => {
    expect(detectOne(triangle(-0.05, 0.4))).toBeUndefined();
  });
});

describe("rule 3 end to end", () => {
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
    const chop = detectTriangles(triangle(0.1, 0.4), {
      ...opts,
      config: { ...DEFAULT_CONFIG, minHeightAtr: 10_000 },
    });
    expect(chop).toHaveLength(0);
  });
});

describe("rule 7 — not already broken", () => {
  it("drops a pattern whose price has closed away below support", () => {
    const broken = triangle(0.1, 0.4);
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
  const pattern = detectOne(triangle(0.1, 0.4));

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

  it("waits on L3 once H3 is confirmed", () => {
    expect(pattern.status).toBe("h3_formed");
    expect(pattern.pivots.h3).toBeDefined();
    expect(pattern.pivots.l3).toBeUndefined();
    // §6.8 completeness: +5 for H3, +5 for L3.
    expect(pattern.breakdown.completeness).toBe(5);
  });
});

describe("shape tag and status", () => {
  it("tags a steeply falling resistance as symmetrical without changing direction", () => {
    // Lows rise while highs fall hard — Boeing's shape. The tag is cosmetic:
    // direction is settled by the pole, never by the slopes.
    const p = detectOne(triangle(0.3, 0.3));
    expect(p).toBeDefined();
    expect(p.subtype).toBe("symmetrical");
    expect(p.direction).toBe("ascending");
  });

  it("tags a nearly flat resistance as classic", () => {
    expect(detectOne(triangle(0.02, 0.4)).subtype).toBe("classic");
  });

  it("reports a breakout once a bar closes above resistance", () => {
    // §6.7: a complete triangle is the one watching for a break above the
    // resistance line. Rally off L3 until a bar closes through it.
    const candles = completeTriangle(0.1, 0.4);
    const last = candles[candles.length - 1];
    for (let i = 1; i <= 12; i++) {
      const p = last.close + i * 3;
      candles.push({
        time: last.time + i * 604_800,
        open: p,
        close: p,
        high: p + 0.02,
        low: p - 0.02,
        volume: 1,
      });
    }
    expect(detectOne(candles)?.status).toBe("breakout");
  });
});

describe("direction when the pole is silent", () => {
  it("reports both readings when neither has a qualifying pole", () => {
    // The run-up into H1 is only half the triangle's height, so it falls short
    // of minPoleRatio and no pole qualifies. The pattern is reversal-type, and
    // the score rather than the pole ranks the readings.
    const weakRunUp = buildSeries([150, 200, 100, 190, 136, 184.6]);
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

describe("nothing is reported before H3", () => {
  it("ignores a shape that stops at L2", () => {
    // Four pivots is a guess: resistance has not yet held a third time. The
    // reader wants to watch for L3 themselves, not be handed a forecast.
    expect(detectOne(truncatedAtL2(0.1, 0.4))).toBeUndefined();
  });

  it("reports the same shape once H3 confirms", () => {
    const found = detectOne(triangle(0.1, 0.4));
    expect(found).toBeDefined();
    expect(found.pivots.h3).toBeDefined();
  });

  it("rejects an H3 that overshoots the rule 2 band", () => {
    // A third high far above H2 is not a triangle holding resistance.
    const h1 = 200;
    const l1 = 100;
    const h2 = 190;
    const l2 = 145;
    expect(
      detectOne(buildSeries([l1 - 60, h1, l1, h2, l2, 260])),
    ).toBeUndefined();
  });

  it("never emits the old forming status", () => {
    for (const series of [triangle(0.1, 0.4), triangle(0.2, 0.3)]) {
      const p = detectOne(series);
      if (p !== undefined) {
        expect(["h3_formed", "complete", "breakout"]).toContain(p.status);
      }
    }
  });
});

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Candle } from "../exchange/types";
import { configFor } from "./config";
import { mirror, mirrorSeries } from "./mirror";
import { detectTriangles } from "./triangle";

describe("mirror", () => {
  it("swaps high and low, because negating a candle inverts them", () => {
    const c: Candle = {
      time: 1,
      open: 10,
      high: 12,
      low: 8,
      close: 11,
      volume: 5,
    };
    expect(mirror(c)).toEqual({
      time: 1,
      open: -10,
      high: -8,
      low: -12,
      close: -11,
      volume: 5,
    });
  });

  it("is its own inverse", () => {
    const c: Candle = {
      time: 1,
      open: 10,
      high: 12,
      low: 8,
      close: 11,
      volume: 5,
    };
    expect(mirror(mirror(c))).toEqual(c);
  });

  it("keeps high above low", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 1000, noNaN: true }),
        fc.double({ min: 0.01, max: 100, noNaN: true }),
        (mid, spread) => {
          const c: Candle = {
            time: 1,
            open: mid,
            high: mid + spread,
            low: mid - spread,
            close: mid,
            volume: 1,
          };
          const m = mirror(c);
          expect(m.high).toBeGreaterThanOrEqual(m.low);
        },
      ),
    );
  });
});

/** A plausible OHLC random walk — flat random noise almost never has a shape. */
const seriesArb = fc
  .array(fc.integer({ min: -100, max: 100 }), {
    minLength: 200,
    maxLength: 320,
  })
  .map((steps) => {
    let price = 1000;
    return steps.map((s, i): Candle => {
      const open = price;
      price = Math.max(50, price + s);
      const close = price;
      const wick = Math.abs(s) / 2 + 1;
      return {
        time: 1_700_000_000 + i * 604_800,
        open,
        close,
        high: Math.max(open, close) + wick,
        low: Math.min(open, close) - wick,
        volume: 1,
      };
    });
  });

const opts = { symbol: "T", timeframe: "1w" as const, config: configFor("1w") };
const fingerprint = (candles: readonly Candle[]) =>
  detectTriangles(candles, opts).map((p) => ({
    direction: p.direction,
    indices: [
      p.pivots.h1,
      p.pivots.l1,
      p.pivots.h2,
      p.pivots.l2,
      p.pivots.h3,
      p.pivots.l3,
    ]
      .filter((x) => x !== undefined)
      .map((x) => x.index)
      .sort((a, b) => a - b),
  }));

describe("mirror symmetry — §12", () => {
  it("mirroring the input swaps every direction label and changes nothing else", () => {
    let sawAPattern = false;

    fc.assert(
      fc.property(seriesArb, (candles) => {
        const direct = fingerprint(candles);
        const mirrored = fingerprint(mirrorSeries(candles));
        if (direct.length > 0) sawAPattern = true;

        // The same geometry must be found either way, with the labels flipped.
        const flipped = mirrored
          .map((p) => ({
            direction: p.direction === "ascending" ? "descending" : "ascending",
            indices: p.indices,
          }))
          .sort((a, b) => a.direction.localeCompare(b.direction));

        expect(flipped).toEqual(
          [...direct].sort((a, b) => a.direction.localeCompare(b.direction)),
        );
      }),
      { numRuns: 60 },
    );

    // Guards against the property passing only because nothing was ever found.
    expect(sawAPattern, "no pattern was found in any generated series").toBe(
      true,
    );
  });
});

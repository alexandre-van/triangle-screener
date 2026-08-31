import { describe, expect, it } from "vitest";
import { configFor } from "./config";
import { detectTriangles, type TrianglePattern } from "./triangle";
import {
  BOEING_PIVOTS,
  dateOf,
  HERMES_PIVOTS,
  indexOfDate,
  loadFixture,
} from "./__fixtures__/load";

/**
 * PLAN.md §7. The two hand-verified examples from the brief are the
 * calibration targets. If they fail, tune `config.ts` — never special-case
 * them inside the detector.
 *
 * The windows are padded around the pattern rather than run over the whole
 * series, which is how §6.2b's selection is specified to be used: the three
 * largest declines in a 25-year window are correctly somewhere else. The
 * tolerance is wide — both patterns survive hundreds of bars of padding — so
 * these paddings are not load-bearing.
 */
const detect = (
  file: string,
  pivots: readonly string[],
  padBefore: number,
  padAfter: number,
): { pattern: TrianglePattern; dates: string[] } => {
  const all = loadFixture(file);
  const first = indexOfDate(all, pivots[0]);
  const last = indexOfDate(all, pivots[5]);
  const series = all.slice(
    Math.max(0, first - padBefore),
    Math.min(all.length, last + padAfter),
  );

  const found = detectTriangles(series, {
    symbol: file,
    timeframe: "1w",
    config: configFor("1w"),
  });
  expect(found.length).toBeGreaterThan(0);
  const pattern = found[0];
  const dates = [
    pattern.pivots.h1,
    pattern.pivots.l1,
    pattern.pivots.h2,
    pattern.pivots.l2,
    pattern.pivots.h3,
    pattern.pivots.l3,
  ]
    .filter((p) => p !== undefined)
    .map((p) => dateOf(p.time))
    .sort();
  return { pattern, dates };
};

describe("Hermès (RMS), weekly — ascending", () => {
  const { pattern, dates } = detect("rms-weekly", HERMES_PIVOTS, 120, 60);

  it("recovers all six pivots from the brief", () => {
    expect(dates).toEqual([...HERMES_PIVOTS].sort());
  });

  it("reads as ascending", () => {
    expect(pattern.direction).toBe("ascending");
  });

  it("scores at least 70", () => {
    expect(pattern.score).toBeGreaterThanOrEqual(70);
  });

  it("earns no pole points — its impulse is clipped by the start of the data", () => {
    // Yahoo's RMS.PA history begins 2000-01-03 and H1 sits at bar 44, so the
    // run-up into H1 is cut off. Hermès reads as a reversal-type triangle.
    expect(pattern.pivots.pole).toBeUndefined();
  });
});

describe("Boeing (BA), weekly — descending", () => {
  const { pattern, dates } = detect("ba-weekly", BOEING_PIVOTS, 120, 20);

  it("recovers all six pivots from the brief", () => {
    expect(dates).toEqual([...BOEING_PIVOTS].sort());
  });

  it("reads as descending, decided by the pole and not by the slopes", () => {
    expect(pattern.direction).toBe("descending");
    // On slopes alone it reads symmetrical — lows rise 89 -> 113 -> 129 while
    // highs fall 279 -> 268 -> 254. The shape tag never overrides direction.
    expect(pattern.subtype).toBe("symmetrical");
  });

  it("leans on the pre-737-MAX decline from 2019", () => {
    expect(pattern.pivots.pole).toBeDefined();
    expect(dateOf(pattern.pivots.pole?.time ?? 0)).toBe("2019-02-25");
  });

  it("scores at least 70", () => {
    expect(pattern.score).toBeGreaterThanOrEqual(70);
  });
});

describe("window tolerance", () => {
  it("recovers Hermès across a range of paddings", () => {
    for (const [before, after] of [
      [80, 40],
      [120, 60],
      [200, 60],
      [300, 100],
    ]) {
      const { dates } = detect("rms-weekly", HERMES_PIVOTS, before, after);
      expect(dates, `padding ${before}/${after}`).toEqual(
        [...HERMES_PIVOTS].sort(),
      );
    }
  });

  it("recovers Boeing across a range of paddings", () => {
    for (const [before, after] of [
      [60, 20],
      [120, 20],
    ]) {
      const { dates } = detect("ba-weekly", BOEING_PIVOTS, before, after);
      expect(dates, `padding ${before}/${after}`).toEqual(
        [...BOEING_PIVOTS].sort(),
      );
    }
  });
});

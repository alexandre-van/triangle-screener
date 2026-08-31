import { describe, expect, it } from "vitest";
import { configFor } from "@/lib/patterns/config";
import { detectTriangles } from "@/lib/patterns/triangle";
import {
  BOEING_PIVOTS,
  dateOf,
  HERMES_PIVOTS,
  indexOfDate,
  loadFixture,
} from "@/lib/patterns/__fixtures__/load";
import { pivotMarkers } from "./pivotMarkers";

const fixture = (file: string, want: readonly string[]) => {
  const all = loadFixture(file);
  const first = indexOfDate(all, want[0]);
  const last = indexOfDate(all, want[5]);
  const series = all.slice(
    Math.max(0, first - 120),
    Math.min(all.length, last + 40),
  );
  return detectTriangles(series, {
    symbol: file,
    timeframe: "1w",
    config: configFor("1w"),
  })[0];
};

describe("pivotMarkers", () => {
  it("labels an ascending pattern H1, L1, H2, L2, H3, L3 in time order", () => {
    const markers = pivotMarkers(fixture("rms-weekly", HERMES_PIVOTS));
    expect(markers.map((m) => m.label)).toEqual([
      "H1",
      "L1",
      "H2",
      "L2",
      "H3",
      "L3",
    ]);
    expect(markers.map((m) => dateOf(m.pivot.time))).toEqual([
      ...HERMES_PIVOTS,
    ]);
  });

  it("labels a descending pattern L1, H1, L2, H2, L3, H3 — the low comes first", () => {
    // §6.9. Labelling by position alone would print H1 on Boeing's 2020 low.
    const markers = pivotMarkers(fixture("ba-weekly", BOEING_PIVOTS));
    expect(markers.map((m) => m.label)).toEqual([
      "L1",
      "H1",
      "L2",
      "H2",
      "L3",
      "H3",
    ]);
    expect(markers.map((m) => dateOf(m.pivot.time))).toEqual([
      ...BOEING_PIVOTS,
    ]);
  });

  it("puts every H label above its marker and every L label below", () => {
    for (const markers of [
      pivotMarkers(fixture("rms-weekly", HERMES_PIVOTS)),
      pivotMarkers(fixture("ba-weekly", BOEING_PIVOTS)),
    ]) {
      for (const m of markers) {
        expect(m.side).toBe(m.label.startsWith("H") ? "above" : "below");
      }
    }
  });

  it("labels a high above a low, whichever direction the pattern reads", () => {
    // A sanity check that the labels describe the geometry: every H marker's
    // price sits above every L marker's price at the same index or later.
    const markers = pivotMarkers(fixture("ba-weekly", BOEING_PIVOTS));
    const highs = markers.filter((m) => m.label.startsWith("H"));
    const lows = markers.filter((m) => m.label.startsWith("L"));
    expect(Math.min(...highs.map((m) => m.pivot.price))).toBeGreaterThan(
      Math.max(...lows.map((m) => m.pivot.price)),
    );
  });

  it("omits H3 and L3 while a pattern is still forming", () => {
    const forming = {
      ...fixture("rms-weekly", HERMES_PIVOTS),
      pivots: {
        ...fixture("rms-weekly", HERMES_PIVOTS).pivots,
        h3: undefined,
        l3: undefined,
      },
    };
    expect(pivotMarkers(forming).map((m) => m.label)).toEqual([
      "H1",
      "L1",
      "H2",
      "L2",
    ]);
  });
});
